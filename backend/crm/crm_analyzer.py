from __future__ import annotations
import json
import logging
import pandas as pd
from ..database import DBConnector
from ..conf_config import DB_SCHEMA, TableNames
from .metrics.core import compute_crm_metrics_for_period
from .crm_dimensions import save_crm_dimensiones_periodo
from .crm_loader import ensure_crm_schema

logger = logging.getLogger(__name__)


def _save_crm_cierre_historico(db: DBConnector, periodo: str, m: dict):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} (
                    periodo_reporte, total_oportunidades, ganados, perdidos, pendientes,
                    pct_instalacion, pct_perdida, pct_pendientes,
                    count_devueltos_e8, pct_devueltos_e8,
                    horas_promedio_inst, horas_mediana_inst, horas_p25_inst, horas_p75_inst,
                    horas_min_inst, horas_max_inst, horas_std_inst,
                    pct_excede_prom_inst, pct_excede_med_inst,
                    horas_promedio_perd, horas_mediana_perd, horas_p25_perd, horas_p75_perd,
                    horas_min_perd, horas_max_perd, horas_std_perd,
                    pct_excede_prom_perd, pct_excede_med_perd,
                    efectividad,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (periodo_reporte) DO UPDATE SET
                    total_oportunidades = EXCLUDED.total_oportunidades,
                    ganados = EXCLUDED.ganados,
                    perdidos = EXCLUDED.perdidos,
                    pendientes = EXCLUDED.pendientes,
                    pct_instalacion = EXCLUDED.pct_instalacion,
                    pct_perdida = EXCLUDED.pct_perdida,
                    pct_pendientes = EXCLUDED.pct_pendientes,
                    count_devueltos_e8 = EXCLUDED.count_devueltos_e8,
                    pct_devueltos_e8 = EXCLUDED.pct_devueltos_e8,
                    horas_promedio_inst = EXCLUDED.horas_promedio_inst,
                    horas_mediana_inst = EXCLUDED.horas_mediana_inst,
                    horas_p25_inst = EXCLUDED.horas_p25_inst,
                    horas_p75_inst = EXCLUDED.horas_p75_inst,
                    horas_min_inst = EXCLUDED.horas_min_inst,
                    horas_max_inst = EXCLUDED.horas_max_inst,
                    horas_std_inst = EXCLUDED.horas_std_inst,
                    pct_excede_prom_inst = EXCLUDED.pct_excede_prom_inst,
                    pct_excede_med_inst = EXCLUDED.pct_excede_med_inst,
                    horas_promedio_perd = EXCLUDED.horas_promedio_perd,
                    horas_mediana_perd = EXCLUDED.horas_mediana_perd,
                    horas_p25_perd = EXCLUDED.horas_p25_perd,
                    horas_p75_perd = EXCLUDED.horas_p75_perd,
                    horas_min_perd = EXCLUDED.horas_min_perd,
                    horas_max_perd = EXCLUDED.horas_max_perd,
                    horas_std_perd = EXCLUDED.horas_std_perd,
                    pct_excede_prom_perd = EXCLUDED.pct_excede_prom_perd,
                    pct_excede_med_perd = EXCLUDED.pct_excede_med_perd,
                    efectividad = EXCLUDED.efectividad,
                    updated_at = NOW()
                """,
                [
                    periodo, m["total_oportunidades"], m["ganados"], m["perdidos"], m["pendientes"],
                    m["pct_instalacion"], m["pct_perdida"], m["pct_pendientes"],
                    m["count_devueltos_e8"], m["pct_devueltos_e8"],
                    m["horas_promedio_inst"], m["horas_mediana_inst"], m["horas_p25_inst"], m["horas_p75_inst"],
                    m["horas_min_inst"], m["horas_max_inst"], m["horas_std_inst"],
                    m["pct_excede_prom_inst"], m["pct_excede_med_inst"],
                    m["horas_promedio_perd"], m["horas_mediana_perd"], m["horas_p25_perd"], m["horas_p75_perd"],
                    m["horas_min_perd"], m["horas_max_perd"], m["horas_std_perd"],
                    m["pct_excede_prom_perd"], m["pct_excede_med_perd"],
                    json.dumps(m.get("efectividad", [])),
                ]
            )
        conn.commit()


def _save_global_crm_metrics(db: DBConnector, resumen_global: dict, tiempo_por_etapa: list, efectividad: list):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} (id, resumen_global, tiempo_por_etapa, efectividad, updated_at)
                VALUES (1, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    resumen_global = EXCLUDED.resumen_global,
                    tiempo_por_etapa = EXCLUDED.tiempo_por_etapa,
                    efectividad = EXCLUDED.efectividad,
                    updated_at = NOW()
                """,
                [json.dumps(resumen_global), json.dumps(tiempo_por_etapa), json.dumps(efectividad)]
            )
        conn.commit()


