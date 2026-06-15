from __future__ import annotations
from typing import Any, Dict, List, Set

import pandas as pd

from ...config import ACTIVE_STATE, AUDIT_REACT_ORIGINS, CORTE_IMPAGADO_EVENT, EXCLUDED_STATE, INACTIVE_STATES
from ...database import DBConnector
from ...models import Periodo
from . import cleaner, dimensions, loader, metrics_calc, rules
from ...utils import parse_date


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
        counts_react: Dict[str, int] = {"4_paused": 0, "6_churn": 0, "8_30days": 0}
        set_react_audit: Set[str] = set()
        if not df_react_all.empty:
            counts_react.update(df_react_all["estado_origen"].value_counts().to_dict())
            set_react_audit = set(
                df_react_all[df_react_all["estado_origen"].isin(AUDIT_REACT_ORIGINS)]["orden"]
            )

        n_react_unicas = sum(counts_react.values())
        n_react_6_8 = counts_react.get("6_churn", 0) + counts_react.get("8_30days", 0)

        df_corte_impagado = self.get_corte_impagado()
        set_corte_impagado = (
            set(df_corte_impagado["orden"]) if not df_corte_impagado.empty else set()
        )

        sobrevivientes = set_fin - set_nue
        bajas_fin_netas_ids = set_ini - sobrevivientes
        target_size = max(0, len(act_ini) - (len(act_fin) - len(nuevos)))
        df_bajas = self.df_subs_full[self.df_subs_full["orden"].isin(bajas_fin_netas_ids)].copy()
        if "f_ini_dt" in df_bajas.columns:
            df_bajas = df_bajas.sort_values(by=["f_ini_dt", "orden"], na_position="last")
        else:
            df_bajas = df_bajas.sort_values(by=["orden"])
        df_bajas = df_bajas.head(target_size).reset_index(drop=True)
        bajas_netas = len(df_bajas)
        bajas_brutas = bajas_netas + n_react_6_8

        self.db.save_historico(act_fin, "analyzer_activos_cierre", periodo_label)
        self.db.save_historico(df_react_all, "analyzer_reactivaciones", periodo_label)
        self.db.save_historico(df_bajas, "analyzer_bajas_detalladas", periodo_label)
        self.db.save_historico(df_corte_impagado, "analyzer_corte_impagado", periodo_label)

        summary = {
            "periodo": periodo_label,
            "activos_inicio": len(act_ini),
            "activos_final": len(act_fin),
            "nuevos_mes": len(set_nue),
            "bajas_netas_balance": bajas_netas,
            "bajas_brutas_auditoria": bajas_brutas,
            "churn_neto_pct": round((bajas_netas / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "churn_bruto_pct": round((bajas_brutas / len(act_ini) * 100), 4) if len(act_ini) > 0 else 0,
            "corte_impagado": len(set_corte_impagado),
            "total_inactivos": total_inactivos,
            "reactivaciones": n_react_unicas,
            "react_6_churn": int(counts_react.get("6_churn", 0)),
            "react_8_30days": int(counts_react.get("8_30days", 0)),
            "react_4_paused": int(counts_react.get("4_paused", 0)),
            "tasa_winback_pct": round((n_react_unicas / total_inactivos) * 100, 4) if total_inactivos > 0 else 0,
            "total_billing": total_billing,
            "arpu": arpu,
            "react_6_8": n_react_6_8,
            "tasa_aporte_react_pct": round((n_react_6_8 / (len(set_nue) + n_react_6_8)) * 100, 4) if (len(set_nue) + n_react_6_8) > 0 else 0,
            "indice_reemplazo_react_pct": round((n_react_6_8 / bajas_netas) * 100, 4) if bajas_netas > 0 else 0,
            "adiciones_brutas": len(set_nue) - bajas_netas,
            "adiciones_netas": (len(set_nue) + n_react_6_8) - bajas_netas,
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

        dimensions.aggregate_dimensions(
            self.db, self.periodo,
            act_ini, act_fin, nuevos, df_bajas,
            df_inactivos, df_react_all, df_corte_impagado,
            set_react_audit,
        )

    def aggregate_dimensions(
        self,
        act_ini, act_fin, nuevos, df_bajas,
        df_inactivos, df_react_all, df_corte_impagado,
        set_react_audit,
    ):
        dimensions.aggregate_dimensions(
            self.db, self.periodo,
            act_ini, act_fin, nuevos, df_bajas,
            df_inactivos, df_react_all, df_corte_impagado,
            set_react_audit,
        )
