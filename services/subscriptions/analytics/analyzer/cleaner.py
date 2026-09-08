from __future__ import annotations

import pandas as pd

from core.config import (
    ACTIVO_FALSE_TOKENS,
    ACTIVO_TRUE_TOKENS,
    EXCLUDED_STATE,
    SUBS_STATE_TO_LOG_MAP,
)

# OPTIMIZACIÓN Y REUTILIZACIÓN: Importamos la función de utilidades compartida del sistema
from core.utils import normalize_text


def parse_archivado(series: pd.Series) -> pd.Series:
    """Marca de archivado (plan gratuito) a partir de la columna `activo`.

    Un valor fuera de los dos vocabularios conocidos NO se asume archivado: eso
    sacaria clientes de pago de la base activa sin dejar rastro. Se avisa por
    consola (el log del calculo lo recoge) y se trata como activo.
    """
    limpio = series.astype(str).str.strip().str.lower()
    es_true = limpio.isin(ACTIVO_TRUE_TOKENS)
    es_false = limpio.isin(ACTIVO_FALSE_TOKENS)

    desconocidos = limpio[~es_true & ~es_false]
    if not desconocidos.empty:
        muestra = sorted(desconocidos.unique())[:5]
        print(
            f"AVISO: la columna 'activo' trae {len(desconocidos)} valores no"
            f" reconocidos {muestra}; se cuentan como activos."
            " Revisa el formato del export antes de fiarte de los gratuitos."
        )

    return es_false


def _normalize_string_series(series: pd.Series) -> pd.Series:
    """Normaliza una serie de texto mapeando solo los valores únicos para máxima velocidad."""
    unique_vals = series.dropna().unique()
    # Mapeamos vectorialmente usando la única fuente de verdad alfanumérica
    mapping = {val: normalize_text(val) for val in unique_vals}
    return series.map(mapping)

FREE_META_COLS = ["orden", "fecha_gratuito"]


def build_free_meta(df_free_raw):
    """
    Fechas semilla de paso a plan gratuito: (orden, fecha_gratuito).

    Solo se usan para las suscripciones archivadas que no traen el log real
    (ver `services.subscriptions.analytics.free_plans`).
    """
    if df_free_raw is None or df_free_raw.empty:
        return pd.DataFrame(columns=FREE_META_COLS)
    df = df_free_raw.copy()
    df.columns = df.columns.str.lower()
    df = df.rename(columns={"orden_producto": "orden"})
    df["orden"] = df["orden"].astype(str).str.strip()
    df["fecha_gratuito"] = pd.to_datetime(df["fecha_gratuito"], errors="coerce")
    df = df.dropna(subset=["fecha_gratuito"]).drop_duplicates(subset=["orden"])
    return df[FREE_META_COLS]


def build_clean_data(df_subs_raw, df_logs, df_logs_v15):
    df = df_subs_raw.copy()
    df.columns = df.columns.str.lower()
    df = df.rename(columns={"orden_producto": "orden", "fecha_inicio": "f_ini"})
    
    df["orden"] = df["orden"].astype(str).str.strip()
    df["total"] = pd.to_numeric(df["total"], errors="coerce").fillna(0.0)
    df["f_ini_dt"] = pd.to_datetime(df["f_ini"], errors="coerce")

    # `activo` viene del export: false/vacio = suscripcion archivada.
    if "activo" in df.columns:
        df["archivado"] = parse_archivado(df["activo"])
    else:
        df["archivado"] = False

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
