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

def compute_metrics_set(df_subset: pd.DataFrame) -> Dict[str, Any]:
    total_tickets = len(df_subset)
    if total_tickets == 0:
        return {
            "total_tickets": 0,
            "tickets_resueltos": 0,
            "tickets_rezagados": 0,
            "pct_resueltos": 0.0,
            "tiempo_medio_cierre_horas": 0.0,
            "pct_rezagados": 0.0,
            "tiempo_promedio_primera_respuesta_horas": 0.0
        }

    df_subset = df_subset.copy()
    df_subset["etapa_clean"] = df_subset["etapa"].astype(str).str.strip().str.lower()
    df_subset["es_resuelto"] = df_subset["etapa_clean"].isin(RESOLVED_STAGES)
    
    df_resueltos = df_subset[df_subset["es_resuelto"] == True]
    num_resueltos = len(df_resueltos)
    
    pct_resueltos = round((num_resueltos / total_tickets) * 100, 2)
    mttr = round(float(df_resueltos["duracion_total_horas"].mean()), 2) if num_resueltos > 0 else 0.0
    num_rezagados = total_tickets - num_resueltos
    pct_rezagados = round((num_rezagados / total_tickets) * 100, 2)
    
    t_creado = pd.to_datetime(df_subset["creado_el"], errors="coerce")
    if "ultima_actualizacion_etapa" in df_subset.columns:
        t_actualizacion = pd.to_datetime(df_subset["ultima_actualizacion_etapa"], errors="coerce").fillna(t_creado)
    else:
        t_actualizacion = t_creado
        
    tiempo_resp_series = (t_actualizacion - t_creado).dt.total_seconds() / 3600.0
    tiempo_promedio_respuesta = round(float(tiempo_resp_series.clip(lower=0).fillna(0.0).mean()), 2) if total_tickets > 0 else 0.0

    metrics = {
        "total_tickets": total_tickets,
        "tickets_resueltos": num_resueltos,
        "tickets_rezagados": num_rezagados,
        "pct_resueltos": pct_resueltos,
        "tiempo_medio_cierre_horas": mttr,
        "pct_rezagados": pct_rezagados,
        "tiempo_promedio_primera_respuesta_horas": tiempo_promedio_respuesta
    }
    
    return _clean_nan(metrics)