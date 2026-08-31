from __future__ import annotations
import json
import logging
import pandas as pd
from ..database import DBConnector
from ..conf_config import DB_SCHEMA, TableNames
from .crm_config import ETAPA8_KEY
from .metrics.core import compute_crm_metrics_for_period
from .metrics.tiempo import compute_permanencias_en_etapa
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
                    pct_excede_prom_inst,
                    horas_promedio_perd, horas_mediana_perd, horas_p25_perd, horas_p75_perd,
                    horas_min_perd, horas_max_perd, horas_std_perd,
                    pct_excede_prom_perd,
                    horas_promedio_cierre, horas_mediana_cierre, horas_p25_cierre, horas_p75_cierre,
                    horas_min_cierre, horas_max_cierre, horas_std_cierre,
                    pct_excede_prom_cierre,
                    efectividad, tiempo_por_etapa,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
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
                    horas_promedio_perd = EXCLUDED.horas_promedio_perd,
                    horas_mediana_perd = EXCLUDED.horas_mediana_perd,
                    horas_p25_perd = EXCLUDED.horas_p25_perd,
                    horas_p75_perd = EXCLUDED.horas_p75_perd,
                    horas_min_perd = EXCLUDED.horas_min_perd,
                    horas_max_perd = EXCLUDED.horas_max_perd,
                    horas_std_perd = EXCLUDED.horas_std_perd,
                    pct_excede_prom_perd = EXCLUDED.pct_excede_prom_perd,
                    horas_promedio_cierre = EXCLUDED.horas_promedio_cierre,
                    horas_mediana_cierre = EXCLUDED.horas_mediana_cierre,
                    horas_p25_cierre = EXCLUDED.horas_p25_cierre,
                    horas_p75_cierre = EXCLUDED.horas_p75_cierre,
                    horas_min_cierre = EXCLUDED.horas_min_cierre,
                    horas_max_cierre = EXCLUDED.horas_max_cierre,
                    horas_std_cierre = EXCLUDED.horas_std_cierre,
                    pct_excede_prom_cierre = EXCLUDED.pct_excede_prom_cierre,
                    efectividad = EXCLUDED.efectividad,
                    tiempo_por_etapa = EXCLUDED.tiempo_por_etapa,
                    updated_at = NOW()
                """,
                [
                    periodo, m["total_oportunidades"], m["ganados"], m["perdidos"], m["pendientes"],
                    m["pct_instalacion"], m["pct_perdida"], m["pct_pendientes"],
                    m["count_devueltos_e8"], m["pct_devueltos_e8"],
                    m["horas_promedio_inst"], m["horas_mediana_inst"], m["horas_p25_inst"], m["horas_p75_inst"],
                    m["horas_min_inst"], m["horas_max_inst"], m["horas_std_inst"],
                    m["pct_excede_prom_inst"],
                    m["horas_promedio_perd"], m["horas_mediana_perd"], m["horas_p25_perd"], m["horas_p75_perd"],
                    m["horas_min_perd"], m["horas_max_perd"], m["horas_std_perd"],
                    m["pct_excede_prom_perd"],
                    m["horas_promedio_cierre"], m["horas_mediana_cierre"], m["horas_p25_cierre"], m["horas_p75_cierre"],
                    m["horas_min_cierre"], m["horas_max_cierre"], m["horas_std_cierre"],
                    m["pct_excede_prom_cierre"],
                    json.dumps(m.get("efectividad", [])),
                    json.dumps(m.get("tiempo_por_etapa", [])),
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


def _normalizar_id(serie: pd.Series) -> pd.Series:
    """El id de una oportunidad como texto comparable.

    El CSV lo trae a veces como número, y pandas lo lee como float: `4213` se
    convierte en `"4213.0"` y deja de cuadrar con el `id` de la oportunidad.
    """
    txt = serie.astype(str).str.strip()
    # Sólo el caso del entero leído como float: un id alfanumérico que acabe en
    # `.0` de verdad no se toca.
    return txt.str.replace(r"^(\d+)\.0$", r"\1", regex=True)


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

    # Una oportunidad repetida en la tabla ensancharía todos los cruces con los
    # logs y contaría cada movimiento tantas veces como copias tenga.
    n_antes = len(df_clients)
    df_clients = df_clients.drop_duplicates(subset=["id"], keep="last")
    if len(df_clients) != n_antes:
        logger.warning(
            "CRM: %d oportunidades duplicadas por `id` descartadas de %d.",
            n_antes - len(df_clients), n_antes,
        )

    # 2. Asignar periodos en formato YYYY-MM
    df_clients["periodo_creacion"] = pd.to_datetime(df_clients["creado_el"], errors="coerce").dt.strftime("%Y-%m")
    df_clients["periodo_cierre"] = pd.to_datetime(df_clients["fecha_cierre"], errors="coerce").dt.strftime("%Y-%m")
    
    if not df_logs.empty and "created_at_log" in df_logs.columns:
        df_logs["periodo_log"] = pd.to_datetime(df_logs["created_at_log"], errors="coerce").dt.strftime("%Y-%m")

        # `Iniciativa/ID` (`entrada_id`) ES el id de la oportunidad a la que
        # pertenece el movimiento: es el campo con el que se verifica de quién
        # es cada log. `client_id` no viene en la fila del log —el cargador lo
        # arrastra hacia abajo desde la fila padre del CSV de Odoo
        # (`crm_loader.py`)—, así que sólo queda de respaldo por si alguna
        # iniciativa no resuelve a una oportunidad cargada.
        ids_oportunidad = set(df_clients["id"].astype(str).str.strip())
        if "entrada_id" in df_logs.columns:
            declarada = _normalizar_id(df_logs["entrada_id"])
        else:
            declarada = pd.Series("", index=df_logs.index)

        resuelve = declarada.isin(ids_oportunidad)
        df_logs["oportunidad_id"] = declarada.where(
            resuelve, _normalizar_id(df_logs["client_id"])
        )

        n_sin_resolver = int((~resuelve).sum())
        if n_sin_resolver:
            logger.warning(
                "CRM: %d de %d logs traen una Iniciativa/ID que no corresponde a "
                "ninguna oportunidad cargada; se atribuyen por el id arrastrado "
                "del CSV. Si el número es alto, revisa el formato del campo.",
                n_sin_resolver, len(df_logs),
            )

        # El motivo de devolución vive en la oportunidad y las reglas de
        # efectividad lo leen desde el log. Se renombra la clave porque ambas
        # tablas tienen `id` y el merge renombraría el del log a `id_x`,
        # dejando sin desempate el orden de los movimientos.
        df_logs = df_logs.merge(
            df_clients[["id", "devolver_oportunidad"]].rename(columns={"id": "oportunidad_id"}),
            on="oportunidad_id",
            how="left"
        )
    else:
        df_logs["periodo_log"] = pd.Series(dtype=str)
        df_logs["oportunidad_id"] = pd.Series(dtype=str)

    # 2b. Estancias que todavía no han producido una salida. Se calculan una
    # sola vez sobre toda la base —necesitan el historial completo para saber
    # cuándo entró cada oportunidad a su etapa actual— y luego se reparten por
    # periodo. `ahora` se fija aquí para que todos los periodos de una misma
    # ejecución se midan contra el mismo reloj.
    ahora = pd.Timestamp.now()
    df_permanencias = compute_permanencias_en_etapa(df_clients, df_logs, ahora)

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
        df_logs_e8_p = df_logs_p[df_logs_p["nueva_etapa"] == ETAPA8_KEY].copy() if not df_logs_p.empty else pd.DataFrame()

        # Historial completo de los clientes que se movieron en el periodo: la
        # efectividad necesita saber cómo terminaron, aunque cierren más tarde.
        if not df_logs_p.empty:
            df_hist_p = df_logs[df_logs["client_id"].isin(set(df_logs_p["client_id"]))].copy()
        else:
            df_hist_p = pd.DataFrame()

        # E2. Pérdidas cerradas en el periodo. A diferencia de `df_perdidos`,
        # aquí no se exige que la oportunidad se haya creado en el mismo mes:
        # la efectividad cobra el fallo en el mes en que la oportunidad murió,
        # y el 43% de las pérdidas cierra en un mes distinto al de creación.
        df_perdidas_cierre = df_clients[
            (df_clients["ganado"] == "perdido") & (df_clients["periodo_cierre"] == p)
        ].copy()

        # E3. Estancias cuya entrada a la etapa cae en el periodo. Es la cara
        # oculta de los movimientos de P: lo que entró y todavía no ha salido.
        if not df_permanencias.empty:
            df_perm_p = df_permanencias[df_permanencias["periodo_entrada"] == p].copy()
        else:
            df_perm_p = pd.DataFrame()

        # F. Cálculo de métricas
        m = compute_crm_metrics_for_period(
            df_creados, df_ganados, df_perdidos, df_pendientes,
            df_logs_e8_p, df_logs_p, df_clients, df_hist_p, df_perdidas_cierre,
            df_perm_p, ahora
        )

        # G. Guardar en Base de Datos
        _save_crm_cierre_historico(db, p, m)
        save_crm_dimensiones_periodo(
            db, p, df_creados, df_ganados, df_perdidos, df_pendientes,
            df_logs_e8_p, df_logs_p, df_clients, df_hist_p, df_perdidas_cierre,
            df_perm_p, ahora
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

            # Tiempos Pérdida
            "horas_promedio_perd": round(float(df_sum["horas_promedio_perd"].mean()), 2),
            "horas_mediana_perd": round(float(df_sum["horas_mediana_perd"].mean()), 2),
            "pct_excede_prom_perd": round(float(df_sum["pct_excede_prom_perd"].mean()), 2),

            # Tiempo de Cierre
            "horas_promedio_cierre": round(float(df_sum["horas_promedio_cierre"].mean()), 2),
            "horas_mediana_cierre": round(float(df_sum["horas_mediana_cierre"].mean()), 2),
            "pct_excede_prom_cierre": round(float(df_sum["pct_excede_prom_cierre"].mean()), 2),
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