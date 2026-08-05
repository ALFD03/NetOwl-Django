# backend/support/metrics.py
from __future__ import annotations
import math
import pandas as pd
from typing import Any, Dict
from backend.support.config import RESOLVED_STAGES

def _clean_nan(obj: Any) -> Any:
    """Limpia valores NaN e Inf para garantizar serialización JSON segura."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj


def _compute_stats_for_series(series: pd.Series) -> Dict[str, float]:
    """Calcula el conjunto completo de estadísticas de cierre sobre la duración total en horas."""
    s = series.dropna()
    s = s[s >= 0]  # Filtrar inconsistencias negativas de reloj
    n = len(s)
    
    if n == 0:
        return {
            "promedio": 0.0,
            "mediana": 0.0,
            "p25": 0.0,
            "p75": 0.0,
            "std": 0.0,
            "pct_excede_promedio": 0.0,
            "pct_excede_mediana": 0.0,
        }

    promedio = float(s.mean())
    mediana = float(s.median())
    p25 = float(s.quantile(0.25))
    p75 = float(s.quantile(0.75))
    std_val = float(s.std(ddof=0)) if n > 1 else 0.0

    pct_excede_prom = round(float((s > promedio).sum() / n) * 100, 2)
    pct_excede_med = round(float((s > mediana).sum() / n) * 100, 2)

    return {
        "promedio": round(promedio, 2),
        "mediana": round(mediana, 2),
        "p25": round(p25, 2),
        "p75": round(p75, 2),
        "std": round(std_val, 2),
        "pct_excede_promedio": pct_excede_prom,
        "pct_excede_mediana": pct_excede_med,
    }


def compute_metrics_for_period(
    df_creados: pd.DataFrame,
    df_resueltos: pd.DataFrame
) -> Dict[str, Any]:
    """
    Calcula el paquete completo de métricas de Technical Support para un periodo YYYY-MM:
    - Volúmenes: Creados, Resueltos, Rezagados
    - Porcentajes: % Resueltos, % Rezagados
    - Estadísticas de Cierre: Promedio, Mediana, P25, P75, Desviación Estándar, % Excede
    - Respuesta: Tiempo promedio de primera respuesta
    """
    total_creados = len(df_creados)
    total_resueltos = len(df_resueltos)

    if total_creados == 0 and total_resueltos == 0:
        return {
            "total_tickets": 0,
            "tickets_resueltos": 0,
            "tickets_rezagados": 0,
            "pct_resueltos": 0.0,
            "pct_rezagados": 0.0,
            "tiempo_medio_cierre_horas": 0.0,
            "tiempo_mediana_cierre_horas": 0.0,
            "tiempo_p25_cierre_horas": 0.0,
            "tiempo_p75_cierre_horas": 0.0,
            "tiempo_std_cierre_horas": 0.0,
            "pct_excede_promedio_cierre": 0.0,
            "pct_excede_mediana_cierre": 0.0,
            "tiempo_promedio_primera_respuesta_horas": 0.0
        }

    # 1. Indicadores de volumen
    pct_resueltos = round((total_resueltos / total_creados) * 100, 2) if total_creados > 0 else 0.0
    num_rezagados = max(0, total_creados - total_resueltos)
    pct_rezagados = round((num_rezagados / total_creados) * 100, 2) if total_creados > 0 else 0.0

    # 2. Estadísticas de Tiempo de Cierre (duracion_total_horas)
    stats_cierre = _compute_stats_for_series(df_resueltos["duracion_total_horas"])

    # 3. Tiempo promedio de primera respuesta
    if total_creados > 0:
        t_creado = pd.to_datetime(df_creados["creado_el"], errors="coerce")
        t_act = pd.to_datetime(df_creados["ultima_actualizacion_etapa"], errors="coerce").fillna(t_creado)
        tiempo_resp_series = (t_act - t_creado).dt.total_seconds() / 3600.0
        tiempo_promedio_respuesta = round(float(tiempo_resp_series.clip(lower=0).fillna(0.0).mean()), 2)
    else:
        tiempo_promedio_respuesta = 0.0

    metrics = {
        "total_tickets": total_creados,
        "tickets_resueltos": total_resueltos,
        "tickets_rezagados": num_rezagados,
        "pct_resueltos": pct_resueltos,
        "pct_rezagados": pct_rezagados,
        "tiempo_promedio_primera_respuesta_horas": tiempo_promedio_respuesta,

        # Estadísticas Oficiales de Cierre
        "tiempo_medio_cierre_horas": stats_cierre["promedio"],
        "tiempo_mediana_cierre_horas": stats_cierre["mediana"],
        "tiempo_p25_cierre_horas": stats_cierre["p25"],
        "tiempo_p75_cierre_horas": stats_cierre["p75"],
        "tiempo_std_cierre_horas": stats_cierre["std"],
        "pct_excede_promedio_cierre": stats_cierre["pct_excede_promedio"],
        "pct_excede_mediana_cierre": stats_cierre["pct_excede_mediana"],
    }
    
    return _clean_nan(metrics)