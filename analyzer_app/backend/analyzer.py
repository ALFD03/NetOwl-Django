from __future__ import annotations
import concurrent.futures
from collections import defaultdict
from typing import Dict, List, Optional, Set

import pandas as pd

from .config import (
    ACTIVE_STATE,
    AUDIT_REACT_ORIGINS,
    CORTE_IMPAGADO_EVENT,
    INACTIVE_STATES,
    VALID_REACT_ORIGINS,
)
from .database import DBConnector
from .models import Periodo
from .utils import parse_date


class ChurnRateAnalyzer:
    def __init__(self, db: DBConnector, periodo: Periodo):
        self.db = db
        self.periodo = periodo

    def load_data(self):
        print("Sincronizando con base de datos...")

        subs_cols = ["Orden_Producto", "fecha_inicio", "Total"]
        logs_cols = ["orden", "fecha_log", "log", "estado"]
        logs_v15_cols = ["orden", "tipo", "categoria", "fecha"]
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=3
        ) as executor:
            future_subs = executor.submit(
                self.db.read_table, "Subscripciones", subs_cols
            )
            future_logs = executor.submit(
                self.db.read_table, "Subscripciones-logs", logs_cols
            )
            future_logs_v15 = executor.submit(
                self.db.read_table,
                "Subscripciones-logs-v15",
                logs_v15_cols,
            )
            self.df_subs_raw = future_subs.result()
            self.df_logs = future_logs.result()
            self.df_logs_v15 = future_logs_v15.result()

    def build_clean_data(self):
        df = self.df_subs_raw.copy()
        df.columns = df.columns.str.lower()
        df = df.rename(
            columns={
                "orden_producto": "orden",
                "fecha_inicio": "f_ini",
            }
        )
        df["orden"] = df["orden"].astype(str).str.strip()
        df["total"] = pd.to_numeric(
            df["total"], errors="coerce"
        ).fillna(0.0)

        df["f_ini_dt"] = pd.to_datetime(df["f_ini"], errors="coerce")
        self.df_subs_full = df.drop_duplicates(subset=["orden"])

        l1 = self.df_logs.rename(
            columns={
                "orden": "orden",
                "fecha_log": "fecha",
                "log": "nota",
                "estado": "estado",
            }
        )
        l2 = self.df_logs_v15.rename(
            columns={
                "orden": "orden",
                "tipo": "nota",
                "categoria": "cat",
                "fecha": "fecha",
            }
        )
        l2["estado"] = (
            l2["cat"]
            .map(
                {
                    "En progreso": "3_progress",
                    "Cerrado": "6_churn",
                }
            )
            .fillna(l2["cat"])
        )

        combined = pd.concat([l1, l2], ignore_index=True, sort=False)
        combined["orden"] = combined["orden"].astype(str).str.strip()
        combined["estado"] = (
            combined["estado"].astype(str).str.strip().str.lower()
        )

        combined["f_dt"] = pd.to_datetime(
            combined["fecha"], errors="coerce"
        )

        combined["log_norm"] = (
            combined["nota"]
            .astype(str)
            .str.normalize("NFKD")
            .str.encode("ascii", errors="ignore")
            .str.decode("utf-8")
            .str.lower()
            .str.strip()
        )

        combined = (
            combined.dropna(subset=["orden", "f_dt"])
            .sort_values(["orden", "f_dt"])
        )
        combined["estado_origen"] = combined.groupby("orden")[
            "estado"
        ].shift(1)
        self.df_clean_logs = combined

    def get_active_at(
        self, target_date, strictly_before: bool = False
    ) -> pd.DataFrame:
        if strictly_before:
            filt = self.df_clean_logs[
                self.df_clean_logs["f_dt"] < target_date
            ]
        else:
            filt = self.df_clean_logs[
                self.df_clean_logs["f_dt"] <= target_date
            ]
        if filt.empty:
            return pd.DataFrame(columns=["orden"])
        idx = filt.groupby("orden")["f_dt"].idxmax()
        last_logs = filt.loc[idx]
        return last_logs[last_logs["estado"] == ACTIVE_STATE].copy()

    def get_reactivations(self, act_fin: pd.DataFrame) -> pd.DataFrame:
        df = self.df_clean_logs.copy()
        mask_react = df["log_norm"].str.contains("reactivacion", na=False)
        df_react = df[mask_react]
        df_react = df_react.assign(
            f_min=df_react["f_dt"].dt.floor("min")
        )
        df_react = df_react.drop_duplicates(subset=["orden", "f_min"])
        df_react = df_react[
            (df_react["f_dt"] >= self.periodo.fecha_inicio)
            & (df_react["f_dt"] <= self.periodo.fecha_final)
        ]
        df_react = df_react[
            df_react["estado_origen"].isin(VALID_REACT_ORIGINS)
        ]
        df_react = df_react[["orden", "f_dt", "estado_origen"]].rename(
            columns={"f_dt": "fecha"}
        )
        nuevas = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= self.periodo.fecha_inicio)
            & (self.df_subs_full["f_ini_dt"] <= self.periodo.fecha_final)
        ]
        if not nuevas.empty:
            df_react = df_react[~df_react["orden"].isin(nuevas["orden"])]
        if not df_react.empty:
            df_react = df_react[df_react["orden"].isin(act_fin["orden"])]
        return df_react

    def get_corte_impagado(self) -> pd.DataFrame:
        df = self.df_clean_logs.copy()
        mask_corte = df["log_norm"].str.contains(
            CORTE_IMPAGADO_EVENT, na=False
        )
        df_corte = df[mask_corte]
        df_corte = df_corte.assign(
            f_min=df_corte["f_dt"].dt.floor("min")
        )
        df_corte = df_corte.drop_duplicates(subset=["orden", "f_min"])
        df_corte = df_corte[
            (df_corte["f_dt"] >= self.periodo.fecha_inicio)
            & (df_corte["f_dt"] <= self.periodo.fecha_final)
        ]
        return df_corte[["orden", "f_dt", "nota"]].rename(
            columns={"f_dt": "fecha_corte", "nota": "motivo_corte"}
        )

    def run(self):
        self.load_data()
        self.build_clean_data()
        periodo_label = self.periodo.label()

        act_ini = self.get_active_at(
            self.periodo.fecha_inicio, strictly_before=True
        )
        act_fin = self.get_active_at(
            self.periodo.fecha_final, strictly_before=False
        )
        nuevos = self.df_subs_full[
            (self.df_subs_full["f_ini_dt"] >= self.periodo.fecha_inicio)
            & (
                self.df_subs_full["f_ini_dt"]
                <= self.periodo.fecha_final
            )
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
        total_billing = round(
            billing_map.reindex(set_fin).fillna(0).sum(), 2
        )
        arpu = (
            round(total_billing / len(act_fin), 2)
            if len(act_fin) > 0
            else 0.0
        )

        df_react_all = self.get_reactivations(act_fin)
        set_react_unicas = set(df_react_all["orden"]) if not df_react_all.empty else set()
        n_react_unicas = len(set_react_unicas)
        set_react_6_8 = set(
            df_react_all[df_react_all["estado_origen"].isin({"6_churn", "8_30days"})]["orden"]
        ) if not df_react_all.empty else set()
        n_react_6_8 = len(set_react_6_8)
        counts_react: Dict[str, int] = {
            "4_paused": 0,
            "6_churn": 0,
            "8_30days": 0,
        }
        set_react_audit: Set[str] = set()
        if not df_react_all.empty:
            counts_react.update(
                df_react_all["estado_origen"].value_counts().to_dict()
            )
            set_react_audit = set(
                df_react_all[
                    df_react_all["estado_origen"].isin(
                        AUDIT_REACT_ORIGINS
                    )
                ]["orden"]
            )

        df_corte_impagado = self.get_corte_impagado()
        set_corte_impagado = (
            set(df_corte_impagado["orden"])
            if not df_corte_impagado.empty
            else set()
        )

        sobrevivientes = set_fin - set_nue
        bajas_fin_netas_ids = set_ini - sobrevivientes

        target_size = len(act_ini) - (len(act_fin) - len(nuevos))
        target_size = max(0, target_size)

        df_bajas_fin = self.df_subs_full[
            self.df_subs_full["orden"].isin(bajas_fin_netas_ids)
        ].copy()
        if "f_ini_dt" in df_bajas_fin.columns:
            df_bajas_fin = df_bajas_fin.sort_values(
                by=["f_ini_dt", "orden"], na_position="last"
            )
        else:
            df_bajas_fin = df_bajas_fin.sort_values(by=["orden"])
        df_bajas_fin = (
            df_bajas_fin.head(target_size).reset_index(drop=True)
        )
        bajas_fin_netas = len(df_bajas_fin)

        mask = (
            ~self.df_clean_logs["orden"].isin(set_fin)
            & self.df_clean_logs["f_dt"].between(
                self.periodo.fecha_inicio, self.periodo.fecha_final
            )
            & (self.df_clean_logs["estado_origen"] == ACTIVE_STATE)
            & self.df_clean_logs["estado"].isin({"4_paused", "6_churn"})
        )
        candidates = self.df_clean_logs[mask]
        first_idx = candidates.groupby("orden")["f_dt"].idxmin()
        df_bajas_op = (
            candidates.loc[first_idx][
                ["orden", "f_dt", "nota"]
            ]
            .rename(columns={"f_dt": "fecha", "nota": "motivo"})
            .reset_index(drop=True)
        )
        if not df_bajas_op.empty:
            df_bajas_op = df_bajas_op.merge(
                self.df_subs_full, on="orden", how="left"
            )

        self.db.save_historico(
            act_fin, "master_activos_cierre", periodo_label
        )
        self.db.save_historico(
            df_react_all, "master_reactivaciones", periodo_label
        )
        self.db.save_historico(
            df_bajas_fin,
            "master_bajas_detalladas",
            periodo_label,
            "Financiero",
        )
        self.db.save_historico(
            df_bajas_op,
            "master_bajas_detalladas",
            periodo_label,
            "Operativo",
        )
        self.db.save_historico(
            df_corte_impagado,
            "master_corte_impagado",
            periodo_label,
        )

        summary: List[Dict] = []
        for met, df_b in [
            ("Operativo", df_bajas_op),
            ("Financiero", df_bajas_fin),
        ]:
            b_netas = len(df_b)
            b_auditoria = b_netas + len(set_react_audit)

            summary.append(
                {
                    "periodo": periodo_label,
                    "metodo": met,
                    "activos_inicio": len(act_ini),
                    "activos_final": len(act_fin),
                    "nuevos_mes": len(set_nue),
                    "bajas_netas_balance": b_netas,
                    "bajas_brutas_auditoria": b_auditoria,
                    "react_6_churn": int(
                        counts_react.get("6_churn", 0)
                    ),
                    "react_8_30days": int(
                        counts_react.get("8_30days", 0)
                    ),
                    "react_4_paused": int(
                        counts_react.get("4_paused", 0)
                    ),
                    "churn_neto_pct": (
                        round((b_netas / len(act_ini) * 100), 4)
                        if len(act_ini) > 0
                        else 0
                    ),
                    "churn_bruto_pct": (
                        round((b_auditoria / len(act_ini) * 100), 4)
                        if len(act_ini) > 0
                        else 0
                    ),
                    "corte_impagado": len(set_corte_impagado),
                    "total_inactivos": total_inactivos,
                    "tasa_winback_pct": (
                        round(
                            (n_react_unicas / total_inactivos) * 100, 4
                        )
                        if total_inactivos > 0
                        else 0
                    ),
                    "total_billing": total_billing,
                    "arpu": arpu,
                    "reactivaciones": n_react_unicas,
                    "react_6_8": n_react_6_8,
                    "tasa_aporte_react_pct": (
                        round(
                            (n_react_6_8 / (len(set_nue) + n_react_6_8)) * 100, 4
                        )
                        if (len(set_nue) + n_react_6_8) > 0
                        else 0
                    ),
                    "indice_reemplazo_react_pct": (
                        round((n_react_6_8 / bajas_fin_netas) * 100, 4)
                        if bajas_fin_netas > 0
                        else 0
                    ),
                    "adiciones_brutas": len(set_nue) - bajas_fin_netas,
                    "adiciones_netas": (len(set_nue) + n_react_6_8) - bajas_fin_netas,
                }
            )

        self.db.save_historico(
            pd.DataFrame(summary), "cierre_churn_historico", periodo_label
        )

        if not df_inactivos.empty:
            detalle_inac = df_inactivos[["orden", "f_dt", "estado"]].rename(
                columns={"f_dt": "fecha_evento", "estado": "estado_inactivo"}
            )
            self.db.save_historico(
                detalle_inac, "master_inactivos_detallados", periodo_label
            )

        print(
            f"\nANÁLISIS COMPLETADO | Periodo: {periodo_label}"
        )
        print(
            f"Base Inicio: {len(act_ini)} | Nuevos: {len(set_nue)}"
            f" | Base Final: {len(act_fin)}"
        )
        print(
            f"FINANCIERO -> Balance Neto: {len(df_bajas_fin)}"
            f" | Auditoría: {summary[1]['bajas_brutas_auditoria']}"
        )
        print(
            f"OPERATIVO  -> Balance Neto: {len(df_bajas_op)}"
            f" | Auditoría: {summary[0]['bajas_brutas_auditoria']}"
        )
        print(
            f"CORTE IMPAGADO: {len(set_corte_impagado)}"
            " suscripciones afectadas"
        )
        print(
            f"INACTIVOS: {total_inactivos}"
            f" | Reactivaciones únicas: {n_react_unicas}"
            f" | Tasa Winback: {summary[0]['tasa_winback_pct']}%"
        )

        self.aggregate_dimensions(
            act_ini, act_fin, nuevos, df_bajas_fin,
            df_inactivos, df_react_all, df_corte_impagado,
            set_react_audit, self.calculate_lifetime_metrics()
        )

    def aggregate_dimensions(
        self,
        act_ini: pd.DataFrame,
        act_fin: pd.DataFrame,
        nuevos: pd.DataFrame,
        df_bajas_fin: pd.DataFrame,
        df_inactivos: pd.DataFrame,
        df_react_all: pd.DataFrame,
        df_corte_impagado: pd.DataFrame,
        set_react_audit: Set[str],
        df_lifecycle: pd.DataFrame,
    ):
        import json
        import pathlib

        periodo_label = self.periodo.label()
        DIMS = [
            "zona", "sucursal", "municipio", "campanna", "producto"
        ]

        df_subs = self.db.read_table("Subscripciones")
        df_subs.columns = df_subs.columns.str.lower()
        for c in ["orden_producto"] + DIMS:
            if c in df_subs.columns:
                df_subs[c] = df_subs[c].astype(str).str.strip()

        df_subs_dedup = df_subs.drop_duplicates(subset=["orden_producto"])

        df_react_audit = (
            df_react_all[
                df_react_all["estado_origen"].isin(AUDIT_REACT_ORIGINS)
            ]
            if not df_react_all.empty
            else pd.DataFrame()
        )

        react_by_origin = {
            o: (
                df_react_all[df_react_all["estado_origen"] == o]["orden"]
                if not df_react_all.empty
                else pd.Series(dtype=str)
            )
            for o in ["6_churn", "8_30days", "4_paused"]
        }

        all_rows: List[Dict] = []

        for dim in DIMS:
            if dim not in df_subs.columns:
                continue

            default = f"Sin {dim}"
            map_dict = (
                df_subs_dedup.dropna(subset=[dim])
                .set_index("orden_producto")[dim]
                .to_dict()
            )

            def cnt(df_ords):
                if df_ords is None or (
                    hasattr(df_ords, "empty") and df_ords.empty
                ):
                    return {}
                s = df_ords["orden"].astype(str).str.strip()
                return (
                    s.map(map_dict)
                    .fillna(default)
                    .value_counts()
                    .to_dict()
                )

            billing_global = pd.to_numeric(
                df_subs_dedup.set_index("orden_producto")["total"],
                errors="coerce",
            ).fillna(0.0)

            d_act_ini = cnt(act_ini)
            d_act_fin = cnt(act_fin)
            d_nuevos = cnt(nuevos)
            d_bajas = cnt(df_bajas_fin)
            d_inact = cnt(df_inactivos)
            d_react = cnt(df_react_all)
            d_react_aud = cnt(df_react_audit)
            d_corte = cnt(df_corte_impagado)
            d_react_6 = cnt(
                pd.DataFrame(
                    {"orden": react_by_origin["6_churn"]}
                )
            )
            d_react_8 = cnt(
                pd.DataFrame(
                    {"orden": react_by_origin["8_30days"]}
                )
            )
            d_react_4 = cnt(
                pd.DataFrame(
                    {"orden": react_by_origin["4_paused"]}
                )
            )

            lc = df_lifecycle.copy()
            lc["_dim"] = (
                lc["orden"]
                .astype(str)
                .str.strip()
                .map(map_dict)
                .fillna(default)
            )
            g_lc = lc.groupby("_dim")
            d_total = g_lc.size().to_dict()
            d_con_churn = g_lc["dias_activo"].count().to_dict()
            d_con_react = g_lc["dias_cancelado"].count().to_dict()
            d_prom_act = g_lc["dias_activo"].mean().to_dict()
            d_prom_can = g_lc["dias_cancelado"].mean().to_dict()

            valores = sorted(
                set(
                    list(d_act_ini)
                    + list(d_act_fin)
                    + list(d_nuevos)
                    + list(d_bajas)
                    + list(d_inact)
                    + list(d_react)
                    + list(d_corte)
                    + list(d_react_6)
                    + list(d_react_8)
                    + list(d_react_4)
                    + list(d_total)
                )
            )

            for val in valores:
                a_ini = d_act_ini.get(val, 0)
                a_fin = d_act_fin.get(val, 0)
                nv = d_nuevos.get(val, 0)
                bn = max(0, a_ini + nv - a_fin)
                bb = bn + d_react_aud.get(val, 0)
                inac = d_inact.get(val, 0)
                reac = d_react.get(val, 0)
                react_6_8_count = d_react_6.get(val, 0) + d_react_8.get(val, 0)

                billing_val = 0
                if a_fin > 0 and not act_fin.empty:
                    ordens_fin = (
                        act_fin["orden"].astype(str).str.strip()
                    )
                    mask = (
                        ordens_fin.map(map_dict)
                        .fillna(default)
                        == val
                    )
                    billing_val = round(
                        billing_global.reindex(
                            ordens_fin[mask]
                        )
                        .fillna(0)
                        .sum(),
                        2,
                    )

                all_rows.append(
                    {
                        "dimension": dim,
                        "valor": val,
                        "activos_inicio": a_ini,
                        "activos_final": a_fin,
                        "nuevos": nv,
                        "bajas_netas": bn,
                        "churn_neto_pct": (
                            round((bn / a_ini) * 100, 4)
                            if a_ini > 0
                            else 0
                        ),
                        "bajas_brutas": bb,
                        "churn_bruto_pct": (
                            round((bb / a_ini) * 100, 4)
                            if a_ini > 0
                            else 0
                        ),
                        "react_6_churn": d_react_6.get(val, 0),
                        "react_8_30days": d_react_8.get(val, 0),
                        "react_4_paused": d_react_4.get(val, 0),
                        "total_inactivos": inac,
                        "reactivaciones": reac,
                        "react_6_8": react_6_8_count,
                        "tasa_aporte_react_pct": (
                            round(
                                (react_6_8_count / (nv + react_6_8_count)) * 100, 4
                            )
                            if (nv + react_6_8_count) > 0
                            else 0
                        ),
                        "indice_reemplazo_react_pct": (
                            round((react_6_8_count / bn) * 100, 4)
                            if bn > 0
                            else 0
                        ),
                        "adiciones_brutas": nv - bn,
                        "adiciones_netas": (nv + react_6_8_count) - bn,
                        "tasa_winback_pct": (
                            round((reac / inac) * 100, 4)
                            if inac > 0
                            else 0
                        ),
                        "corte_impagado": d_corte.get(val, 0),
                        "total_ordenes": d_total.get(val, 0),
                        "con_churn": d_con_churn.get(val, 0),
                        "con_reactivacion": d_con_react.get(val, 0),
                        "prom_dias_activo": (
                            round(d_prom_act.get(val, 0), 2)
                            if pd.notna(d_prom_act.get(val))
                            else 0
                        ),
                        "prom_dias_cancelado": (
                            round(d_prom_can.get(val, 0), 2)
                            if pd.notna(d_prom_can.get(val))
                        else 0
                    ),
                    "total_billing": billing_val,
                    "arpu": (
                        round(billing_val / a_fin, 2)
                        if a_fin > 0
                        else 0.0
                    ),
                }
                )

        df_result = pd.DataFrame(all_rows)
        self.db.save_historico(
            df_result, "master_churn_dimensiones", periodo_label
        )

        dims_ok = [d for d in DIMS if d in df_subs.columns]
        print(
            f"\nDIMENSIONES | {len(dims_ok)} calculadas:"
            f" {', '.join(dims_ok)}"
            f" | {len(all_rows)} filas en master_churn_dimensiones"
        )

    def calculate_lifetime_metrics(self):
        periodo_label = self.periodo.label()

        df_subs = self.df_subs_full[
            self.df_subs_full["f_ini_dt"] <= self.periodo.fecha_final
        ].copy()
        df_logs = self.df_clean_logs[
            self.df_clean_logs["f_dt"] <= self.periodo.fecha_final
        ].copy()

        churn_logs = df_logs[df_logs["estado"] == "6_churn"]
        first_churn_idx = churn_logs.groupby("orden")["f_dt"].idxmin()
        df_first_churn = churn_logs.loc[first_churn_idx][
            ["orden", "f_dt"]
        ].rename(columns={"f_dt": "f_churn"})

        progress_logs = df_logs[df_logs["estado"] == "3_progress"]
        merged = progress_logs.merge(
            df_first_churn, on="orden", how="inner"
        )
        after_churn = merged[merged["f_dt"] > merged["f_churn"]]
        first_react_idx = after_churn.groupby("orden")["f_dt"].idxmin()
        df_first_react = after_churn.loc[first_react_idx][
            ["orden", "f_dt"]
        ].rename(columns={"f_dt": "f_react"})

        df_detail = (
            df_subs[["orden", "f_ini_dt"]]
            .merge(df_first_churn, on="orden", how="left")
            .merge(df_first_react, on="orden", how="left")
        )
        df_detail["dias_activo"] = (
            df_detail["f_churn"] - df_detail["f_ini_dt"]
        ).dt.days
        df_detail["dias_cancelado"] = (
            df_detail["f_react"] - df_detail["f_churn"]
        ).dt.days

        self.db.save_historico(
            df_detail, "master_tiempos_vida", periodo_label
        )
        total_ords = len(df_detail)
        n_churn = df_detail["dias_activo"].notna().sum()
        n_react = df_detail["dias_cancelado"].notna().sum()
        avg_activo = df_detail["dias_activo"].mean()
        avg_cancelado = df_detail["dias_cancelado"].mean()

        df_global = pd.DataFrame(
            [
                {
                    "total_ordenes": total_ords,
                    "con_churn": n_churn,
                    "con_reactivacion": n_react,
                    "prom_dias_activo": (
                        round(avg_activo, 2)
                        if pd.notna(avg_activo)
                        else 0
                    ),
                    "prom_dias_cancelado": (
                        round(avg_cancelado, 2)
                        if pd.notna(avg_cancelado)
                        else 0
                    ),
                }
            ]
        )
        self.db.save_historico(
            df_global, "master_tiempo_global", periodo_label
        )

        print(
            f"\nTIEMPOS DE VIDA | {total_ords} órdenes"
        )
        print(
            f"  Promedio días activo: {df_global.iloc[0]['prom_dias_activo']}"
            f" | basado en {n_churn} órdenes con churn"
        )
        print(
            f"  Promedio días cancelado: "
            f"{df_global.iloc[0]['prom_dias_cancelado']}"
            f" | basado en {n_react} órdenes con reactivación"
        )

        return df_detail
