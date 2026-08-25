from __future__ import annotations
import json
import logging
from typing import Any, Dict, List, Optional
import pandas as pd

from ..conf_config import DB_SCHEMA, TableNames
from ..database import DBConnector

logger = logging.getLogger(__name__)


def _parse_jsonb(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


def get_crm_periodos() -> List[str]:
    db = DBConnector()
    try:
        df = db.query(f"SELECT DISTINCT periodo_reporte FROM {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} ORDER BY periodo_reporte DESC")
        if df.empty:
            return []
        return df["periodo_reporte"].tolist()
    except Exception:
        logger.exception("Error al consultar periodos de CRM")
        return []


def get_crm_cierre_historico(periodos: Optional[List[str]] = None) -> List[Dict[str, Any]]:
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
            row["efectividad"] = _parse_jsonb(row.get("efectividad")) or []

        return rows
    except Exception:
        logger.exception("Error al consultar cierre histórico de CRM")
        return []


def get_crm_metric_totals(periodo: Optional[str] = None) -> Dict[str, Any]:
    db = DBConnector()
    try:
        df_mg = db.query(f"SELECT resumen_global, tiempo_por_etapa, efectividad FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        
        resumen_global = {}
        tiempo_por_etapa = []
        efectividad = []
        if not df_mg.empty:
            resumen_global = _parse_jsonb(df_mg.iloc[0]["resumen_global"]) or {}
            tiempo_por_etapa = _parse_jsonb(df_mg.iloc[0]["tiempo_por_etapa"]) or []
            efectividad = _parse_jsonb(df_mg.iloc[0]["efectividad"]) or []

        df_hist = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO}
            ORDER BY periodo_reporte ASC
        """)
        # La efectividad por periodo se sirve desde la vista de analytics; aquí
        # sólo abultaría el payload con un JSON por periodo que nadie lee.
        if not df_hist.empty:
            historico = df_hist.drop(columns=["efectividad"], errors="ignore").to_dict(orient="records")
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
    periodos: Optional[List[str]] = None,
    dimension: Optional[str] = None
) -> List[Dict[str, Any]]:
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
                "metricas": _parse_jsonb(row["metricas"]) or {},
                "efectividad": _parse_jsonb(row["efectividad"]) or [],
            })
        return result
    except Exception:
        logger.exception("Error al consultar dimensiones de CRM")
        return []