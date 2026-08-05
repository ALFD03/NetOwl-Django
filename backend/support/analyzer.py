# backend/support/analyzer.py
from __future__ import annotations
import json
import logging
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import RESOLVED_STAGES
from backend.support.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)

def run_support_analysis(periodo_str: str | None = None) -> dict:
    """
    Ejecuta el análisis de soporte técnico por periodos.
    - Creados: filtrados por YYYY-MM de 'creado_el'
    - Resueltos: filtrados por YYYY-MM de 'ultima_actualizacion_etapa' y etapa en RESOLVED_STAGES
    """
    db = DBConnector()
    df_all = db.read_table(TableNames.SUPPORT_TICKETS)
    
    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    # Asignar periodos
    df_all["periodo_creacion"] = pd.to_datetime(df_all["creado_el"], errors="coerce").dt.strftime("%Y-%m")
    df_all["periodo_cierre"] = pd.to_datetime(df_all["ultima_actualizacion_etapa"], errors="coerce").dt.strftime("%Y-%m")
    
    df_all["etapa_clean"] = df_all["etapa"].astype(str).str.strip().str.lower()
    df_all["es_resuelto"] = df_all["etapa_clean"].isin(RESOLVED_STAGES)

    # Detectar periodos a procesar
    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        p_creados = df_all.dropna(subset=["periodo_creacion"])["periodo_creacion"].unique().tolist()
        p_cierres = df_all.dropna(subset=["periodo_cierre"])["periodo_cierre"].unique().tolist()
        periodos_target = sorted(list(set(p_creados + p_cierres)), reverse=True)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO (Cierre por Última Actualización) PARA {len(periodos_target)} PERIODO(S): {', '.join(periodos_target)}")

    all_summaries = {}

    for p in periodos_target:
        # Creados en este periodo
        df_creados = df_all[df_all["periodo_creacion"] == p].copy()
        
        # Resueltos en este periodo (etapa resuelto Y fecha de actualización en p)
        df_resueltos = df_all[(df_all["periodo_cierre"] == p) & (df_all["es_resuelto"] == True)].copy()

        if df_creados.empty and df_resueltos.empty:
            continue

        # 1. Conglomerado Global del Mes
        global_m = compute_metrics_for_period(df_creados, df_resueltos)
        
        # 2. Desglose Por Grupo del Mes
        grupos_m = {}
        todos_grupos = set(df_creados["grupo_trabajo"].unique()).union(set(df_resueltos["grupo_trabajo"].unique()))
        
        for grupo in todos_grupos:
            df_cr_g = df_creados[df_creados["grupo_trabajo"] == grupo]
            df_re_g = df_resueltos[df_resueltos["grupo_trabajo"] == grupo]
            grupos_m[str(grupo)] = compute_metrics_for_period(df_cr_g, df_re_g)

        # 3. Guardar Cierre Histórico
        _save_support_cierre_historico(db, p, global_m, grupos_m)

        # 4. Guardar Dimensiones
        _save_support_dimensiones_periodo(db, p, df_creados, df_resueltos)

        all_summaries[p] = {
            "global": global_m,
            "por_grupo": grupos_m
        }

    if periodos_target:
        latest = periodos_target[0]
        _save_global_support_metrics(db, all_summaries[latest]["global"], all_summaries[latest]["por_grupo"])

    print("✅ ANÁLISIS DE SUPPORT COMPLETADO CON ÉXITO.\n")
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
                     pct_resueltos, tiempo_medio_cierre_horas, tiempo_mediana_cierre_horas,
                     tiempo_p25_cierre_horas, tiempo_p75_cierre_horas, tiempo_std_cierre_horas,
                     pct_excede_promedio_cierre, pct_excede_mediana_cierre,
                     pct_rezagados, tiempo_promedio_primera_respuesta_horas, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (periodo_reporte, grupo_trabajo) DO UPDATE SET
                        total_tickets = EXCLUDED.total_tickets,
                        tickets_resueltos = EXCLUDED.tickets_resueltos,
                        tickets_rezagados = EXCLUDED.tickets_rezagados,
                        pct_resueltos = EXCLUDED.pct_resueltos,
                        tiempo_medio_cierre_horas = EXCLUDED.tiempo_medio_cierre_horas,
                        tiempo_mediana_cierre_horas = EXCLUDED.tiempo_mediana_cierre_horas,
                        tiempo_p25_cierre_horas = EXCLUDED.tiempo_p25_cierre_horas,
                        tiempo_p75_cierre_horas = EXCLUDED.tiempo_p75_cierre_horas,
                        tiempo_std_cierre_horas = EXCLUDED.tiempo_std_cierre_horas,
                        pct_excede_promedio_cierre = EXCLUDED.pct_excede_promedio_cierre,
                        pct_excede_mediana_cierre = EXCLUDED.pct_excede_mediana_cierre,
                        pct_rezagados = EXCLUDED.pct_rezagados,
                        tiempo_promedio_primera_respuesta_horas = EXCLUDED.tiempo_promedio_primera_respuesta_horas,
                        updated_at = NOW()
                    """,
                    [
                        periodo, grupo, m["total_tickets"], m["tickets_resueltos"], m["tickets_rezagados"],
                        m["pct_resueltos"], m["tiempo_medio_cierre_horas"], m["tiempo_mediana_cierre_horas"],
                        m["tiempo_p25_cierre_horas"], m["tiempo_p75_cierre_horas"], m["tiempo_std_cierre_horas"],
                        m["pct_excede_promedio_cierre"], m["pct_excede_mediana_cierre"],
                        m["pct_rezagados"], m["tiempo_promedio_primera_respuesta_horas"]
                    ]
                )
        conn.commit()



def _save_support_dimensiones_periodo(db: DBConnector, periodo: str, df_creados: pd.DataFrame, df_resueltos: pd.DataFrame):
    """Genera las métricas respetando la jerarquía: Grupo -> Tipo de Solicitud -> Razón Falla -> Ubicación."""
    rows_to_insert = []
    
    # 1. Nivel Grupo de Trabajo
    todos_grupos = set(df_creados["grupo_trabajo"].unique()).union(set(df_resueltos["grupo_trabajo"].unique()))
    for grupo in todos_grupos:
        df_cr_g = df_creados[df_creados["grupo_trabajo"] == grupo]
        df_re_g = df_resueltos[df_resueltos["grupo_trabajo"] == grupo]
        m = compute_metrics_for_period(df_cr_g, df_re_g)
        rows_to_insert.append((periodo, "grupo_trabajo", str(grupo), "Todas", "Todas", str(grupo), json.dumps(m)))

        # 2. Nivel Tipo de Solicitud (dentro de Grupo)
        tipos = set(df_cr_g["tipo_solicitud"].unique()).union(set(df_re_g["tipo_solicitud"].unique()))
        for tipo in tipos:
            df_cr_gt = df_cr_g[df_cr_g["tipo_solicitud"] == tipo]
            df_re_gt = df_re_g[df_re_g["tipo_solicitud"] == tipo]
            m_gt = compute_metrics_for_period(df_cr_gt, df_re_gt)
            rows_to_insert.append((periodo, "tipo_solicitud", str(grupo), str(tipo), "Todas", str(tipo), json.dumps(m_gt)))

            # 3. Nivel Razón de Falla (dentro de Grupo y Tipo)
            razones = set(df_cr_gt["razon_falla"].unique()).union(set(df_re_gt["razon_falla"].unique()))
            for razon in razones:
                df_cr_gtr = df_cr_gt[df_cr_gt["razon_falla"] == razon]
                df_re_gtr = df_re_gt[df_re_gt["razon_falla"] == razon]
                m_gtr = compute_metrics_for_period(df_cr_gtr, df_re_gtr)
                rows_to_insert.append((periodo, "razon_falla", str(grupo), str(tipo), str(razon), str(razon), json.dumps(m_gtr)))

            # 4. Nivel Ubicación (Zona, Sucursal, Municipio) dentro de Grupo y Tipo
            for dim in ["sucursal", "zona", "municipio"]:
                if dim not in df_cr_gt.columns and dim not in df_re_gt.columns:
                    continue
                
                vals_ub = set(df_cr_gt[dim].unique()).union(set(df_re_gt[dim].unique()))
                for val_u in vals_ub:
                    df_cr_ub = df_cr_gt[df_cr_gt[dim] == val_u]
                    df_re_ub = df_re_gt[df_re_gt[dim] == val_u]
                    m_ub = compute_metrics_for_period(df_cr_ub, df_re_ub)
                    rows_to_insert.append((periodo, dim, str(grupo), str(tipo), "Todas", str(val_u), json.dumps(m_ub)))

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