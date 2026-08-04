# backend/support/metrics.py
from __future__ import annotations
import math
import pandas as pd
from typing import Any, Dict
from backend.support.config import RESOLVED_STAGES

def _clean_nan(obj: Any) -> Any:
    """Limpia los NaN e Inf para serialización JSON segura."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj

def compute_metrics_set(df_subset: pd.DataFrame) -> Dict[str, Any]:
    """
    Calcula el paquete completo de las 4 métricas para cualquier corte de dataframe:
    1. Porcentaje de tickets resueltos
    2. Tiempo medio de cierre de tickets
    3. Porcentaje de tickets rezagados de periodos anteriores
    4. Tiempo promedio de primera respuesta
    """
    total_tickets = len(df_subset)
    if total_tickets == 0:
        return {
            "total_tickets": 0,
            "tickets_resueltos": 0,
            "pct_resueltos": 0.0,
            "tiempo_medio_cierre_horas": 0.0,
            "pct_rezagados": 0.0,
            # "tiempo_promedio_primera_respuesta_horas": 0.0
        }

    # Evaluar estado resuelto
    df_subset = df_subset.copy()
    df_subset["etapa_clean"] = df_subset["etapa"].astype(str).str.strip().str.lower()
    df_subset["es_resuelto"] = df_subset["etapa_clean"].isin(RESOLVED_STAGES)
    
    df_resueltos = df_subset[df_subset["es_resuelto"] == True]
    num_resueltos = len(df_resueltos)
    
    # 1. Porcentaje de tickets resueltos = (Tickets en estado Resuelto / Todos los tickets) * 100
    pct_resueltos = round((num_resueltos / total_tickets) * 100, 2)
    
    # 2. Tiempo medio de cierre de tickets = Sum(Tiempo total de cierre en resuelto) / Total tickets resueltos
    mttr = round(float(df_resueltos["duracion_total_horas"].mean()), 2) if num_resueltos > 0 else 0.0
    
    # 3. Porcentaje de tickets rezagados = ((Total Tickets - Cantidad Resueltos) / Total Tickets) * 100
    num_rezagados = total_tickets - num_resueltos
    pct_rezagados = round((num_rezagados / total_tickets) * 100, 2)
    
    # 4. Tiempo promedio de Primera Respuesta = Sum(hora atencion/actualización - hora creación) / Total tickets
    # Se calcula en horas desde la creación hasta la actualización de la primera etapa
    # df_subset["tiempo_respuesta"] = (
    #     pd.to_datetime(df_subset["ultima_actualizacion_etapa"]) - pd.to_datetime(df_subset["creado_el"])
    # ).dt.total_seconds() / 3600.0
    
    # tiempo_promedio_respuesta = round(float(df_subset["tiempo_respuesta"].clip(lower=0).mean()), 2) if total_tickets > 0 else 0.0

    metrics = {
        "total_tickets": total_tickets,
        "tickets_resueltos": num_resueltos,
        "tickets_rezagados": num_rezagados,
        "pct_resueltos": pct_resueltos,
        "tiempo_medio_cierre_horas": mttr,
        "pct_rezagados": pct_rezagados,
        # "tiempo_promedio_primera_respuesta_horas": tiempo_promedio_respuesta
    }
    
    return _clean_nan(metrics)