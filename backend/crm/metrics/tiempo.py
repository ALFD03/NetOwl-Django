from __future__ import annotations
from datetime import datetime

import pandas as pd

from ...database import DBConnector
from ...config import DB_SCHEMA, TableNames
from ..config import ETAPA_ORDER, DIMENSIONES, dim_col
from .core import _build_where_filtros, _build_fecha_fin_sql


def compute_tiempo_por_etapa(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
) -> list[dict]:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "l")
    params = params_dim + fecha_params

    query = f"""
        SELECT l.etapa_anterior AS etapa, l.duracion_horas
        FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
        JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
        WHERE {where_dim}
          AND l.duracion_horas IS NOT NULL
          AND l.etapa_anterior != 'etapa_7_instalados'
          {fecha_sql}
    """
    df = db.query(query, params=params)
    if df.empty:
        return []

    etapa_order_map = {e: i for i, e in enumerate(ETAPA_ORDER)}
    records = []
    for etapa, group in df.groupby("etapa", sort=False):
        h = group["duracion_horas"].dropna()
        n = len(h)
        records.append({
            "etapa": etapa,
            "total_movimientos": n,
            "tiempo_promedio_horas": round(float(h.mean()), 2),
            "tiempo_mediana_horas": round(float(h.median()), 2),
            "tiempo_min_horas": round(float(h.min()), 2),
            "tiempo_max_horas": round(float(h.max()), 2),
            "tiempo_std_horas": round(float(h.std(ddof=0)), 2) if n > 1 else None,
        })

    records.sort(key=lambda r: etapa_order_map.get(r["etapa"], 999))
    return records

def compute_tiempo_instalacion(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)

    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]

    params = params_dim + fecha_params

    query = f"""
        SELECT
            COUNT(*)::int AS total_instalados,
            ROUND(AVG(c.duracion_total_horas)::numeric, 2)::float8 AS horas_promedio,
            ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY c.duracion_total_horas)::numeric, 2)::float8 AS horas_p25,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.duracion_total_horas)::numeric, 2)::float8 AS horas_mediana,
            ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY c.duracion_total_horas)::numeric, 2)::float8 AS horas_p75,
            ROUND(MIN(c.duracion_total_horas)::numeric, 2)::float8 AS horas_min,
            ROUND(MAX(c.duracion_total_horas)::numeric, 2)::float8 AS horas_max,
            ROUND(STDDEV(c.duracion_total_horas)::numeric, 2)::float8 AS horas_std
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
        WHERE {where_dim}
          AND c.ganado = 'ganado'
          AND c.duracion_total_horas IS NOT NULL
          {fecha_sql}
    """
    df = db.query(query, params=params)
    return df.to_dict("records")[0] if not df.empty else {}
