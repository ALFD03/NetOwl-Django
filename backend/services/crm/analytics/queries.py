"""Lectura de lo ya calculado por el analisis de CRM.

Las metricas se guardan como JSONB -una fila por etapa no cabe en un escalar-,
asi que aqui se deshacen antes de servirlas: la vista no deberia recibir a
veces texto y a veces lista.
"""

from __future__ import annotations

import logging
from typing import Any

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.utils import parse_jsonb

from .metrics import average_closes

logger = logging.getLogger(__name__)


def get_crm_periods() -> list[str]:
    """Los periodos con cierre calculado, del mas reciente al mas antiguo."""
    db = DBConnector()
    try:
        df = db.query(f"SELECT DISTINCT periodo_reporte FROM {DB_SCHEMA}.{TableNames.CRM_CLOSE_HISTORY} ORDER BY periodo_reporte DESC")
        if df.empty:
            return []
        return df["periodo_reporte"].tolist()
    except Exception:
        logger.exception("Error al consultar periodos de CRM")
        return []


def get_crm_close_history(periods: list[str] | None = None) -> list[dict[str, Any]]:
    """Los cierres de los periodos pedidos, con el JSONB ya parseado."""
    db = DBConnector()
    try:
        where_clause = ""
        params = []
        if periods:
            placeholders = ", ".join(["%s"] * len(periods))
            where_clause = f"WHERE periodo_reporte IN ({placeholders})"
            params = periods

        df = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.CRM_CLOSE_HISTORY}
            {where_clause}
            ORDER BY periodo_reporte DESC
        """, params=params)

        if df.empty:
            return []

        rows = df.to_dict(orient="records")

        # `efectividad` viaja como JSONB: una fila por etapa del periodo. Se
        # normaliza a lista aquí para que la vista no reciba a veces texto.
        for row in rows:
            row["efectividad"] = parse_jsonb(row.get("efectividad")) or []
            row["tiempo_por_etapa"] = parse_jsonb(row.get("tiempo_por_etapa")) or []

        return rows
    except Exception:
        logger.exception("Error al consultar cierre histórico de CRM")
        return []


def get_crm_metric_totals(
    period: str | None = None, only: str | None = None,
) -> dict[str, Any]:
    """El dashboard: promedio global, tiempos, efectividad y la serie historica.

    La serie se sirve sin los dos JSONB por periodo, que ahi nadie lee y solo
    abultarian el payload.

    Con `solo`, el mismo bloque construido con ese periodo y nada mas: es el
    dashboard de quien no ve todos los periodos (`services/config/periods.py`).
    """
    if only:
        return _period_metric_totals(only)
    db = DBConnector()
    try:
        df_mg = db.query(f"SELECT resumen_global, tiempo_por_etapa, efectividad FROM {DB_SCHEMA}.{TableNames.CRM_GLOBAL_METRICS} WHERE id = 1")
        
        global_summary = {}
        time_by_stage = []
        effectiveness = []
        if not df_mg.empty:
            global_summary = parse_jsonb(df_mg.iloc[0]["resumen_global"]) or {}
            time_by_stage = parse_jsonb(df_mg.iloc[0]["tiempo_por_etapa"]) or []
            effectiveness = parse_jsonb(df_mg.iloc[0]["efectividad"]) or []

        df_hist = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.CRM_CLOSE_HISTORY}
            ORDER BY periodo_reporte ASC
        """)
        # La efectividad y el tiempo por etapa de cada periodo se sirven desde la
        # vista de analytics; aquí sólo abultarían el payload con dos JSON por
        # periodo que nadie lee.
        if not df_hist.empty:
            historical = df_hist.drop(
                columns=["efectividad", "tiempo_por_etapa"], errors="ignore"
            ).to_dict(orient="records")
        else:
            historical = []

        return {
            "resumen_global": global_summary,
            "tiempo_por_etapa": time_by_stage,
            "efectividad": effectiveness,
            "historico_tendencias": historical
        }
    except Exception:
        logger.exception("Error al consultar métricas globales de CRM")
        return {"resumen_global": {}, "tiempo_por_etapa": [], "efectividad": [], "historico_tendencias": []}


def _period_metric_totals(period: str) -> dict[str, Any]:
    """`get_crm_metric_totals` sobre un solo cierre, con la misma forma.

    El promedio de un periodo es el propio periodo, pero pasa por
    `average_closes` para que las claves sean exactamente las del global.
    """
    closes = get_crm_close_history([period])
    if not closes:
        return {"resumen_global": {}, "tiempo_por_etapa": [], "efectividad": [], "historico_tendencias": []}
    close = closes[0]
    return {
        "resumen_global": average_closes(closes),
        "tiempo_por_etapa": close["tiempo_por_etapa"],
        "efectividad": close["efectividad"],
        "historico_tendencias": [
            {k: v for k, v in close.items() if k not in ("efectividad", "tiempo_por_etapa")}
        ],
    }


def get_crm_dimensions(
    periods: list[str] | None = None,
    dimension: str | None = None
) -> list[dict[str, Any]]:
    """Las filas dimensionales de los periodos pedidos, con su JSONB parseado."""
    db = DBConnector()
    try:
        clauses = []
        params = []
        if periods:
            placeholders = ", ".join(["%s"] * len(periods))
            clauses.append(f"periodo_reporte IN ({placeholders})")
            params.extend(periods)
        if dimension:
            clauses.append("dimension = %s")
            params.append(dimension)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        df = db.query(f"""
            SELECT periodo_reporte, dimension, valor, metricas, efectividad
            FROM {DB_SCHEMA}.{TableNames.CRM_DIMENSIONS_HISTORICAL}
            {where_sql}
            ORDER BY periodo_reporte DESC, dimension ASC, valor ASC
        """, params=params)

        if df.empty:
            return []

        df["metricas"] = df["metricas"].map(lambda v: parse_jsonb(v) or {})
        df["efectividad"] = df["efectividad"].map(lambda v: parse_jsonb(v) or [])
        return df[["periodo_reporte", "dimension", "valor", "metricas", "efectividad"]].to_dict("records")
    except Exception:
        logger.exception("Error al consultar dimensiones de CRM")
        return []