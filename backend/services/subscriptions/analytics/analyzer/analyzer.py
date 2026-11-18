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
from core.models import Periodo
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

    def __init__(self, db: DBConnector, periodo: Periodo):
        self.db = db
        self.periodo = periodo

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
        self._corte_cand = metrics_calc.cut_candidates(self.df_clean_logs)
        self._dim_prepared = dimensions.prepare_subs_dims(
            self.db, self.df_subs_full
        )
        # Recorrido acumulativo del log: responde "estado a la fecha X" sin
        # volver a filtrar y reagrupar el historico en cada corte. Es de donde
        # sale la mayor parte de la mejora de tiempo del analisis mensual.
        self._estados = metrics_calc.AccumulatedState(self.df_clean_logs)
        # Los cortes de un mes comparten fecha_inicio, asi que act_ini y
        # free_ini se calculan una sola vez para los 31 dias.
        self._state_cache: dict[Any, Any] = {}
        self._inactivos_cache = None

    def _state_at(self, target_date, estado: str, strictly_before: bool):
        """Suscripciones en `estado` a una fecha, por el camino mas barato disponible.

        Con las caches preparadas usa el recorrido acumulativo; sin ellas cae en la
        definicion de referencia, que da el mismo resultado mas despacio. Solo se
        cachea el estado al **inicio** del periodo, que es identico en los 31 cortes
        del mes; el del cierre cambia cada dia y guardarlo solo gastaria memoria.
        """
        acumulado = getattr(self, "_estados", None)
        if acumulado is None:
            # Sin _prepare_caches (uso suelto del analyzer): la definicion de
            # referencia da el mismo resultado, solo que mas despacio.
            return metrics_calc.get_state_at(
                self.df_clean_logs, target_date, estado, strictly_before
            )

        cached = getattr(self, "_state_cache", None)
        # Solo se cachea el estado al inicio del periodo (strictly_before), que
        # es identico en todos los cortes del mes. El estado al cierre cambia
        # cada dia y no se reutiliza: guardarlo solo gastaria memoria.
        if cached is None or not strictly_before:
            return acumulado.in_state(target_date, estado, strictly_before)
        key = (estado, target_date)
        if key not in cached:
            cached[key] = acumulado.in_state(target_date, estado, True)
        return cached[key]

    def _inactive_at_start(self, fecha_inicio):
        """Ultimo estado conocido antes del periodo: constante para todo el mes."""
        cache = getattr(self, "_inactivos_cache", None)
        if cache is not None and cache[0] == fecha_inicio:
            return cache[1]
        acumulado = getattr(self, "_estados", None)
        if acumulado is None:
            last_logs = self.df_clean_logs[self.df_clean_logs["f_dt"] < fecha_inicio]
            df_last_state = metrics_calc.last_log_per_order(last_logs)
        else:
            df_last_state = acumulado.latest(fecha_inicio, strictly_before=True)
        df_inactivos = df_last_state[
            df_last_state["estado"].isin(INACTIVE_STATES)
        ].copy()
        self._inactivos_cache = (fecha_inicio, df_inactivos)
        return df_inactivos

    def get_active_at(self, target_date, strictly_before: bool = False):
        """Suscripciones activas a una fecha."""
        return self._state_at(target_date, ACTIVE_STATE, strictly_before)

    def get_free_at(self, target_date, strictly_before: bool = False):
        """Suscripciones en servicio gratuito a una fecha."""
        return self._state_at(target_date, FREE_STATE, strictly_before)

    def get_reactivations(self, act_fin):
        """Reactivaciones del periodo que siguen activas al cierre."""
        return metrics_calc.get_reactivations(
            self.df_clean_logs, self.df_subs_full, self.periodo, act_fin,
            candidates=getattr(self, "_react_cand", None),
        )

    def get_unpaid_cuts(self):
        """Cortes por factura impaga ocurridos en el periodo."""
        return metrics_calc.get_unpaid_cuts(
            self.df_clean_logs, self.periodo,
            candidates=getattr(self, "_corte_cand", None),
        )

    def _compute(self, periodo: Periodo) -> dict[str, Any]:
        """Calcula todas las metricas de un corte SIN escribir en la base.

        Separar el calculo de la persistencia permite recorrer los 31 dias de
        un mes reutilizando una unica carga de datos.
        """
        # get_reactivations/get_corte_impagado leen self.periodo internamente.
        self.periodo = periodo
        periodo_label = periodo.label()

        act_ini = self.get_active_at(periodo.fecha_inicio, strictly_before=True)
        act_fin = self.get_active_at(periodo.end_date, strictly_before=False)
        nuevos = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= periodo.fecha_inicio)
            & (self.df_subs_full["f_ini_dt"] <= periodo.end_date)
            & self.df_subs_full["orden"].isin(self._orders_with_activity)
        ].copy()

        set_ini: set[str] = set(act_ini["orden"])
        set_fin: set[str] = set(act_fin["orden"])
        set_nue: set[str] = set(nuevos["orden"])

        # Clientes archivados: siguen en servicio gratuito, no son activos ni bajas.
        free_ini = self.get_free_at(periodo.fecha_inicio, strictly_before=True)
        free_fin = self.get_free_at(periodo.end_date, strictly_before=False)
        set_free_ini: set[str] = set(free_ini["orden"]) if not free_ini.empty else set()
        set_free_fin: set[str] = set(free_fin["orden"]) if not free_fin.empty else set()
        # Salidas hacia el servicio gratuito: no son bajas.
        set_free_period = (set_ini | set_nue) & set_free_fin
        n_free_period = len(set_free_period)
        df_free_periodo = pd.DataFrame({"orden": sorted(set_free_period)})
        # Desarchivados: vuelven a la base activa sin ser nuevos ni reactivaciones.
        set_free_retorno = set_fin & set_free_ini
        n_free_retorno = len(set_free_retorno)
        df_free_retorno = pd.DataFrame({"orden": sorted(set_free_retorno)})

        df_inactivos = self._inactive_at_start(periodo.fecha_inicio)
        total_inactivos = len(df_inactivos)

        billing_map = self.df_subs_full.set_index("orden")["total"]
        total_billing = round(billing_map.reindex(set_fin).fillna(0).sum(), 2)
        arpu = round(total_billing / len(act_fin), 2) if len(act_fin) > 0 else 0.0

        df_react_all = self.get_reactivations(act_fin)
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
        n_react_unicas = n_react_val + n_react_4_P

        df_corte_impagado = self.get_unpaid_cuts()
        set_corte_impagado = (
            set(df_corte_impagado["orden"]) if not df_corte_impagado.empty else set()
        )

        # Baja bruta: de los activos al inicio, quien no esta activo al final,
        # sin contar a los que se fueron al plan gratuito.
        #
        # Antes se restaba `set_fin - set_nue` en vez de `set_fin`, y descontar
        # los nuevos de los supervivientes cuela como baja a la orden que cae en
        # los dos conjuntos: una que empieza el dia 1 del mes es "activa al
        # inicio" y "nueva" a la vez, asi que salia de los supervivientes y se
        # contaba como baja aun estando activa al cierre. En marzo de 2026 le
        # pasaba a SUB101027 y SUB101028.
        churn_idx = set_ini - set_fin - set_free_fin
        df_bajas = self.df_subs_full[self.df_subs_full["orden"].isin(churn_idx)].copy()
        bajas_netas = (
            len(act_ini)
            - (len(act_fin) - len(set_nue) - n_free_retorno)
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
        bajas_brutas = len(churn_idx)

        summary = {
            "periodo": periodo_label,
            "activos_inicio": len(act_ini),
            "activos_final": len(act_fin),
            "nuevos_mes": len(set_nue),
            "ingresos": len(set_nue) + n_react_val,
            "crecimiento": round(((len(act_fin) - len(act_ini)) / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "bajas": bajas_brutas,
            "churn_neto_pct": round((bajas_netas / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "churn_bruto_pct": round((bajas_brutas / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "corte_impagado": len(set_corte_impagado),
            "porcentaje_suspensiones": round((len(set_corte_impagado) / len(act_ini)) * 100, 4) if len(act_ini) > 0 else 0,
            "total_inactivos": total_inactivos,
            "reactivaciones": n_react_unicas,
            "react_6_churn": n_react_6_churn,
            "react_8_30days": n_react_8_30days,
            "react_4_paused": n_react_4_P + n_react_4_H,
            "react_4_P": n_react_4_P,
            "react_4_H": n_react_4_H,
            # Tasa de recuperacion: react_4_P sobre los cortes por impago del mes.
            # Conserva el nombre de la clave porque es la columna de los meses
            # ya guardados.
            "tasa_winback_pct": round((n_react_4_P / len(set_corte_impagado)) * 100, 4) if len(set_corte_impagado) > 0 else 0,
            "total_billing": total_billing,
            "arpu": arpu,
            "react_val": n_react_val,
            "tasa_aporte_react_pct": round((n_react_val / (len(set_nue) + n_react_val)) * 100, 4) if (len(set_nue) + n_react_val) > 0 else 0,
            "indice_reemplazo_react_pct": round((n_react_val / bajas_brutas) * 100, 4) if bajas_brutas > 0 else 0,
            "adiciones_netas": len(set_nue) - bajas_brutas,
            "adiciones_brutas": (len(set_nue) + n_react_not_in_ini) - bajas_brutas,
            "clientes_gratuitos": len(set_free_fin),
            "gratuitos_nuevos": n_free_period,
            "gratuitos_retornados": n_free_retorno,
        }

        return {
            "periodo_label": periodo_label,
            "summary": summary,
            "act_ini": act_ini,
            "act_fin": act_fin,
            "nuevos": nuevos,
            "set_nue": set_nue,
            "df_bajas": df_bajas,
            "df_inactivos": df_inactivos,
            "df_react_all": df_react_all,
            "df_corte_impagado": df_corte_impagado,
            "df_react_not_in_ini": df_react_not_in_ini,
            "free_fin": free_fin,
            "df_free_periodo": df_free_periodo,
            "df_free_retorno": df_free_retorno,
            "bajas_netas": bajas_netas,
            "bajas_brutas": bajas_brutas,
            "set_corte_impagado": set_corte_impagado,
            "set_free_fin": set_free_fin,
            "n_free_retorno": n_free_retorno,
            "total_inactivos": total_inactivos,
            "n_react_6_churn": n_react_6_churn,
            "n_react_8_30days": n_react_8_30days,
            "n_react_4_P": n_react_4_P,
            "n_react_4_H": n_react_4_H,
            "n_react_unicas": n_react_unicas,
        }

    def run(self):
        """El analisis completo de un periodo: carga, calcula y persiste."""
        self.load_data()
        self.build_clean_data()
        self._apply_log_rules()
        return self.persist(self._compute(self.periodo))

    def persist(self, c: dict[str, Any]):
        """Escribe en la base el resultado de `_compute` (comportamiento historico)."""
        periodo_label = c["periodo_label"]
        summary = c["summary"]
        act_ini = c["act_ini"]
        act_fin = c["act_fin"]
        nuevos = c["nuevos"]
        set_nue = c["set_nue"]
        df_bajas = c["df_bajas"]
        df_inactivos = c["df_inactivos"]
        df_react_all = c["df_react_all"]
        df_corte_impagado = c["df_corte_impagado"]
        df_react_not_in_ini = c["df_react_not_in_ini"]
        free_fin = c["free_fin"]
        df_free_periodo = c["df_free_periodo"]
        df_free_retorno = c["df_free_retorno"]
        bajas_netas = c["bajas_netas"]
        bajas_brutas = c["bajas_brutas"]
        set_corte_impagado = c["set_corte_impagado"]
        set_free_fin = c["set_free_fin"]
        n_free_retorno = c["n_free_retorno"]
        total_inactivos = c["total_inactivos"]
        n_react_6_churn = c["n_react_6_churn"]
        n_react_8_30days = c["n_react_8_30days"]
        n_react_4_P = c["n_react_4_P"]
        n_react_4_H = c["n_react_4_H"]
        n_react_unicas = c["n_react_unicas"]

        # Todo el periodo en una transacción: un fallo a mitad deja el cálculo anterior entero.
        with self.db.transaction() as cur:
            for table, df in (
                (tables.ACTIVE_AT_CLOSE, act_fin[["orden", "f_dt", "estado"]]),
                (tables.REACTIVATIONS, df_react_all),
                (tables.CHURNED, df_bajas[["orden", "f_ini_dt", "estado"]]),
                (tables.UNPAID_CUTS, df_corte_impagado),
                (
                    tables.FREE_CLIENTS,
                    free_fin.reindex(columns=["orden", "f_dt", "estado"]).rename(columns={"f_dt": "fecha_archivado"}),
                ),
                (tables.CLOSE_HISTORY, pd.DataFrame([summary])),
                (
                    tables.INACTIVE,
                    df_inactivos.reindex(columns=["orden", "f_dt", "estado"]).rename(
                        columns={"f_dt": "fecha_evento", "estado": "estado_inactivo"}
                    ),
                ),
            ):
                replace(cur, table, df, periodo_reporte=periodo_label)

        print(f"\nANALISIS COMPLETADO | Periodo: {periodo_label}")
        print(f"Base Inicio: {len(act_ini)} | Nuevos: {len(set_nue)} | Base Final: {len(act_fin)}")
        print(f"BAJAS -> Netas: {bajas_netas} | Brutas: {bajas_brutas}")
        print(f"Churn Neto: {summary['churn_neto_pct']}% | Bruto: {summary['churn_bruto_pct']}%")
        print(f"CORTE IMPAGADO: {len(set_corte_impagado)} | INACTIVOS: {total_inactivos} | Recuperacion: {summary['tasa_winback_pct']}%")
        print(f"GRATUITOS (archivados): {len(set_free_fin)} | Nuevos: {summary['gratuitos_nuevos']} | Retornados: {n_free_retorno}")
        print(f"COMPARATIVA -> Detalle: {len(df_bajas)} | Netas: {bajas_netas} | Brutas: {bajas_brutas}")
        print(f"  REACTIVACIONES: 6_churn={n_react_6_churn} | 8_30days={n_react_8_30days} | 4_paused={n_react_4_P + n_react_4_H} | Total={n_react_unicas}")

        dimensions.aggregate_dimensions(
            self.db, self.periodo,
            act_ini, act_fin, nuevos, df_bajas,
            df_inactivos, df_react_all, df_corte_impagado,
            df_react_not_in_ini=df_react_not_in_ini,
            df_subs_full=self.df_subs_full,
            df_free_fin=free_fin,
            df_free_periodo=df_free_periodo,
            df_free_retorno=df_free_retorno,
            prepared=getattr(self, "_dim_prepared", None),
        )
