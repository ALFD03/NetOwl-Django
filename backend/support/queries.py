from __future__ import annotations
import json
import logging
from typing import Any
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames

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

def get_support_periodos() -> list[str]:
    db = DBConnector()
    try:
        df = db.query(f"SELECT DISTINCT periodo_reporte FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} ORDER BY periodo_reporte DESC")
        if df.empty:
            return []
        return df["periodo_reporte"].tolist()
    except Exception:
        logger.exception("Error al consultar periodos de soporte")
        return []

def get_support_cierre_historico(periodos: list[str] | None = None) -> list[dict]:
    db = DBConnector()
    try:
        where_clause = ""
        params = []
        if periodos:
            placeholders = ", ".join(["%s"] * len(periodos))
            where_clause = f"WHERE periodo_reporte IN ({placeholders})"
            params = periodos

        df = db.query(f"""
            SELECT periodo_reporte, grupo_trabajo, total_tickets, tickets_resueltos,
                   tickets_rezagados, pct_resueltos, 
                   tiempo_medio_cierre_horas, tiempo_mediana_cierre_horas,
                   tiempo_p25_cierre_horas, tiempo_p75_cierre_horas, tiempo_std_cierre_horas,
                   pct_excede_promedio_cierre, pct_excede_mediana_cierre,
                   pct_rezagados, tiempo_promedio_primera_respuesta_horas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
            {where_clause}
            ORDER BY periodo_reporte DESC, grupo_trabajo ASC
        """, params=params)

        if df.empty:
            return []
        return df.to_dict(orient="records")
    except Exception:
        logger.exception("Error al consultar cierre histórico de soporte")
        return []

def get_support_metric_totals(periodo: str | None = None) -> dict:
    db = DBConnector()
    try:
        if periodo and periodo != "ALL":
            df = db.query(f"""
                SELECT grupo_trabajo, total_tickets, tickets_resueltos, tickets_rezagados,
                       pct_resueltos, tiempo_medio_cierre_horas, pct_rezagados,
                       tiempo_promedio_primera_respuesta_horas
                FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
                WHERE periodo_reporte = %s
            """, params=[periodo])
            
            if df.empty:
                return {"resumen_global": {}, "por_grupo_trabajo": {}}
                
            resumen_global = {}
            por_grupo = {}
            for _, r in df.iterrows():
                gt = r["grupo_trabajo"]
                m = {
                    "total_tickets": int(r["total_tickets"]),
                    "tickets_resueltos": int(r["tickets_resueltos"]),
                    "tickets_rezagados": int(r["tickets_rezagados"]),
                    "pct_resueltos": float(r["pct_resueltos"]),
                    "tiempo_medio_cierre_horas": float(r["tiempo_medio_cierre_horas"]),
                    "pct_rezagados": float(r["pct_rezagados"]),
                    "tiempo_promedio_primera_respuesta_horas": float(r["tiempo_promedio_primera_respuesta_horas"]),
                }
                if gt == "GLOBAL":
                    resumen_global = m
                else:
                    por_grupo[gt] = m
                    
            return {"resumen_global": resumen_global, "por_grupo_trabajo": por_grupo}
        else:
            df = db.query(f"SELECT resumen_global, por_grupo_trabajo FROM {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} WHERE id = 1")
            if df.empty:
                return {"resumen_global": {}, "por_grupo_trabajo": {}}
            row = df.iloc[0]
            return {
                "resumen_global": _parse_jsonb(row["resumen_global"]) or {},
                "por_grupo_trabajo": _parse_jsonb(row["por_grupo_trabajo"]) or {}
            }
    except Exception:
        logger.exception("Error al consultar métricas de soporte")
        return {"resumen_global": {}, "por_grupo_trabajo": {}}

def get_support_dimension_metrics(periodos: list[str] | None = None) -> list[dict]:
    db = DBConnector()
    try:
        where_clause = ""
        params = []
        if periodos:
            placeholders = ", ".join(["%s"] * len(periodos))
            where_clause = f"WHERE periodo_reporte IN ({placeholders})"
            params = periodos

        df = db.query(f"""
            SELECT periodo_reporte, dimension, grupo_trabajo, tipo_solicitud, razon_falla, valor, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
            {where_clause}
            ORDER BY periodo_reporte DESC, grupo_trabajo ASC, tipo_solicitud ASC
        """, params=params)

        if df.empty:
            return []

        result = []
        for _, row in df.iterrows():
            result.append({
                "periodo": row["periodo_reporte"],
                "dimension": row["dimension"],
                "grupo_trabajo": row["grupo_trabajo"],
                "tipo_solicitud": row["tipo_solicitud"],
                "razon_falla": row["razon_falla"],
                "valor": row["valor"],
                "metricas": _parse_jsonb(row["metricas"]) or {}
            })
        return result
    except Exception:
        logger.exception("Error al consultar métricas dimensionales de soporte")
        return []

def get_support_tickets_list(limit: int = 500, grupo: str | None = None, periodo: str | None = None) -> list[dict]:
    db = DBConnector()
    try:
        where_clause = "WHERE 1=1"
        params = []
        if grupo:
            where_clause += " AND grupo_trabajo = %s"
            params.append(grupo)
        if periodo and len(periodo) == 7:
            where_clause += " AND TO_CHAR(creado_el, 'YYYY-MM') = %s"
            params.append(periodo)
        
        df = db.query(f"""
            SELECT ticket_sequence, cliente, etapa, grupo_trabajo, sucursal, zona, municipio,
                   tipo_solicitud, razon_falla, solucion_falla, creado_el,
                   ultima_actualizacion_etapa, duracion_total_horas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
            {where_clause}
            ORDER BY creado_el DESC
            LIMIT {limit}
        """, params=params)
        
        if df.empty:
            return []
            
        df["creado_el"] = df["creado_el"].astype(str)
        df["ultima_actualizacion_etapa"] = df["ultima_actualizacion_etapa"].astype(str)
        df["duracion_total_horas"] = df["duracion_total_horas"].astype(float).round(2)
        return df.to_dict(orient="records")
    except Exception:
        logger.exception("Error al consultar lista de tickets de soporte")
        return []