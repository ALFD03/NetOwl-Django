from __future__ import annotations
from datetime import datetime

from ...database import DBConnector
from ...conf_config import DB_SCHEMA, TableNames
from ..crm_config import DIMENSIONES, dim_col
from .core import _build_where_filtros


def compute_rescate_perdidos(
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
        WITH perdidos AS (
            SELECT id FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
            WHERE {where_dim}
              AND c.ganado = 'perdido'
              {fecha_sql}
        )
        SELECT
            (SELECT COUNT(*) FROM perdidos)::int AS total_perdidos,
            COALESCE(COUNT(DISTINCT l.client_id)::int, 0) AS rescatados,
            ROUND(
                COALESCE(COUNT(DISTINCT l.client_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM perdidos), 0), 0), 2
            ) AS pct_rescate
        FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
        WHERE l.client_id IN (SELECT id FROM perdidos)
          AND l.nueva_etapa = 'etapa_7_instalados'
    """
    df = db.query(query, params=params)
    return df.to_dict("records")[0] if not df.empty else {}
