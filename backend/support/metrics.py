# backend/support/metrics.py
from __future__ import annotations
import math
import pandas as pd
from typing import Any, Dict
from backend.support.config import RESOLVED_STAGES

def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj

def compute_metrics_for_period(
    df_creados: pd.DataFrame,
    df_resueltos: pd.DataFrame
) -> Dict[str, Any]:
    """
    Calcula las 4 métricas usando la fecha de última actualización para los resueltos:
    - total_tickets: Creados en el periodo YYYY-MM
    - tickets_resueltos: Resueltos cuya 'ultima_actualizacion_etapa' cayó en YYYY-MM
    """
    total_creados = len(df_creados)
    total_resueltos = len(df_resueltos)

    if total_creados == 0 and total_resueltos == 0:
        return {
            "total_tickets": 0,
            "tickets_resueltos": 0,
            "tickets_rezagados": 0,
            "pct_resueltos": 0.0,
            "tiempo_medio_cierre_horas": 0.0,
            "pct_rezagados": 0.0,
            "tiempo_promedio_primera_respuesta_horas": 0.0
        }

    # 1. Porcentaje de tickets resueltos = (Tickets Resueltos en el periodo / Total Creados en el periodo) * 100
    pct_resueltos = round((total_resueltos / total_creados) * 100, 2) if total_creados > 0 else 0.0

    # 2. Tiempo medio de cierre (MTTR) = Promedio de duración de los tickets resueltos en este periodo
    mttr = round(float(df_resueltos["duracion_total_horas"].mean()), 2) if total_resueltos > 0 else 0.0

    # 3. Porcentaje de tickets rezagados
    num_rezagados = max(0, total_creados - total_resueltos)
    pct_rezagados = round((num_rezagados / total_creados) * 100, 2) if total_creados > 0 else 0.0

    # 4. Tiempo promedio de primera respuesta de los tickets creados en el periodo
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
        "tiempo_medio_cierre_horas": mttr,
        "pct_rezagados": pct_rezagados,
        "tiempo_promedio_primera_respuesta_horas": tiempo_promedio_respuesta
    }
    
    return _clean_nan(metrics)