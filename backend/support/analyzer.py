from __future__ import annotations
import json
import logging
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.metrics import compute_metrics_set

logger = logging.getLogger(__name__)

def run_support_analysis(periodo_str: str | None = None) -> dict:
    """
    Ejecuta el análisis de soporte técnico por periodos.
    Si periodo_str es 'YYYY-MM', analiza sólo ese mes.
    Si es None, analiza e históriza TODOS los meses detectados en los tickets.
    """
    db = DBConnector()
    df_all = db.read_table(TableNames.SUPPORT_TICKETS)
    
    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    df_all["periodo"] = pd.to_datetime(df_all["creado_el"], errors="coerce").dt.strftime("%Y-%m")
    df_valid = df_all.dropna(subset=["periodo"]).copy()

    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        periodos_target = sorted(df_valid["periodo"].unique().tolist(), reverse=True)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(periodos_target)} PERIODO(S): {', '.join(periodos_target)}")

    all_summaries = {}

    for p in periodos_target:
        df_p = df_valid[df_valid["periodo"] == p].copy()
        if df_p.empty:
            continue

        global_m = compute_metrics_set(df_p)
        
        grupos_m = {}
        for grupo, df_grupo in df_p.groupby("grupo_trabajo"):
            grupos_m[str(grupo)] = compute_metrics_set(df_grupo)

        _save_support_cierre_historico(db, p, global_m, grupos_m)
        _save_support_dimensiones_periodo(db, p, df_p)

        all_summaries[p] = {
            "global": global_m,
            "por_grupo": grupos_m
        }

    if periodos_target:
        latest = periodos_target[0]
        _save_global_support_metrics(db, all_summaries[latest]["global"], all_summaries[latest]["por_grupo"])

    print("✅ ANÁLISIS POR PERIODOS DE SUPPORT COMPLETADO CON ÉXITO.\n")
    return all_summaries


def _save_support_cierre_historico(db: DBConnector, periodo: str, global_m: dict, grupos_m: dict):
    rows = [("GLOBAL", global_m)] + [(g, m) for g, m in grupos_m.items()]
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for grupo, m in rows:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
                    (periodo_reporte, grupo_trabajo, total_tickets, tickets_resueltos, tickets_rezagados,
                     pct_resueltos, tiempo_medio_cierre_horas, pct_rezagados, tiempo_promedio_primera_respuesta_horas, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (periodo_reporte, grupo_trabajo) DO UPDATE SET
                        total_tickets = EXCLUDED.total_tickets,
                        tickets_resueltos = EXCLUDED.tickets_resueltos,
                        tickets_rezagados = EXCLUDED.tickets_rezagados,
                        pct_resueltos = EXCLUDED.pct_resueltos,
                        tiempo_medio_cierre_horas = EXCLUDED.tiempo_medio_cierre_horas,
                        pct_rezagados = EXCLUDED.pct_rezagados,
                        tiempo_promedio_primera_respuesta_horas = EXCLUDED.tiempo_promedio_primera_respuesta_horas,
                        updated_at = NOW()
                    """,
                    [
                        periodo, grupo, m["total_tickets"], m["tickets_resueltos"], m["tickets_rezagados"],
                        m["pct_resueltos"], m["tiempo_medio_cierre_horas"], m["pct_rezagados"],
                        m["tiempo_promedio_primera_respuesta_horas"]
                    ]
                )
        conn.commit()


def _save_support_dimensiones_periodo(db: DBConnector, periodo: str, df_p: pd.DataFrame):
    rows_to_insert = []
    
    for dim in ["sucursal", "zona", "municipio"]:
        if dim not in df_p.columns:
            continue
        for (dim_val, grupo), df_sub in df_p.groupby([dim, "grupo_trabajo"]):
            m = compute_metrics_set(df_sub)
            rows_to_insert.append((periodo, dim, str(dim_val), str(grupo), json.dumps(m)))

    for grupo, df_grupo in df_p.groupby("grupo_trabajo"):
        m = compute_metrics_set(df_grupo)
        rows_to_insert.append((periodo, "grupo_trabajo", str(grupo), str(grupo), json.dumps(m)))

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} WHERE periodo_reporte = %s",
                [periodo]
            )
            for p, dim, val, grupo, json_m in rows_to_insert:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
                    (periodo_reporte, dimension, valor, grupo_trabajo, metricas)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    [p, dim, val, grupo, json_m]
                )
        conn.commit()


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