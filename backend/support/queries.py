# backend/support/queries.py

from __future__ import annotations
import json
import logging
from typing import Any
import pandas as pd
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
            SELECT * FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
            {where_clause}
            ORDER BY periodo_reporte DESC
        """, params=params)

        if df.empty:
            return []
        return df.to_dict(orient="records")
    except Exception:
        logger.exception("Error al consultar cierre histórico de soporte")
        return []

def get_support_metric_totals(periodo: str | None = None) -> dict:
    """Calcula al vuelo (en memoria) el promedio histórico general asegurando que no existan KeyErrors."""
    db = DBConnector()
    try:
        df_hist = db.query(f"SELECT * FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} ORDER BY periodo_reporte ASC")
        
        expected_cols = [
            "total_tickets", "tickets_resueltos", "tickets_cancelados", "tickets_rezagados",
            "pct_resueltos", "pct_cancelados", "pct_rezagados",
            "tiempo_medio_cierre_horas", "tiempo_mediana_cierre_horas",
            "tiempo_promedio_primera_respuesta_horas"
        ]
        
        historico = []
        resumen_global = {}

        if not df_hist.empty:
            for col in expected_cols:
                if col not in df_hist.columns:
                    df_hist[col] = 0.0
                else:
                    df_hist[col] = pd.to_numeric(df_hist[col], errors="coerce").fillna(0.0)

            historico = df_hist.to_dict(orient="records")

            resumen_global = {
                "total_tickets_promedio_mensual": round(float(df_hist["total_tickets"].mean()), 2),
                "tickets_resueltos_promedio_mensual": round(float(df_hist["tickets_resueltos"].mean()), 2),
                "tickets_cancelados_promedio_mensual": round(float(df_hist["tickets_cancelados"].mean()), 2),
                "tickets_rezagados_promedio_mensual": round(float(df_hist["tickets_rezagados"].mean()), 2),
                "pct_resueltos": round(float(df_hist["pct_resueltos"].mean()), 2),
                "pct_cancelados": round(float(df_hist["pct_cancelados"].mean()), 2),
                "pct_rezagados": round(float(df_hist["pct_rezagados"].mean()), 2),
                "tiempo_medio_cierre_horas": round(float(df_hist["tiempo_medio_cierre_horas"].mean()), 2),
                "tiempo_mediana_cierre_horas": round(float(df_hist["tiempo_mediana_cierre_horas"].mean()), 2),
                "tiempo_promedio_primera_respuesta_horas": round(float(df_hist["tiempo_promedio_primera_respuesta_horas"].mean()), 2),
            }

        # 2. Leer dimensiones por grupo de trabajo y promediar en memoria
        df_grupos = db.query(f"""
            SELECT grupo_trabajo, valor, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
            WHERE dimension = 'grupo_trabajo'
        """)

        por_grupo = {}
        if not df_grupos.empty:
            group_records = []
            for _, r in df_grupos.iterrows():
                m = _parse_jsonb(r["metricas"]) or {}
                m["grupo_trabajo"] = r["valor"]
                group_records.append(m)

            df_g = pd.DataFrame(group_records)
            for col in expected_cols:
                if col not in df_g.columns:
                    df_g[col] = 0.0
                else:
                    df_g[col] = pd.to_numeric(df_g[col], errors="coerce").fillna(0.0)

            for g_name, df_sub in df_g.groupby("grupo_trabajo"):
                por_grupo[g_name] = {
                    "total_tickets": round(float(df_sub["total_tickets"].mean()), 2),
                    "tickets_resueltos": round(float(df_sub["tickets_resueltos"].mean()), 2),
                    "tickets_cancelados": round(float(df_sub["tickets_cancelados"].mean()), 2),
                    "tickets_rezagados": round(float(df_sub["tickets_rezagados"].mean()), 2),
                    "pct_resueltos": round(float(df_sub["pct_resueltos"].mean()), 2),
                    "pct_cancelados": round(float(df_sub["pct_cancelados"].mean()), 2),
                    "pct_rezagados": round(float(df_sub["pct_rezagados"].mean()), 2),
                    "tiempo_medio_cierre_horas": round(float(df_sub["tiempo_medio_cierre_horas"].mean()), 2),
                    "tiempo_mediana_cierre_horas": round(float(df_sub["tiempo_mediana_cierre_horas"].mean()), 2),
                    "tiempo_promedio_primera_respuesta_horas": round(float(df_sub["tiempo_promedio_primera_respuesta_horas"].mean()), 2),
                }

        return {
            "resumen_global": resumen_global,
            "por_grupo_trabajo": por_grupo,
            "historico_tendencias": historico
        }
    except Exception as e:
        logger.exception("Error al calcular promedios globales de soporte: %s", str(e))
        return {"resumen_global": {}, "por_grupo_trabajo": {}, "historico_tendencias": []}

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