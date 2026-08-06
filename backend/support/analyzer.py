# NetOwl-Django/backend/support/analyzer.py

from __future__ import annotations
import json
import logging
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import RESOLVED_STAGES, CANCELED_STAGES
from backend.support.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)


def _save_global_support_metrics(db: DBConnector, global_m: dict, grupos_m: dict):
    """Guarda las métricas globales promediadas en la tabla de acceso rápido."""
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


def _save_support_cierre_historico_global(db: DBConnector, periodo: str, global_m: dict):
    """Guarda una única fila de cierre consolidado mensual en support_cierre_historico."""
    m = global_m
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
                (periodo_reporte, total_tickets, tickets_resueltos, tickets_cancelados, tickets_rezagados,
                 pct_resueltos, pct_cancelados, pct_rezagados,
                 tiempo_medio_cierre_horas, tiempo_mediana_cierre_horas,
                 tiempo_p25_cierre_horas, tiempo_p75_cierre_horas, tiempo_std_cierre_horas,
                 pct_excede_promedio_cierre, pct_excede_mediana_cierre,
                 tiempo_promedio_primera_respuesta_horas, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (periodo_reporte) DO UPDATE SET
                    total_tickets = EXCLUDED.total_tickets,
                    tickets_resueltos = EXCLUDED.tickets_resueltos,
                    tickets_cancelados = EXCLUDED.tickets_cancelados,
                    tickets_rezagados = EXCLUDED.tickets_rezagados,
                    pct_resueltos = EXCLUDED.pct_resueltos,
                    pct_cancelados = EXCLUDED.pct_cancelados,
                    pct_rezagados = EXCLUDED.pct_rezagados,
                    tiempo_medio_cierre_horas = EXCLUDED.tiempo_medio_cierre_horas,
                    tiempo_mediana_cierre_horas = EXCLUDED.tiempo_mediana_cierre_horas,
                    tiempo_p25_cierre_horas = EXCLUDED.tiempo_p25_cierre_horas,
                    tiempo_p75_cierre_horas = EXCLUDED.tiempo_p75_cierre_horas,
                    tiempo_std_cierre_horas = EXCLUDED.tiempo_std_cierre_horas,
                    pct_excede_promedio_cierre = EXCLUDED.pct_excede_promedio_cierre,
                    pct_excede_mediana_cierre = EXCLUDED.pct_excede_mediana_cierre,
                    tiempo_promedio_primera_respuesta_horas = EXCLUDED.tiempo_promedio_primera_respuesta_horas,
                    updated_at = NOW()
                """,
                [
                    periodo, m["total_tickets"], m["tickets_resueltos"], m["tickets_cancelados"], m["tickets_rezagados"],
                    m["pct_resueltos"], m["pct_cancelados"], m["pct_rezagados"],
                    m["tiempo_medio_cierre_horas"], m["tiempo_mediana_cierre_horas"],
                    m["tiempo_p25_cierre_horas"], m["tiempo_p75_cierre_horas"], m["tiempo_std_cierre_horas"],
                    m["pct_excede_promedio_cierre"], m["pct_excede_mediana_cierre"],
                    m["tiempo_promedio_primera_respuesta_horas"]
                ]
            )
        conn.commit()


def _save_support_dimensiones_periodo(db: DBConnector, periodo: str, df_creados: pd.DataFrame, df_resueltos: pd.DataFrame):
    """Guarda las dimensiones jerárquicas multinivel en support_dimensiones_historico."""
    rows_to_insert = []
    
    if not df_creados.empty:
        df_creados_copy = df_creados.copy()
        df_creados_copy["etapa_clean"] = df_creados_copy["etapa"].astype(str).str.strip().str.lower()
        df_cancelados = df_creados_copy[df_creados_copy["etapa_clean"].isin(CANCELED_STAGES)]
    else:
        df_cancelados = pd.DataFrame()

    # Generar columna combinada Zona - Sucursal
    for df in [df_creados, df_resueltos, df_cancelados]:
        if not df.empty and "zona" in df.columns and "sucursal" in df.columns:
            z = df["zona"].fillna("Sin Zona").astype(str).str.strip()
            s = df["sucursal"].fillna("Sin Sucursal").astype(str).str.strip()
            df["zona_sucursal"] = z + " - " + s

    todos_grupos = set(df_creados["grupo_trabajo"].unique()).union(set(df_resueltos["grupo_trabajo"].unique()))
    
    for grupo in todos_grupos:
        df_cr_g = df_creados[df_creados["grupo_trabajo"] == grupo] if not df_creados.empty else pd.DataFrame()
        df_re_g = df_resueltos[df_resueltos["grupo_trabajo"] == grupo] if not df_resueltos.empty else pd.DataFrame()
        df_can_g = df_cancelados[df_cancelados["grupo_trabajo"] == grupo] if not df_cancelados.empty else pd.DataFrame()
        
        # 1. Nivel Grupo de Trabajo Global
        m_g = compute_metrics_for_period(df_cr_g, df_re_g, df_can_g)
        rows_to_insert.append((periodo, "grupo_trabajo", str(grupo), "Todas", "Todas", str(grupo), json.dumps(m_g)))

        # 2. Nivel Sucursal a nivel de Grupo
        sucs_cr = set(df_cr_g["sucursal"].unique()) if (not df_cr_g.empty and "sucursal" in df_cr_g.columns) else set()
        sucs_re = set(df_re_g["sucursal"].unique()) if (not df_re_g.empty and "sucursal" in df_re_g.columns) else set()
        for suc in sucs_cr.union(sucs_re):
            df_cr_s = df_cr_g[df_cr_g["sucursal"] == suc] if not df_cr_g.empty else pd.DataFrame()
            df_re_s = df_re_g[df_re_g["sucursal"] == suc] if not df_re_g.empty else pd.DataFrame()
            df_can_s = df_can_g[df_can_g["sucursal"] == suc] if not df_can_g.empty else pd.DataFrame()
            m_s = compute_metrics_for_period(df_cr_s, df_re_s, df_can_s)
            rows_to_insert.append((periodo, "sucursal", str(grupo), "Todas", "Todas", str(suc), json.dumps(m_s)))

        # 3. Nivel Zona - Sucursal a nivel de Grupo (Estilo Sales Report)
        zs_cr = set(df_cr_g["zona_sucursal"].unique()) if (not df_cr_g.empty and "zona_sucursal" in df_cr_g.columns) else set()
        zs_re = set(df_re_g["zona_sucursal"].unique()) if (not df_re_g.empty and "zona_sucursal" in df_re_g.columns) else set()
        for zs in zs_cr.union(zs_re):
            df_cr_zs = df_cr_g[df_cr_g["zona_sucursal"] == zs] if not df_cr_g.empty else pd.DataFrame()
            df_re_zs = df_re_g[df_re_g["zona_sucursal"] == zs] if not df_re_g.empty else pd.DataFrame()
            df_can_zs = df_can_g[df_can_g["zona_sucursal"] == zs] if not df_can_g.empty else pd.DataFrame()
            m_zs = compute_metrics_for_period(df_cr_zs, df_re_zs, df_can_zs)
            rows_to_insert.append((periodo, "zona", str(grupo), "Todas", "Todas", str(zs), json.dumps(m_zs)))

        # 4. Nivel Tipos de Solicitud y Razones de Falla
        tipos = set(df_cr_g["tipo_solicitud"].unique()).union(set(df_re_g["tipo_solicitud"].unique())) if not df_cr_g.empty or not df_re_g.empty else set()
        for tipo in tipos:
            df_cr_gt = df_cr_g[df_cr_g["tipo_solicitud"] == tipo] if not df_cr_g.empty else pd.DataFrame()
            df_re_gt = df_re_g[df_re_g["tipo_solicitud"] == tipo] if not df_re_g.empty else pd.DataFrame()
            df_can_gt = df_can_g[df_can_g["tipo_solicitud"] == tipo] if not df_can_g.empty else pd.DataFrame()
            
            m_gt = compute_metrics_for_period(df_cr_gt, df_re_gt, df_can_gt)
            rows_to_insert.append((periodo, "tipo_solicitud", str(grupo), str(tipo), "Todas", str(tipo), json.dumps(m_gt)))

            razones = set(df_cr_gt["razon_falla"].unique()).union(set(df_re_gt["razon_falla"].unique())) if not df_cr_gt.empty or not df_re_gt.empty else set()
            for razon in razones:
                df_cr_gtr = df_cr_gt[df_cr_gt["razon_falla"] == razon] if not df_cr_gt.empty else pd.DataFrame()
                df_re_gtr = df_re_gt[df_re_gt["razon_falla"] == razon] if not df_re_gt.empty else pd.DataFrame()
                df_can_gtr = df_can_gt[df_can_gt["razon_falla"] == razon] if not df_can_gt.empty else pd.DataFrame()
                
                m_gtr = compute_metrics_for_period(df_cr_gtr, df_re_gtr, df_can_gtr)
                rows_to_insert.append((periodo, "razon_falla", str(grupo), str(tipo), str(razon), str(razon), json.dumps(m_gtr)))

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} WHERE periodo_reporte = %s",
                [periodo]
            )
            for p, dim, grupo, tipo, razon, val, json_m in rows_to_insert:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
                    (periodo_reporte, dimension, grupo_trabajo, tipo_solicitud, razon_falla, valor, metricas)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    [p, dim, grupo, tipo, razon, val, json_m]
                )
        conn.commit()


def run_support_analysis(periodo_str: str | None = None) -> dict:
    db = DBConnector()
    df_all = db.read_table(TableNames.SUPPORT_TICKETS)
    
    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    df_all["periodo_creacion"] = pd.to_datetime(df_all["creado_el"], errors="coerce").dt.strftime("%Y-%m")
    df_all["periodo_cierre"] = pd.to_datetime(df_all["ultima_actualizacion_etapa"], errors="coerce").dt.strftime("%Y-%m")
    
    df_all["etapa_clean"] = df_all["etapa"].astype(str).str.strip().str.lower()
    df_all["es_resuelto"] = df_all["etapa_clean"].isin(RESOLVED_STAGES)
    df_all["es_cancelado"] = df_all["etapa_clean"].isin(CANCELED_STAGES)

    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        p_creados = df_all.dropna(subset=["periodo_creacion"])["periodo_creacion"].unique().tolist()
        p_cierres = df_all.dropna(subset=["periodo_cierre"])["periodo_cierre"].unique().tolist()
        periodos_target = sorted(list(set(p_creados + p_cierres)), reverse=True)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(periodos_target)} PERIODO(S)...")

    all_summaries = {}

    for p in periodos_target:
        df_creados = df_all[df_all["periodo_creacion"] == p].copy()
        df_resueltos = df_all[(df_all["periodo_cierre"] == p) & (df_all["es_resuelto"] == True)].copy()
        df_cancelados = df_creados[df_creados["es_cancelado"] == True].copy()

        if df_creados.empty and df_resueltos.empty:
            continue

        global_m = compute_metrics_for_period(df_creados, df_resueltos, df_cancelados)
        
        grupos_m = {}
        todos_grupos = set(df_creados["grupo_trabajo"].unique()).union(set(df_resueltos["grupo_trabajo"].unique()))
        
        for grupo in todos_grupos:
            df_cr_g = df_creados[df_creados["grupo_trabajo"] == grupo]
            df_re_g = df_resueltos[df_resueltos["grupo_trabajo"] == grupo]
            df_can_g = df_cancelados[df_cancelados["grupo_trabajo"] == grupo]
            grupos_m[str(grupo)] = compute_metrics_for_period(df_cr_g, df_re_g, df_can_g)

        _save_support_cierre_historico_global(db, p, global_m)
        _save_support_dimensiones_periodo(db, p, df_creados, df_resueltos)

        all_summaries[p] = {
            "global": global_m,
            "por_grupo": grupos_m
        }

    # Promedio acumulado de todos los periodos
    if all_summaries:
        df_sum = pd.DataFrame([s["global"] for s in all_summaries.values()])
        resumen_global_avg = {
            "total_tickets_promedio_mensual": round(float(df_sum["total_tickets"].mean()), 2),
            "tickets_resueltos_promedio_mensual": round(float(df_sum["tickets_resueltos"].mean()), 2),
            "tickets_cancelados_promedio_mensual": round(float(df_sum["tickets_cancelados"].mean()), 2),
            "tickets_rezagados_promedio_mensual": round(float(df_sum["tickets_rezagados"].mean()), 2),
            "pct_resueltos": round(float(df_sum["pct_resueltos"].mean()), 2),
            "pct_cancelados": round(float(df_sum["pct_cancelados"].mean()), 2),
            "pct_rezagados": round(float(df_sum["pct_rezagados"].mean()), 2),
            "tiempo_medio_cierre_horas": round(float(df_sum["tiempo_medio_cierre_horas"].mean()), 2),
            "tiempo_mediana_cierre_horas": round(float(df_sum["tiempo_mediana_cierre_horas"].mean()), 2),
            "tiempo_promedio_primera_respuesta_horas": round(float(df_sum["tiempo_promedio_primera_respuesta_horas"].mean()), 2),
        }

        grupo_records = []
        for p, summary in all_summaries.items():
            for g_name, g_m in summary["por_grupo"].items():
                g_copy = dict(g_m)
                g_copy["grupo_trabajo"] = g_name
                grupo_records.append(g_copy)

        por_grupo_avg = {}
        if grupo_records:
            df_g = pd.DataFrame(grupo_records)
            for g_name, df_g_sub in df_g.groupby("grupo_trabajo"):
                por_grupo_avg[g_name] = {
                    "total_tickets": round(float(df_g_sub["total_tickets"].mean()), 2),
                    "tickets_resueltos": round(float(df_g_sub["tickets_resueltos"].mean()), 2),
                    "tickets_cancelados": round(float(df_g_sub["tickets_cancelados"].mean()), 2),
                    "tickets_rezagados": round(float(df_g_sub["tickets_rezagados"].mean()), 2),
                    "pct_resueltos": round(float(df_g_sub["pct_resueltos"].mean()), 2),
                    "pct_cancelados": round(float(df_g_sub["pct_cancelados"].mean()), 2),
                    "pct_rezagados": round(float(df_g_sub["pct_rezagados"].mean()), 2),
                    "tiempo_medio_cierre_horas": round(float(df_g_sub["tiempo_medio_cierre_horas"].mean()), 2),
                    "tiempo_mediana_cierre_horas": round(float(df_g_sub["tiempo_mediana_cierre_horas"].mean()), 2),
                    "tiempo_promedio_primera_respuesta_horas": round(float(df_g_sub["tiempo_promedio_primera_respuesta_horas"].mean()), 2),
                }

        _save_global_support_metrics(db, resumen_global_avg, por_grupo_avg)

    print("✅ ANÁLISIS DE SUPPORT COMPLETADO CON ÉXITO.\n")
    return all_summaries