from __future__ import annotations
from typing import Dict, Set

import pandas as pd

from ...config import INACTIVE_STATES
from ...database import DBConnector
from ...models import Periodo
from . import cleaner, dimensions, loader, metrics_calc, rules


class MetricsAnalyzer:
    """Analizador de tasa de churn para suscripciones."""

    def __init__(self, db: DBConnector, periodo: Periodo):
        self.db = db
        self.periodo = periodo

    def load_data(self):
        self.df_subs_raw, self.df_logs, self.df_logs_v15 = loader.load_data(self.db)

    def build_clean_data(self):
        self.df_subs_full, self.df_clean_logs = cleaner.build_clean_data(
            self.df_subs_raw, self.df_logs, self.df_logs_v15
        )

    def _apply_log_rules(self):
        self.df_clean_logs, self._ordens_con_activity = rules.apply_log_rules(
            self.df_clean_logs, self.df_subs_full
        )

    def get_active_at(self, target_date, strictly_before: bool = False):
        return metrics_calc.get_active_at(
            self.df_clean_logs, target_date, strictly_before
        )

    def get_reactivations(self, act_fin):
        return metrics_calc.get_reactivations(
            self.df_clean_logs, self.df_subs_full, self.periodo, act_fin
        )

    def get_corte_impagado(self):
        return metrics_calc.get_corte_impagado(
            self.df_clean_logs, self.periodo
        )

    def run(self):
        self.load_data()
        self.build_clean_data()
        self._apply_log_rules()
        periodo_label = self.periodo.label()

        act_ini = self.get_active_at(self.periodo.fecha_inicio, strictly_before=True)
        act_fin = self.get_active_at(self.periodo.fecha_final, strictly_before=False)
        nuevos = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= self.periodo.fecha_inicio)
            & (self.df_subs_full["f_ini_dt"] <= self.periodo.fecha_final)
            & self.df_subs_full["orden"].isin(self._ordens_con_activity)
        ].copy()

        set_ini: Set[str] = set(act_ini["orden"])
        set_fin: Set[str] = set(act_fin["orden"])
        set_nue: Set[str] = set(nuevos["orden"])

        last_logs = self.df_clean_logs[
            self.df_clean_logs["f_dt"] < self.periodo.fecha_inicio
        ]
        idx_inac = last_logs.groupby("orden")["f_dt"].idxmax()
        df_ultimo_estado = last_logs.loc[idx_inac]
        df_inactivos = df_ultimo_estado[
            df_ultimo_estado["estado"].isin(INACTIVE_STATES)
        ].copy()
        total_inactivos = len(df_inactivos)

        billing_map = self.df_subs_full.set_index("orden")["total"]
        total_billing = round(billing_map.reindex(set_fin).fillna(0).sum(), 2)
        arpu = round(total_billing / len(act_fin), 2) if len(act_fin) > 0 else 0.0

        df_react_all = self.get_reactivations(act_fin)
        counts_react: Dict[str, int] = {}
        if not df_react_all.empty:
            counts_react.update(df_react_all["estado_origen"].value_counts().to_dict())

        n_react_unicas = sum(counts_react.values())

        # 6_churn y 8_30days solo cuentan histórico (no en set_ini)
        if not df_react_all.empty:
            df_6 = df_react_all[df_react_all["estado_origen"] == "6_churn"]
            df_8 = df_react_all[df_react_all["estado_origen"] == "8_30days"]
            n_react_6_churn = len(df_6[~df_6["orden"].isin(set_ini)])
            n_react_8_30days = len(df_8[~df_8["orden"].isin(set_ini)])
        else:
            n_react_6_churn = n_react_8_30days = 0

        # Separar 4_paused: P = mismo periodo (en set_ini), H = histórica (no en set_ini)
        react_4_df = df_react_all[df_react_all["estado_origen"] == "4_paused"] if not df_react_all.empty else pd.DataFrame()
        if not react_4_df.empty:
            n_react_4_P = len(react_4_df[react_4_df["orden"].isin(set_ini)])
            n_react_4_H = len(react_4_df[~react_4_df["orden"].isin(set_ini)])
        else:
            n_react_4_P = n_react_4_H = 0

        # reactivacion_sin_origen: detectadas por texto sin origen conocido, solo histórico
        if not df_react_all.empty:
            df_sin = df_react_all[df_react_all["estado_origen"] == "reactivacion_sin_origen"]
            n_react_sin_origen = len(df_sin[~df_sin["orden"].isin(set_ini)])
        else:
            n_react_sin_origen = 0

        n_react_6_churn += n_react_sin_origen
        n_react_val = n_react_6_churn + n_react_8_30days + n_react_4_H

        df_corte_impagado = self.get_corte_impagado()
        set_corte_impagado = (
            set(df_corte_impagado["orden"]) if not df_corte_impagado.empty else set()
        )

        sobrevivientes = set_fin - set_nue
        bajas_fin_netas_ids = set_ini - sobrevivientes
        df_bajas = self.df_subs_full[self.df_subs_full["orden"].isin(bajas_fin_netas_ids)].copy()
        bajas_netas = max(0, len(act_ini) - (len(act_fin) - len(set_nue)))
        df_react_not_in_ini = df_react_all[~df_react_all["orden"].isin(set_ini)] if not df_react_all.empty else pd.DataFrame()
        n_react_not_in_ini = len(df_react_not_in_ini)
        bajas_brutas = bajas_netas + n_react_not_in_ini

        self.db.save_historico(act_fin[["orden", "f_dt", "estado"]], "analyzer_activos_cierre", periodo_label)
        self.db.save_historico(df_react_all, "analyzer_reactivaciones", periodo_label)
        self.db.save_historico(df_bajas[["orden", "f_ini_dt", "estado"]], "analyzer_bajas_detalladas", periodo_label)
        self.db.save_historico(df_corte_impagado, "analyzer_corte_impagado", periodo_label)

        summary = {
            "periodo": periodo_label,
            "activos_inicio": len(act_ini),
            "activos_final": len(act_fin),
            "nuevos_mes": len(set_nue),
            "bajas_netas": bajas_netas,
            "bajas_brutas": bajas_brutas,
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
            "tasa_winback_pct": round((n_react_unicas / total_inactivos) * 100, 4) if total_inactivos > 0 else 0,
            "total_billing": total_billing,
            "arpu": arpu,
            "react_val": n_react_val,
            "tasa_aporte_react_pct": round((n_react_val / (len(set_nue) + n_react_val)) * 100, 4) if (len(set_nue) + n_react_val) > 0 else 0,
            "indice_reemplazo_react_pct": round((n_react_val / bajas_netas) * 100, 4) if bajas_netas > 0 else 0,
            "adiciones_netas": len(set_nue) - bajas_netas,
            "adiciones_brutas": (len(set_nue) + n_react_not_in_ini) - bajas_netas,
        }
        self.db.save_historico(pd.DataFrame([summary]), "analyzer_cierre_historico", periodo_label)

        if not df_inactivos.empty:
            detalle_inac = df_inactivos[["orden", "f_dt", "estado"]].rename(
                columns={"f_dt": "fecha_evento", "estado": "estado_inactivo"}
            )
            self.db.save_historico(detalle_inac, "analyzer_inactivos_detallados", periodo_label)

        print(f"\nANALISIS COMPLETADO | Periodo: {periodo_label}")
        print(f"Base Inicio: {len(act_ini)} | Nuevos: {len(set_nue)} | Base Final: {len(act_fin)}")
        print(f"BAJAS -> Netas: {bajas_netas} | Brutas: {bajas_brutas}")
        print(f"Churn Neto: {summary['churn_neto_pct']}% | Bruto: {summary['churn_bruto_pct']}%")
        print(f"CORTE IMPAGADO: {len(set_corte_impagado)} | INACTIVOS: {total_inactivos} | Winback: {summary['tasa_winback_pct']}%")
        print(f"COMPARATIVA -> Detalle: {len(df_bajas)} | Netas: {bajas_netas} | Brutas: {bajas_brutas}")
        print(f"  REACTIVACIONES: 6_churn={counts_react.get('6_churn', 0)} | 8_30days={counts_react.get('8_30days', 0)} | 4_paused={counts_react.get('4_paused', 0)}")

        dimensions.aggregate_dimensions(
            self.db, self.periodo,
            act_ini, act_fin, nuevos, df_bajas,
            df_inactivos, df_react_all, df_corte_impagado,
            df_react_not_in_ini=df_react_not_in_ini,
        )

    def aggregate_dimensions(
        self,
        act_ini, act_fin, nuevos, df_bajas,
        df_inactivos, df_react_all, df_corte_impagado,
        df_react_not_in_ini=None,
    ):
        dimensions.aggregate_dimensions(
            self.db, self.periodo,
            act_ini, act_fin, nuevos, df_bajas,
            df_inactivos, df_react_all, df_corte_impagado,
            df_react_not_in_ini=df_react_not_in_ini,
        )
