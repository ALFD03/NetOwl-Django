from __future__ import annotations
import pandas as pd
from typing import Any, Dict, List


def compute_distribucion_perdidos(df_perdidos: pd.DataFrame) -> List[Dict[str, Any]]:
    if df_perdidos.empty or "motivo_perdida" not in df_perdidos.columns:
        return []

    motivos = df_perdidos["motivo_perdida"].fillna("Sin Especificar").astype(str).str.strip()
    motivos = motivos.replace(["", "nan", "None", "<NA>"], "Sin Especificar")
    
    total = len(motivos)
    if total == 0:
        return []

    counts = motivos.value_counts()
    result = []
    for motivo, count in counts.items():
        result.append({
            "motivo": motivo,
            "total": int(count),
            "pct": round((int(count) / total) * 100, 2),
        })
    return result


def compute_distribucion_etapa8(
    df_logs_e8: pd.DataFrame, 
    df_clients: pd.DataFrame
) -> List[Dict[str, Any]]:
    if df_logs_e8.empty:
        return []

    # Obtener IDs únicos de clientes devueltos en el periodo
    cids = df_logs_e8["client_id"].dropna().unique()
    if len(cids) == 0:
        return []

    df_subset = df_clients[df_clients["id"].isin(cids)]
    if df_subset.empty or "devolver_oportunidad" not in df_subset.columns:
        return []

    motivos = df_subset["devolver_oportunidad"].fillna("Sin Especificar").astype(str).str.strip()
    motivos = motivos.replace(["", "nan", "None", "<NA>"], "Sin Especificar")
    
    total = len(motivos)
    if total == 0:
        return []

    counts = motivos.value_counts()
    result = []
    for motivo, count in counts.items():
        result.append({
            "motivo": motivo,
            "total": int(count),
            "pct": round((int(count) / total) * 100, 2),
        })
    return result