# backend/support/queries.py
from __future__ import annotations
import json
import logging
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames

logger = logging.getLogger(__name__)

def get_support_metric_totals() -> dict:
    """Retorna las métricas globales e individuales por Grupo de Trabajo."""
    db = DBConnector()
    try:
        df = db.query(f"SELECT resumen_global, por_grupo_trabajo FROM {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {"resumen_global": {}, "por_grupo_trabajo": {}}
        
        row = df.iloc[0]
        return {
            "resumen_global": json.loads(row["resumen_global"]) if row["resumen_global"] else {},
            "por_grupo_trabajo": json.loads(row["por_grupo_trabajo"]) if row["por_grupo_trabajo"] else {}
        }
    except Exception:
        logger.exception("Error al consultar métricas globales de soporte")
        return {"resumen_global": {}, "por_grupo_trabajo": {}}


def get_support_dimension_metrics() -> list[dict]:
    """Retorna las métricas desglosadas por dimensiones (Sucursal, Zona, Municipio)."""
    db = DBConnector()
    try:
        df = db.read_table(TableNames.SUPPORT_DIMENSIONES_HISTORICO)
        if df.empty:
            return []
        
        result = []
        for _, row in df.iterrows():
            result.append({
                "dimension": row["dimension"],
                "valor": row["valor"],
                "grupo_trabajo": row["grupo_trabajo"],
                "metricas": json.loads(row["metricas"]) if row["metricas"] else {}
            })
        return result
    except Exception:
        logger.exception("Error al consultar métricas dimensionales de soporte")
        return []