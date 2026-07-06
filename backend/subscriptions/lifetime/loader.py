from __future__ import annotations
import logging
import pandas as pd
from ...conf_config import EXCLUDED_STATE, SUBS_STATE_TO_LOG_MAP, TableNames
from ...database import DBConnector

logger = logging.getLogger(__name__)

DIMS = ["Zona", "Sucursal", "Municipio", "campanna", "Producto"]

def _normalize_estado(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.lower()

def load_data(db=None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if db is None:
        db = DBConnector()
    subs = db.read_table(TableNames.SUBSCRIPTIONS)
    subs = subs.rename(columns={"Orden_Producto": "orden", "fecha_inicio": "f_ini"})
    subs["orden"] = subs["orden"].astype(str).str.strip()
    subs["f_ini_dt"] = pd.to_datetime(subs["f_ini"], errors="coerce")
    for col in DIMS:
        if col in subs.columns:
            subs[col] = subs[col].astype(str).str.strip()

    if "Estado" in subs.columns:
        subs["estado_subs"] = _normalize_estado(subs["Estado"])
        subs["estado_subs"] = (
            subs["estado_subs"].map(SUBS_STATE_TO_LOG_MAP).fillna(EXCLUDED_STATE)
        )
    else:
        subs["estado_subs"] = EXCLUDED_STATE
    subs = subs.drop_duplicates(subset=["orden"])

    l1 = db.read_table(TableNames.SUBSCRIPTIONS_LOGS, columns=["orden", "fecha_log", "log", "estado"])
    l1 = l1.rename(columns={"fecha_log": "fecha"})
    l1["fuente"] = "v1"

    try:
        l2 = db.read_table(TableNames.SUBSCRIPTIONS_LOGS_V15, columns=["orden", "tipo", "categoria", "fecha"])
        l2["nota"] = l2["tipo"]
        l2["estado"] = _normalize_estado(
            l2["categoria"].map({"En progreso": "3_progress", "Cerrado": "6_churn"}).fillna(l2["categoria"])
        )
        l2["fuente"] = "v15"
    except Exception:
        logger.exception("Failed to load v15 logs table")
        l2 = pd.DataFrame(columns=["orden", "fecha", "estado", "fuente"])

    return subs, l1, l2

def build_clean_logs(l1: pd.DataFrame, l2: pd.DataFrame) -> pd.DataFrame:
    cols_base = ["orden", "fecha", "estado"]
    for df in [l1, l2]:
        for c in list(df.columns):
            if c not in cols_base:
                df.drop(columns=[c], inplace=True, errors="ignore")

    combined = pd.concat([l1, l2], ignore_index=True, sort=False)
    combined["orden"] = combined["orden"].astype(str).str.strip()
    combined["estado"] = _normalize_estado(combined["estado"])
    combined["f_dt"] = pd.to_datetime(combined["fecha"], errors="coerce")
    combined = combined.dropna(subset=["orden", "f_dt"])
    combined = combined.sort_values(["orden", "f_dt"]).reset_index(drop=True)
    return combined
