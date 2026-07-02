from __future__ import annotations
from datetime import datetime

from ...database import DBConnector
from ...config import DB_SCHEMA, TableNames
from ..config import DIMENSIONES, dim_col
from .core import _build_where_filtros, _build_fecha_fin_sql


def compute_probabilidad_etapa8(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "c")
    params = params_dim + fecha_params

    q_e8 = f"""
        SELECT COUNT(*)::int AS total_clientes
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
        WHERE {where_dim}
          {fecha_sql}
    """
    df_total = db.query(q_e8, params=params)
    total = df_total.iloc[0]["total_clientes"] if not df_total.empty else 0

    q_count = f"""
        SELECT COUNT(DISTINCT c.id)::int AS cnt
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
        LEFT JOIN {DB_SCHEMA}.{TableNames.CRM_LOGS} l ON l.client_id = c.id AND l.nueva_etapa = 'etapa_8_devueltos'
        WHERE {where_dim}
          AND (c.etapa_actual = 'etapa_8_devueltos' OR l.client_id IS NOT NULL)
          {fecha_sql}
    """
    df_count = db.query(q_count, params=params)
    count_e8 = df_count.iloc[0]["cnt"] if not df_count.empty else 0
    pct = round(count_e8 * 100.0 / total, 2) if total > 0 else 0.0

    return {"total_clientes": total, "count_etapa8": count_e8, "pct": pct}


def compute_probabilidad_perdido(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "c")
    params = params_dim + fecha_params

    q = f"""
        SELECT
            COUNT(*)::int AS total_clientes,
            COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS count_perdido,
            ROUND(COUNT(*) FILTER (WHERE c.ganado = 'perdido') * 100.0 / NULLIF(COUNT(*), 0), 2) AS pct
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
        WHERE {where_dim}
          {fecha_sql}
    """
    df = db.query(q, params=params)
    return df.to_dict("records")[0] if not df.empty else {}
