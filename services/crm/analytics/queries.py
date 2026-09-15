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

logger = logging.getLogger(__name__)


def get_crm_periodos() -> list[str]:
    """Los periodos con cierre calculado, del mas reciente al mas antiguo."""
    db = DBConnector()
    try:
        df = db.query(f"SELECT DISTINCT periodo_reporte FROM {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} ORDER BY periodo_reporte DESC")
        if df.empty:
            return []
        return df["periodo_reporte"].tolist()
    except Exception:
        logger.exception("Error al consultar periodos de CRM")
        return []


def get_crm_cierre_historico(periodos: list[str] | None = None) -> list[dict[str, Any]]:
    """Los cierres de los periodos pedidos, con el JSONB ya parseado."""
    db = DBConnector()
    try:
        where_clause = ""
        params = []
        if periodos:
            placeholders = ", ".join(["%s"] * len(periodos))
            where_clause = f"WHERE periodo_reporte IN ({placeholders})"
            params = periodos

        df = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO}
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


def get_crm_metric_totals(periodo: str | None = None) -> dict[str, Any]:
    """El dashboard: promedio global, tiempos, efectividad y la serie historica.

    La serie se sirve sin los dos JSONB por periodo, que ahi nadie lee y solo
    abultarian el payload.
    """
    db = DBConnector()
    try:
        df_mg = db.query(f"SELECT resumen_global, tiempo_por_etapa, efectividad FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        
        resumen_global = {}
        tiempo_por_etapa = []
        efectividad = []
        if not df_mg.empty:
            resumen_global = parse_jsonb(df_mg.iloc[0]["resumen_global"]) or {}
            tiempo_por_etapa = parse_jsonb(df_mg.iloc[0]["tiempo_por_etapa"]) or []
            efectividad = parse_jsonb(df_mg.iloc[0]["efectividad"]) or []

        df_hist = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO}
            ORDER BY periodo_reporte ASC
        """)
        # La efectividad y el tiempo por etapa de cada periodo se sirven desde la
        # vista de analytics; aquí sólo abultarían el payload con dos JSON por
        # periodo que nadie lee.
        if not df_hist.empty:
            historico = df_hist.drop(
                columns=["efectividad", "tiempo_por_etapa"], errors="ignore"
            ).to_dict(orient="records")
        else:
            historico = []

        return {
            "resumen_global": resumen_global,
            "tiempo_por_etapa": tiempo_por_etapa,
            "efectividad": efectividad,
            "historico_tendencias": historico
        }
    except Exception:
        logger.exception("Error al consultar métricas globales de CRM")
        return {"resumen_global": {}, "tiempo_por_etapa": [], "efectividad": [], "historico_tendencias": []}


def get_crm_dimensiones(
    periodos: list[str] | None = None,
    dimension: str | None = None
) -> list[dict[str, Any]]:
    """Las filas dimensionales de los periodos pedidos, con su JSONB parseado."""
    db = DBConnector()
    try:
        clauses = []
        params = []
        if periodos:
            placeholders = ", ".join(["%s"] * len(periodos))
            clauses.append(f"periodo_reporte IN ({placeholders})")
            params.extend(periodos)
        if dimension:
            clauses.append("dimension = %s")
            params.append(dimension)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        df = db.query(f"""
            SELECT periodo_reporte, dimension, valor, metricas, efectividad
            FROM {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}
            {where_sql}
            ORDER BY periodo_reporte DESC, dimension ASC, valor ASC
        """, params=params)

        if df.empty:
            return []

        result = []
        for _, row in df.iterrows():
            result.append({
                "periodo_reporte": row["periodo_reporte"],
                "dimension": row["dimension"],
                "valor": row["valor"],
                "metricas": parse_jsonb(row["metricas"]) or {},
                "efectividad": parse_jsonb(row["efectividad"]) or [],
            })
        return result
    except Exception:
        logger.exception("Error al consultar dimensiones de CRM")
        return []