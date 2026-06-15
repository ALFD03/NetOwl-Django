from __future__ import annotations
import pandas as pd
from ...config import ACTIVE_STATE, EXCLUDED_STATE, SUBS_STATE_TO_LOG_MAP


def build_clean_data(df_subs_raw, df_logs, df_logs_v15):
    """Limpia y normaliza los datos crudos en un DataFrame unificado de logs.

    Returns:
        (df_subs_full, df_clean_logs): DataFrames limpios.
    """
    df = df_subs_raw.copy()
    df.columns = df.columns.str.lower()
    df = df.rename(columns={"orden_producto": "orden", "fecha_inicio": "f_ini"})
    df["orden"] = df["orden"].astype(str).str.strip()
    df["total"] = pd.to_numeric(df["total"], errors="coerce").fillna(0.0)
    df["f_ini_dt"] = pd.to_datetime(df["f_ini"], errors="coerce")

    if "estado" in df.columns:
        df["estado"] = (
            df["estado"].astype(str)
            .str.normalize("NFKD")
            .str.encode("ascii", errors="ignore")
            .str.decode("utf-8")
            .str.lower().str.strip()
        )
        df["estado"] = (
            df["estado"].map(SUBS_STATE_TO_LOG_MAP).fillna(EXCLUDED_STATE)
        )
    else:
        df["estado"] = EXCLUDED_STATE
    df_subs_full = df.drop_duplicates(subset=["orden"])

    l1 = df_logs.rename(columns={
        "orden": "orden", "fecha_log": "fecha",
        "log": "nota", "estado": "estado",
    })
    l2 = df_logs_v15.rename(columns={
        "orden": "orden", "tipo": "nota",
        "categoria": "cat", "fecha": "fecha",
    })
    l2["estado"] = (
        l2["cat"]
        .map({"En progreso": "3_progress", "Cerrado": "6_churn"})
        .fillna(l2["cat"])
    )

    combined = pd.concat([l1, l2], ignore_index=True, sort=False)
    combined["orden"] = combined["orden"].astype(str).str.strip()
    combined["estado"] = combined["estado"].astype(str).str.strip().str.lower()
    combined["f_dt"] = pd.to_datetime(combined["fecha"], errors="coerce")
    combined["log_norm"] = (
        combined["nota"].astype(str)
        .str.normalize("NFKD")
        .str.encode("ascii", errors="ignore")
        .str.decode("utf-8")
        .str.lower().str.strip()
    )
    combined = (
        combined.dropna(subset=["orden", "f_dt"])
        .sort_values(["orden", "f_dt"])
    )
    combined["estado_origen"] = combined.groupby("orden")["estado"].shift(1)

    return df_subs_full, combined