def run_crm_analysis(periodo_str: str | None = None) -> dict:
    db = DBConnector()

    # El cierre guarda ahora la efectividad por etapa del periodo; en una base
    # anterior a ese cambio la columna todavía no existe.
    ensure_crm_schema(db)
    
    # 1. Cargar tablas base
    df_clients = db.read_table(TableNames.CRM_CLIENTS)
    df_logs = db.read_table(TableNames.CRM_LOGS)

    if df_clients.empty:
        print("⚠️ No hay oportunidades de CRM para analizar.")
        return {"status": "empty", "message": "No hay datos cargados."}

    # 2. Asignar periodos en formato YYYY-MM
    df_clients["periodo_creacion"] = pd.to_datetime(df_clients["creado_el"], errors="coerce").dt.strftime("%Y-%m")
    df_clients["periodo_cierre"] = pd.to_datetime(df_clients["fecha_cierre"], errors="coerce").dt.strftime("%Y-%m")
    
    if not df_logs.empty and "created_at_log" in df_logs.columns:
        df_logs["periodo_log"] = pd.to_datetime(df_logs["created_at_log"], errors="coerce").dt.strftime("%Y-%m")
        # Unir metadatos de cliente a los logs para que las reglas de efectividad tengan acceso a estado y motivos
        df_logs = df_logs.merge(
            df_clients[["id", "devolver_oportunidad", "ganado", "campana", "sucursal", "vendedor"]],
            left_on="client_id",
            right_on="id",
            how="left"
        )
    else:
        df_logs["periodo_log"] = pd.Series(dtype=str)

    # 3. Determinar periodos objetivos
    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        periodos_target = sorted(
            df_clients.dropna(subset=["periodo_creacion"])["periodo_creacion"].unique().tolist(),
            reverse=True
        )

    print(f"\n📊 PROCESANDO CRM ANALYTICS PARA {len(periodos_target)} PERIODO(S)...")
    all_summaries = {}

    for p in periodos_target:
        # A. Creados en el periodo P
        df_creados = df_clients[df_clients["periodo_creacion"] == p].copy()
        if df_creados.empty:
            continue

        # B. Ganados en el periodo P (creados en P, ganado = ganado, etapa = 7, cierre en P)
        mask_ganado = (
            (df_creados["ganado"] == "ganado") &
            (df_creados["etapa_actual"] == "etapa_7_instalados") &
            (df_creados["periodo_cierre"] == p)
        )
        df_ganados = df_creados[mask_ganado].copy()

        # C. Perdidos en el periodo P (creados en P, ganado = perdido, cierre en P)
        mask_perdido = (
            (df_creados["ganado"] == "perdido") &
            (df_creados["periodo_cierre"] == p)
        )
        df_perdidos = df_creados[mask_perdido].copy()

        # D. Pendientes (creados en P, cuyo cierre no ocurrió en P)
        df_pendientes = df_creados[~mask_ganado & ~mask_perdido].copy()

        # E. Logs del periodo
        df_logs_p = df_logs[df_logs["periodo_log"] == p].copy() if not df_logs.empty else pd.DataFrame()
        df_logs_e8_p = df_logs_p[df_logs_p["nueva_etapa"] == "etapa_8_devueltos"].copy() if not df_logs_p.empty else pd.DataFrame()

        # F. Cálculo de métricas
        m = compute_crm_metrics_for_period(
            df_creados, df_ganados, df_perdidos, df_pendientes,
            df_logs_e8_p, df_logs_p, df_clients
        )

        # G. Guardar en Base de Datos
        _save_crm_cierre_historico(db, p, m)
        save_crm_dimensiones_periodo(
            db, p, df_creados, df_ganados, df_perdidos, df_pendientes,
            df_logs_e8_p, df_logs_p, df_clients
        )

        all_summaries[p] = m

    # 4. Calcular promedio acumulado global
    if all_summaries:
        df_sum = pd.DataFrame(list(all_summaries.values()))
        resumen_global_avg = {
            "total_oportunidades_promedio": round(float(df_sum["total_oportunidades"].mean()), 2),
            "ganados_promedio": round(float(df_sum["ganados"].mean()), 2),
            "perdidos_promedio": round(float(df_sum["perdidos"].mean()), 2),
            "pendientes_promedio": round(float(df_sum["pendientes"].mean()), 2),
            "pct_instalacion_promedio": round(float(df_sum["pct_instalacion"].mean()), 2),
            "pct_perdida_promedio": round(float(df_sum["pct_perdida"].mean()), 2),
            "pct_pendientes_promedio": round(float(df_sum["pct_pendientes"].mean()), 2),
            "count_devueltos_e8_promedio": round(float(df_sum["count_devueltos_e8"].mean()), 2),
            "pct_devueltos_e8_promedio": round(float(df_sum["pct_devueltos_e8"].mean()), 2),

            # Tiempos Instalación
            "horas_promedio_inst": round(float(df_sum["horas_promedio_inst"].mean()), 2),
            "horas_mediana_inst": round(float(df_sum["horas_mediana_inst"].mean()), 2),
            "pct_excede_prom_inst": round(float(df_sum["pct_excede_prom_inst"].mean()), 2),
            "pct_excede_med_inst": round(float(df_sum["pct_excede_med_inst"].mean()), 2),

            # Tiempos Pérdida
            "horas_promedio_perd": round(float(df_sum["horas_promedio_perd"].mean()), 2),
            "horas_mediana_perd": round(float(df_sum["horas_mediana_perd"].mean()), 2),
            "pct_excede_prom_perd": round(float(df_sum["pct_excede_prom_perd"].mean()), 2),
            "pct_excede_med_perd": round(float(df_sum["pct_excede_med_perd"].mean()), 2),
        }

        # Último conjunto de efectividad y tiempos por etapa
        ultimo_resumen = list(all_summaries.values())[0]
        _save_global_crm_metrics(
            db,
            resumen_global_avg,
            ultimo_resumen.get("tiempo_por_etapa", []),
            ultimo_resumen.get("efectividad", [])
        )

    print("✅ ANÁLISIS DE CRM COMPLETADO CON ÉXITO.\n")
    return all_summaries