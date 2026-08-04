# backend/support/analyzer.py
from __future__ import annotations
import json
import logging
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import SUPPORT_DIMENSIONES
from backend.support.metrics import compute_metrics_set

logger = logging.getLogger(__name__)

def run_support_analysis() -> dict:
    """Ejecuta el pipeline completo de análisis de Technical Support."""
    db = DBConnector()
    df = db.read_table(TableNames.SUPPORT_TICKETS)
    
    if df.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    # 1. Conglomerado Global
    global_metrics = compute_metrics_set(df)
    
    # 2. Desglose Por Grupo de Trabajo (ej. Atención al cliente vs. Soporte Técnico Nivel 1)
    grupos_metrics = {}
    for grupo, df_grupo in df.groupby("grupo_trabajo"):
        grupos_metrics[str(grupo)] = compute_metrics_set(df_grupo)

    # Persistir globales en JSONB
    _save_global_support_metrics(db, global_metrics, grupos_metrics)

    # 3. Desglose Dimensional (Sucursal, Zona, Municipio, etc.)
    _save_dimension_support_metrics(db, df)

    print("\n✅ ANÁLISIS TECHNICAL SUPPORT COMPLETADO")
    print(f"Total Tickets: {global_metrics['total_tickets']} | Resueltos: {global_metrics['tickets_resueltos']} ({global_metrics['pct_resueltos']}%)")
    print(f"Tiempo Medio Cierre: {global_metrics['tiempo_medio_cierre_horas']}h | 1ra Respuesta: {global_metrics['tiempo_promedio_primera_respuesta_horas']}h")
    print(f"Grupos de Trabajo Evaluados: {len(grupos_metrics)}")

    return {
        "global": global_metrics,
        "por_grupo": grupos_metrics
    }


def _save_global_support_metrics(db: DBConnector, global_m: dict, grupos_m: dict):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} (id, resumen_global, por_grupo_trabajo, updated_at)
                VALUES (1, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    resumen_global = EXCLUDED.resumen_global,
                    por_grupo_trabajo = EXCLUDED.por_grupo_trabajo,
                    updated_at = NOW()
                """,
                [json.dumps(global_m), json.dumps(grupos_m)]
            )
        conn.commit()


def _save_dimension_support_metrics(db: DBConnector, df: pd.DataFrame):
    rows_to_insert = []
    
    # A) Dimensiones generales (Sucursal, Zona, Municipio)
    for dim in ["sucursal", "zona", "municipio"]:
        if dim not in df.columns:
            continue
            
        for (dim_val, grupo), df_sub in df.groupby([dim, "grupo_trabajo"]):
            m = compute_metrics_set(df_sub)
            rows_to_insert.append((dim, str(dim_val), str(grupo), json.dumps(m)))

    # B) Dimensión pura por Grupo de Trabajo (sin subdivisión)
    for grupo, df_grupo in df.groupby("grupo_trabajo"):
        m = compute_metrics_set(df_grupo)
        rows_to_insert.append(("grupo_trabajo", str(grupo), str(grupo), json.dumps(m)))

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}")
            for dim, val, grupo, json_m in rows_to_insert:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
                    (dimension, valor, grupo_trabajo, metricas)
                    VALUES (%s, %s, %s, %s)
                    """,
                    [dim, val, grupo, json_m]
                )
        conn.commit()