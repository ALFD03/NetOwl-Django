"""`MetricsAnalyzer`: el analisis mensual de churn de punta a punta.

Orquesta a los otros modulos del paquete (carga, limpieza, reglas, metricas y
dimensiones) y separa a proposito el **calculo** de la **persistencia**: asi el
mismo analyzer, con una sola lectura de datos, sirve para el cierre del mes y
para el corte acumulado de cada uno de sus dias (ver `day_metrics`).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from core.config import ACTIVE_STATE, FREE_STATE, INACTIVE_STATES
from core.database import DBConnector
from core.models import Period
from core.tables import replace

from .. import tables
from . import cleaner, dimensions, loader, metrics_calc, rules


class MetricsAnalyzer:
    """Calcula las metricas de churn de un periodo sobre el historico de logs.

    Uso normal:

        analyzer = MetricsAnalyzer(db, periodo)
        analyzer.run()

    `run()` carga, limpia, aplica las reglas y persiste. Para recorrer varios
    cortes reutilizando la misma carga se usan `_compute(periodo)` -que no
    escribe- y `persist(...)` por separado.
    """

    def __init__(self, db: DBConnector, period: Period):
        self.db = db
        self.period = period

    def load_data(self):
        """Lee de la base las cuatro tablas que necesita el calculo."""
        (
            self.df_subs_raw,
            self.df_logs,
            self.df_logs_v15,
            self.df_free_raw,
        ) = loader.load_data(self.db)

    def build_clean_data(self):
        """Normaliza las suscripciones y une los dos formatos de log."""
        self.df_free_meta = cleaner.build_free_meta(self.df_free_raw)
        self.df_subs_full, self.df_clean_logs = cleaner.build_clean_data(
            self.df_subs_raw, self.df_logs, self.df_logs_v15
        )

    def _apply_log_rules(self):
        """Anade los logs sinteticos y precalcula lo que no depende del periodo."""
        self.df_clean_logs, self._orders_with_activity = rules.apply_log_rules(
            self.df_clean_logs, self.df_subs_full, self.df_free_meta
        )
        self._prepare_caches()

    def _prepare_caches(self):
        """Precalcula lo que no depende del periodo.

        Los filtros por texto sobre el log completo y la preparacion del frame
        de dimensiones son identicos para cualquier corte: calcularlos una vez
        evita repetirlos en cada uno de los dias del mes.
        """
        self._react_cand = metrics_calc.react_candidates(self.df_clean_logs)
        self._cutoff_cand = metrics_calc.cut_candidates(self.df_clean_logs)
        self._dim_prepared = dimensions.prepare_subs_dims(
            self.db, self.df_subs_full
        )
        # Recorrido acumulativo del log: responde "estado a la fecha X" sin
        # volver a filtrar y reagrupar el historico en cada corte. Es de donde
        # sale la mayor parte de la mejora de tiempo del analisis mensual.
        self._states = metrics_calc.AccumulatedState(self.df_clean_logs)
        # Los cortes de un mes comparten fecha_inicio, asi que act_ini y
        # free_ini se calculan una sola vez para los 31 dias.
        self._state_cache: dict[Any, Any] = {}
        self._inactive_cache = None

    def _state_at(self, target_date, state: str, strictly_before: bool):
        """Suscripciones en `estado` a una fecha, por el camino mas barato disponible.

        Con las caches preparadas usa el recorrido acumulativo; sin ellas cae en la
        definicion de referencia, que da el mismo resultado mas despacio. Solo se
        cachea el estado al **inicio** del periodo, que es identico en los 31 cortes
        del mes; el del cierre cambia cada dia y guardarlo solo gastaria memoria.
        """
        accumulated = getattr(self, "_states", None)
        if accumulated is None:
            # Sin _prepare_caches (uso suelto del analyzer): la definicion de
            # referencia da el mismo resultado, solo que mas despacio.
            return metrics_calc.get_state_at(
                self.df_clean_logs, target_date, state, strictly_before
            )

        cached = getattr(self, "_state_cache", None)
        # Solo se cachea el estado al inicio del periodo (strictly_before), que
        # es identico en todos los cortes del mes. El estado al cierre cambia
        # cada dia y no se reutiliza: guardarlo solo gastaria memoria.
        if cached is None or not strictly_before:
            return accumulated.in_state(target_date, state, strictly_before)
        key = (state, target_date)
        if key not in cached:
            cached[key] = accumulated.in_state(target_date, state, True)
        return cached[key]

    def _inactive_at_start(self, start_date):
        """Ultimo estado conocido antes del periodo: constante para todo el mes."""
        cache = getattr(self, "_inactive_cache", None)
        if cache is not None and cache[0] == start_date:
            return cache[1]
        accumulated = getattr(self, "_states", None)
        if accumulated is None:
            last_logs = self.df_clean_logs[self.df_clean_logs["f_dt"] < start_date]
            df_last_state = metrics_calc.last_log_per_order(last_logs)
        else:
            df_last_state = accumulated.latest(start_date, strictly_before=True)
        df_inactive = df_last_state[
            df_last_state["estado"].isin(INACTIVE_STATES)
        ].copy()
        self._inactive_cache = (start_date, df_inactive)
        return df_inactive

    def get_active_at(self, target_date, strictly_before: bool = False):
        """Suscripciones activas a una fecha."""
        return self._state_at(target_date, ACTIVE_STATE, strictly_before)

    def get_free_at(self, target_date, strictly_before: bool = False):
        """Suscripciones en servicio gratuito a una fecha."""
        return self._state_at(target_date, FREE_STATE, strictly_before)

    def get_reactivations(self, act_end):
        """Reactivaciones del periodo que siguen activas al cierre."""
        return metrics_calc.get_reactivations(
            self.df_clean_logs, self.df_subs_full, self.period, act_end,
            candidates=getattr(self, "_react_cand", None),
        )

    def get_unpaid_cuts(self):
        """Cortes por factura impaga ocurridos en el periodo."""
        return metrics_calc.get_unpaid_cuts(
            self.df_clean_logs, self.period,
            candidates=getattr(self, "_cutoff_cand", None),
        )

    def _compute(self, period: Period) -> dict[str, Any]:
        """Calcula todas las metricas de un corte SIN escribir en la base.

        Separar el calculo de la persistencia permite recorrer los 31 dias de
        un mes reutilizando una unica carga de datos.
        """
        # get_reactivations/get_corte_impagado leen self.periodo internamente.
        self.period = period
        period_label = period.label()

        act_ini = self.get_active_at(period.start_date, strictly_before=True)
        act_end = self.get_active_at(period.end_date, strictly_before=False)
        new = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= period.start_date)
            & (self.df_subs_full["f_ini_dt"] <= period.end_date)
            & self.df_subs_full["orden"].isin(self._orders_with_activity)
        ].copy()

        set_ini: set[str] = set(act_ini["orden"])
        end_set: set[str] = set(act_end["orden"])
        set_new: set[str] = set(new["orden"])

        # Clientes archivados: siguen en servicio gratuito, no son activos ni bajas.
        free_ini = self.get_free_at(period.start_date, strictly_before=True)
        free_end = self.get_free_at(period.end_date, strictly_before=False)
        set_free_ini: set[str] = set(free_ini["orden"]) if not free_ini.empty else set()
        free_end_set: set[str] = set(free_end["orden"]) if not free_end.empty else set()
        # Salidas hacia el servicio gratuito: no son bajas.
        set_free_period = (set_ini | set_new) & free_end_set
        n_free_period = len(set_free_period)
        df_free_period = pd.DataFrame({"orden": sorted(set_free_period)})
        # Desarchivados: vuelven a la base activa sin ser nuevos ni reactivaciones.
        free_return_set = end_set & set_free_ini
        n_free_comeback = len(free_return_set)
        df_free_comeback = pd.DataFrame({"orden": sorted(free_return_set)})

        df_inactive = self._inactive_at_start(period.start_date)
        total_inactive = len(df_inactive)

        billing_map = self.df_subs_full.set_index("orden")["total"]
        total_billing = round(billing_map.reindex(end_set).fillna(0).sum(), 2)
        arpu = round(total_billing / len(act_end), 2) if len(act_end) > 0 else 0.0

        df_react_all = self.get_reactivations(act_end)
        # counts_react: Dict[str, int] = {}
        # if not df_react_all.empty:
        #     counts_react.update(df_react_all["estado_origen"].value_counts().to_dict())

        # n_react_unicas = sum(counts_react.values())

        if not df_react_all.empty:
            df_6 = df_react_all[df_react_all["estado_origen"] == "6_churn"]
            df_8 = df_react_all[df_react_all["estado_origen"] == "8_30days"]
            n_react_6_churn = len(df_6[~df_6["orden"].isin(set_ini)])
            n_react_8_30days = len(df_8[~df_8["orden"].isin(set_ini)])
        else:
            n_react_6_churn = n_react_8_30days = 0

        react_4_df = df_react_all[df_react_all["estado_origen"] == "4_paused"] if not df_react_all.empty else pd.DataFrame()
        if not react_4_df.empty:
            n_react_4_P = len(react_4_df[react_4_df["orden"].isin(set_ini)])
            n_react_4_H = len(react_4_df[~react_4_df["orden"].isin(set_ini)])
        else:
            n_react_4_P = n_react_4_H = 0

        if not df_react_all.empty:
            df_without = df_react_all[df_react_all["estado_origen"] == "reactivacion_sin_origen"]
            n_react_without_origin = len(df_without[~df_without["orden"].isin(set_ini)])
        else:
            n_react_without_origin = 0

        n_react_6_churn += n_react_without_origin
        n_react_val = n_react_6_churn + n_react_8_30days + n_react_4_H
        n_react_unique = n_react_val + n_react_4_P

        df_unpaid_cutoff = self.get_unpaid_cuts()
        unpaid_cutoff_set = (
            set(df_unpaid_cutoff["orden"]) if not df_unpaid_cutoff.empty else set()
        )

        # Baja bruta: de los activos al inicio, quien no esta activo al final,
        # sin contar a los que se fueron al plan gratuito.
        #
        # Antes se restaba `set_fin - set_new` en vez de `set_fin`, y descontar
        # los nuevos de los supervivientes cuela como baja a la orden que cae en
        # los dos conjuntos: una que empieza el dia 1 del mes es "activa al
        # inicio" y "nueva" a la vez, asi que salia de los supervivientes y se
        # contaba como baja aun estando activa al cierre. En marzo de 2026 le
        # pasaba a SUB101027 y SUB101028.
        churn_idx = set_ini - end_set - free_end_set
        df_churns = self.df_subs_full[self.df_subs_full["orden"].isin(churn_idx)].copy()
        net_churns = (
            len(act_ini)
            - (len(act_end) - len(set_new) - n_free_comeback)
            - n_free_period
        )
        df_react_not_in_ini = df_react_all[~df_react_all["orden"].isin(set_ini)] if not df_react_all.empty else pd.DataFrame()
        n_react_not_in_ini = len(df_react_not_in_ini)
        # La baja bruta es el detalle contado, no un balance de la base.
        #
        # Antes era `bajas_netas + n_react_not_in_ini`, y esa aritmetica no
        # reproduce `churn_idx`: `n_react_not_in_ini` cuenta reactivaciones del
        # log, no supervivientes que no estuvieran al inicio, y las dos cifras
        # no son la misma. La diferencia era pequena pero real -en el cierre de
        # marzo, 1874 en pantalla contra 1869 ordenes en
        # `analyzer_bajas_detalladas`- y dejaba el reporte sin cuadrar con el
        # detalle que exporta `churn_detail.py`.
        #
        # `churn_idx` es un set, asi que su tamano es exactamente el numero de
        # ordenes que se guardan en el detalle.
        gross_churns = len(churn_idx)

        summary = {
            "periodo": period_label,
            "activos_inicio": len(act_ini),
            "activos_final": len(act_end),
            "nuevos_mes": len(set_new),
            "ingresos": len(set_new) + n_react_val,
            "crecimiento": round(((len(act_end) - len(act_ini)) / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "bajas": gross_churns,
            "churn_neto_pct": round((net_churns / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "churn_bruto_pct": round((gross_churns / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "corte_impagado": len(unpaid_cutoff_set),
            "porcentaje_suspensiones": round((len(unpaid_cutoff_set) / len(act_ini)) * 100, 4) if len(act_ini) > 0 else 0,
            "total_inactivos": total_inactive,
            "reactivaciones": n_react_unique,
            "react_6_churn": n_react_6_churn,
            "react_8_30days": n_react_8_30days,
            "react_4_paused": n_react_4_P + n_react_4_H,
            "react_4_P": n_react_4_P,
            "react_4_H": n_react_4_H,
            # Tasa de recuperacion: react_4_P sobre los cortes por impago del mes.
            # Conserva el nombre de la clave porque es la columna de los meses
            # ya guardados.
            "tasa_winback_pct": round((n_react_4_P / len(unpaid_cutoff_set)) * 100, 4) if len(unpaid_cutoff_set) > 0 else 0,
            "total_billing": total_billing,
            "arpu": arpu,
            "react_val": n_react_val,
            "tasa_aporte_react_pct": round((n_react_val / (len(set_new) + n_react_val)) * 100, 4) if (len(set_new) + n_react_val) > 0 else 0,
            "indice_reemplazo_react_pct": round((n_react_val / gross_churns) * 100, 4) if gross_churns > 0 else 0,
            "adiciones_netas": len(set_new) - gross_churns,
            "adiciones_brutas": (len(set_new) + n_react_not_in_ini) - gross_churns,
            "clientes_gratuitos": len(free_end_set),
            "gratuitos_nuevos": n_free_period,
            "gratuitos_retornados": n_free_comeback,
        }

        return {
            "periodo_label": period_label,
            "summary": summary,
            "act_ini": act_ini,
            "act_fin": act_end,
            "nuevos": new,
            "set_new": set_new,
            "df_bajas": df_churns,
            "df_inactivos": df_inactive,
            "df_react_all": df_react_all,
            "df_corte_impagado": df_unpaid_cutoff,
            "df_react_not_in_ini": df_react_not_in_ini,
            "free_fin": free_end,
            "df_free_periodo": df_free_period,
            "df_free_retorno": df_free_comeback,
            "bajas_netas": net_churns,
            "bajas_brutas": gross_churns,
            "set_corte_impagado": unpaid_cutoff_set,
            "set_free_fin": free_end_set,
            "n_free_retorno": n_free_comeback,
            "total_inactivos": total_inactive,
            "n_react_6_churn": n_react_6_churn,
            "n_react_8_30days": n_react_8_30days,
            "n_react_4_P": n_react_4_P,
            "n_react_4_H": n_react_4_H,
            "n_react_unicas": n_react_unique,
        }

    def run(self):
        """El analisis completo de un periodo: carga, calcula y persiste."""
        self.load_data()
        self.build_clean_data()
        self._apply_log_rules()
        return self.persist(self._compute(self.period))

    def persist(self, c: dict[str, Any]):
        """Escribe en la base el resultado de `_compute` (comportamiento historico)."""
        period_label = c["periodo_label"]
        summary = c["summary"]
        act_ini = c["act_ini"]
        act_end = c["act_fin"]
        new = c["nuevos"]
        set_new = c["set_new"]
        df_churns = c["df_bajas"]
        df_inactive = c["df_inactivos"]
        df_react_all = c["df_react_all"]
        df_unpaid_cutoff = c["df_corte_impagado"]
        df_react_not_in_ini = c["df_react_not_in_ini"]
        free_end = c["free_fin"]
        df_free_period = c["df_free_periodo"]
        df_free_comeback = c["df_free_retorno"]
        net_churns = c["bajas_netas"]
        gross_churns = c["bajas_brutas"]
        unpaid_cutoff_set = c["set_corte_impagado"]
        free_end_set = c["set_free_fin"]
        n_free_comeback = c["n_free_retorno"]
        total_inactive = c["total_inactivos"]
        n_react_6_churn = c["n_react_6_churn"]
        n_react_8_30days = c["n_react_8_30days"]
        n_react_4_P = c["n_react_4_P"]
        n_react_4_H = c["n_react_4_H"]
        n_react_unique = c["n_react_unicas"]

        # Todo el periodo en una transacción: un fallo a mitad deja el cálculo anterior entero.
        with self.db.transaction() as cur:
            for table, df in (
                (tables.ACTIVE_AT_CLOSE, act_end[["orden", "f_dt", "estado"]]),
                (tables.REACTIVATIONS, df_react_all),
                (tables.CHURNED, df_churns[["orden", "f_ini_dt", "estado"]]),
                (tables.UNPAID_CUTS, df_unpaid_cutoff),
                (
                    tables.FREE_CLIENTS,
                    free_end.reindex(columns=["orden", "f_dt", "estado"]).rename(columns={"f_dt": "fecha_archivado"}),
                ),
                (tables.CLOSE_HISTORY, pd.DataFrame([summary])),
                (
                    tables.INACTIVE,
                    df_inactive.reindex(columns=["orden", "f_dt", "estado"]).rename(
                        columns={"f_dt": "fecha_evento", "estado": "estado_inactivo"}
                    ),
                ),
            ):
                replace(cur, table, df, periodo_reporte=period_label)

        print(f"\nANALISIS COMPLETADO | Periodo: {period_label}")
        print(f"Base Inicio: {len(act_ini)} | Nuevos: {len(set_new)} | Base Final: {len(act_end)}")
        print(f"BAJAS -> Netas: {net_churns} | Brutas: {gross_churns}")
        print(f"Churn Neto: {summary['churn_neto_pct']}% | Bruto: {summary['churn_bruto_pct']}%")
        print(f"CORTE IMPAGADO: {len(unpaid_cutoff_set)} | INACTIVOS: {total_inactive} | Recuperacion: {summary['tasa_winback_pct']}%")
        print(f"GRATUITOS (archivados): {len(free_end_set)} | Nuevos: {summary['gratuitos_nuevos']} | Retornados: {n_free_comeback}")
        print(f"COMPARATIVA -> Detalle: {len(df_churns)} | Netas: {net_churns} | Brutas: {gross_churns}")
        print(f"  REACTIVACIONES: 6_churn={n_react_6_churn} | 8_30days={n_react_8_30days} | 4_paused={n_react_4_P + n_react_4_H} | Total={n_react_unique}")

        dimensions.aggregate_dimensions(
            self.db, self.period,
            act_ini, act_end, new, df_churns,
            df_inactive, df_react_all, df_unpaid_cutoff,
            df_react_not_in_ini=df_react_not_in_ini,
            df_subs_full=self.df_subs_full,
            df_free_end=free_end,
            df_free_period=df_free_period,
            df_free_comeback=df_free_comeback,
            prepared=getattr(self, "_dim_prepared", None),
        )
