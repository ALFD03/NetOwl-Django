from __future__ import annotations
import math
import pandas as pd
from typing import Any, Dict, List
from ..crm_config import ETAPA_ORDER


def _compute_stats_distribution(series: pd.Series) -> Dict[str, float]:
    s = series.dropna()
    s = s[s >= 0]
    n = len(s)
    
    if n == 0:
        return {
            "promedio": 0.0,
            "mediana": 0.0,
            "p25": 0.0,
            "p75": 0.0,
            "min": 0.0,
            "max": 0.0,
            "std": 0.0,
            "pct_excede_promedio": 0.0,
            "pct_excede_mediana": 0.0,
        }

    promedio = float(s.mean())
    mediana = float(s.median())
    p25 = float(s.quantile(0.25))
    p75 = float(s.quantile(0.75))
    min_val = float(s.min())
    max_val = float(s.max())
    std_val = float(s.std(ddof=0)) if n > 1 else 0.0

    pct_excede_prom = round(float((s > promedio).sum() / n) * 100, 2)
    pct_excede_med = round(float((s > mediana).sum() / n) * 100, 2)

    return {
        "promedio": round(promedio, 2),
        "mediana": round(mediana, 2),
        "p25": round(p25, 2),
        "p75": round(p75, 2),
        "min": round(min_val, 2),
        "max": round(max_val, 2),
        "std": round(std_val, 2),
        "pct_excede_promedio": pct_excede_prom,
        "pct_excede_mediana": pct_excede_med,
    }


def compute_tiempos_instalacion_y_perdida(
    df_ganados: pd.DataFrame, 
    df_perdidos: pd.DataFrame
) -> Dict[str, Dict[str, float]]:
    dur_ganados = df_ganados["duracion_total_horas"] if not df_ganados.empty and "duracion_total_horas" in df_ganados.columns else pd.Series(dtype=float)
    dur_perdidos = df_perdidos["duracion_total_horas"] if not df_perdidos.empty and "duracion_total_horas" in df_perdidos.columns else pd.Series(dtype=float)

    return {
        "instalacion": _compute_stats_distribution(dur_ganados),
        "perdida": _compute_stats_distribution(dur_perdidos),
    }


def compute_tiempo_por_etapa(df_logs: pd.DataFrame) -> List[Dict[str, Any]]:
    if df_logs.empty or "duracion_horas" not in df_logs.columns:
        return []

    # Filtrar duraciones válidas y excluir etapa 7 como origen
    df_valid = df_logs[
        (df_logs["duracion_horas"].notna()) & 
        (df_logs["duracion_horas"] >= 0) & 
        (df_logs["etapa_anterior"] != "etapa_7_instalados")
    ].copy()

    if df_valid.empty:
        return []

    etapa_order_map = {e: i for i, e in enumerate(ETAPA_ORDER)}
    records = []

    for etapa, group in df_valid.groupby("etapa_anterior", sort=False):
        h = group["duracion_horas"]
        stats = _compute_stats_distribution(h)
        n = len(h.dropna())
        if n == 0:
            continue

        records.append({
            "etapa": etapa,
            "total_movimientos": n,
            "tiempo_promedio_horas": stats["promedio"],
            "tiempo_mediana_horas": stats["mediana"],
            "tiempo_p25_horas": stats["p25"],
            "tiempo_p75_horas": stats["p75"],
            "tiempo_min_horas": stats["min"],
            "tiempo_max_horas": stats["max"],
            "tiempo_std_horas": stats["std"],
            "pct_excede_promedio": stats["pct_excede_promedio"],
            "pct_excede_mediana": stats["pct_excede_mediana"],
        })

    records.sort(key=lambda r: etapa_order_map.get(r["etapa"], 999))
    return records