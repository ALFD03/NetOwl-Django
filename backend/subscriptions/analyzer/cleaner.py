from __future__ import annotations
import pandas as pd
import unicodedata
from ...conf_config import EXCLUDED_STATE, SUBS_STATE_TO_LOG_MAP

def _normalize_string_series(series: pd.Series) -> pd.Series:
    """Normaliza una serie de texto mapeando solo los valores únicos para máxima velocidad."""
    unique_vals = series.dropna().unique()
    mapping = {}
    for val in unique_vals:
        val_str = str(val).strip().lower()
        # Normalización unicode rápida para remover acentos
        normalized = (
            unicodedata.normalize("NFKD", val_str)
            .encode("ascii", "ignore")
            .decode("utf-8")
        )
        mapping[val] = normalized.strip()
    return series.map(mapping)

def build_clean_data(df_subs_raw, df_logs, df_logs_v15):
    df = df_subs_raw.copy()
    df.columns = df.columns.str.lower()
    df = df.rename(columns={"orden_producto": "orden", "fecha_inicio": "f_ini"})
    
    df["orden"] = df["orden"].astype(str).str.strip()
    df["total"] = pd.to_numeric(df["total"], errors="coerce").fillna(0.0)
    df["f_ini_dt"] = pd.to_datetime(df["f_ini"], errors="coerce")

    if "estado" in df.columns:
        # Aplicamos la normalización rápida por mapeo de únicos
        df["estado"] = _normalize_string_series(df["estado"])
        df["estado"] = df["estado"].map(SUBS_STATE_TO_LOG_MAP).fillna(EXCLUDED_STATE)
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
    
    combined["log_norm"] = _normalize_string_series(combined["nota"])
    
    combined = (
        combined.dropna(subset=["orden", "f_dt"])
        .sort_values(["orden", "f_dt"])
    ).reset_index(drop=True)
    
    # Agrupación vectorizada para estado_origen
    combined["estado_origen"] = combined.groupby("orden", sort=False)["estado"].shift(1)

    return df_subs_full, combined
