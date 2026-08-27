# NetOwl-Django/backend/support/analyzer.py

from __future__ import annotations
import json
import logging
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import (
    RESOLVED_STAGES,
    CANCELED_STAGES,
    SUPPORT_CIERRE_COLUMNS,
    SUPPORT_TIME_MEASURES,
)
from backend.support.metrics import PeriodCohort, compute_metrics_for_period

logger = logging.getLogger(__name__)


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


def _save_support_cierre_historico_global(db: DBConnector, periodo: str, global_m: dict):
    columns = ["periodo_reporte"] + SUPPORT_CIERRE_COLUMNS
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in SUPPORT_CIERRE_COLUMNS)
    values = [periodo] + [global_m.get(c, 0) for c in SUPPORT_CIERRE_COLUMNS]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
                ({", ".join(columns)}, updated_at)
                VALUES ({", ".join(["%s"] * len(columns))}, NOW())
                ON CONFLICT (periodo_reporte) DO UPDATE SET
                    {updates},
                    updated_at = NOW()
                """,
                values
            )
        conn.commit()


def _save_support_dimensiones_periodo(db: DBConnector, periodo: str, cohorte: PeriodCohort):
    """Guarda las dimensiones jerárquicas multinivel respetando la clasificación del periodo."""
    rows_to_insert = []

    def fila(dimension: str, grupo, tipo, razon, valor, sub: PeriodCohort):
        rows_to_insert.append((
            periodo, dimension, str(grupo), str(tipo), str(razon), str(valor),
            json.dumps(compute_metrics_for_period(sub)),
        ))

    for grupo, c_g in cohorte.desglosar("grupo_trabajo"):
        # 1. Nivel Grupo de Trabajo Global
        fila("grupo_trabajo", grupo, "Todas", "Todas", grupo, c_g)

        # 2. Nivel Sucursal a nivel de Grupo
        for suc, c_s in c_g.desglosar("sucursal"):
            fila("sucursal", grupo, "Todas", "Todas", suc, c_s)

        # 3. Nivel Zona - Sucursal a nivel de Grupo
        for zs, c_zs in c_g.desglosar("zona_sucursal"):
            fila("zona", grupo, "Todas", "Todas", zs, c_zs)

        # 4. Nivel Tipos de Solicitud y Razones de Falla
        for tipo, c_gt in c_g.desglosar("tipo_solicitud"):
            fila("tipo_solicitud", grupo, tipo, "Todas", tipo, c_gt)

            for razon, c_gtr in c_gt.desglosar("razon_falla"):
                fila("razon_falla", grupo, tipo, razon, razon, c_gtr)

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


# Medidas de tiempo y su columna de muestra: promediar un periodo sin ninguna
# duración medible metería un 0 en la media, que es justo el sesgo que se
# corrigió a nivel de ticket. Los periodos con muestra 0 se excluyen.
_TIME_MEASURES = {medida: f"muestra_{medida}" for medida in SUPPORT_TIME_MEASURES}

_VOLUME_FIELDS = ["total_tickets", "tickets_resueltos", "tickets_cancelados", "tickets_rezagados"]
_RATE_FIELDS = ["pct_resueltos", "pct_cancelados", "pct_rezagados"]


def _mean_of(df: pd.DataFrame, field: str, mask_field: str | None = None) -> float:
    """Media de `field`, restringida a las filas con muestra si se indica una."""
    if field not in df.columns:
        return 0.0

    serie = pd.to_numeric(df[field], errors="coerce")
    if mask_field and mask_field in df.columns:
        serie = serie[pd.to_numeric(df[mask_field], errors="coerce").fillna(0) > 0]

    serie = serie.dropna()
    return round(float(serie.mean()), 2) if not serie.empty else 0.0


def _average_periods(df: pd.DataFrame, volumen_como_promedio_mensual: bool) -> dict:
    """Promedia todos los periodos analizados en un único resumen acumulado."""
    sufijo = "_promedio_mensual" if volumen_como_promedio_mensual else ""
    avg = {f"{field}{sufijo}": _mean_of(df, field) for field in _VOLUME_FIELDS}
    avg.update({field: _mean_of(df, field) for field in _RATE_FIELDS})

    for medida, muestra in _TIME_MEASURES.items():
        for stat in ("medio", "mediana", "min", "p25", "p75", "max", "std"):
            key = f"tiempo_{stat}_{medida}_horas"
            avg[key] = _mean_of(df, key, muestra)
        for stat in ("promedio", "mediana"):
            key = f"pct_excede_{stat}_{medida}"
            avg[key] = _mean_of(df, key, muestra)
        avg[muestra] = _mean_of(df, muestra)

    avg["tiempo_promedio_primera_respuesta_horas"] = avg["tiempo_medio_primera_respuesta_horas"]
    return avg


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

    # Crear columna zona_sucursal
    z = df_all["zona"].fillna("Sin Zona").astype(str).str.strip()
    s = df_all["sucursal"].fillna("Sin Sucursal").astype(str).str.strip()
    df_all["zona_sucursal"] = z + " - " + s

    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        # Solo periodos de creación: la cohorte de un mes son sus tickets creados,
        # así que un mes sin altas no tiene nada que reportar.
        p_creados = df_all.dropna(subset=["periodo_creacion"])["periodo_creacion"].unique().tolist()
        periodos_target = sorted(set(p_creados), reverse=True)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(periodos_target)} PERIODO(S)...")

    all_summaries = {}

    for p in periodos_target:
        # Todo lo que se mide en el mes P nació en el mes P: la cohorte es de
        # creación, no de cierre. Sobre ella se hacen dos particiones distintas
        # porque las tasas y los tiempos no responden a la misma pregunta.
        mask_creados = df_all["periodo_creacion"] == p
        mask_cerrado_en_p = df_all["periodo_cierre"] == p

        # A. TASAS — exigen que el cierre caiga dentro del periodo. Resueltos +
        #    cancelados + rezagados suman exactamente los creados, así que los
        #    tres porcentajes reparten el 100%. Un ticket de julio cerrado en
        #    agosto es un rezagado de julio: en julio no se cerró.
        mask_resueltos = mask_creados & df_all["es_resuelto"] & mask_cerrado_en_p
        mask_cancelados = mask_creados & df_all["es_cancelado"] & mask_cerrado_en_p
        mask_rezagados = mask_creados & ~mask_resueltos & ~mask_cancelados

        # B. TIEMPOS — sin filtro por mes de cierre. Ese mismo ticket sí aporta
        #    sus horas al MTTR, porque el tiempo que tardó es real. Filtrarlo
        #    dejaba fuera justo a los más lentos y hundía la media.
        mask_resueltos_tiempo = mask_creados & df_all["es_resuelto"]
        mask_cerrados_tiempo = mask_creados & (df_all["es_resuelto"] | df_all["es_cancelado"])

        cohorte = PeriodCohort(
            creados=df_all[mask_creados].copy(),
            resueltos=df_all[mask_resueltos].copy(),
            cancelados=df_all[mask_cancelados].copy(),
            rezagados=df_all[mask_rezagados].copy(),
            resueltos_tiempo=df_all[mask_resueltos_tiempo].copy(),
            cerrados_tiempo=df_all[mask_cerrados_tiempo].copy(),
        )

        if cohorte.creados.empty:
            continue

        global_m = compute_metrics_for_period(cohorte)

        grupos_m = {
            str(grupo): compute_metrics_for_period(sub)
            for grupo, sub in cohorte.desglosar("grupo_trabajo")
        }

        _save_support_cierre_historico_global(db, p, global_m)
        _save_support_dimensiones_periodo(db, p, cohorte)

        all_summaries[p] = {
            "global": global_m,
            "por_grupo": grupos_m
        }

    # Promedio acumulado
    if all_summaries:
        df_sum = pd.DataFrame([s["global"] for s in all_summaries.values()])
        resumen_global_avg = _average_periods(df_sum, volumen_como_promedio_mensual=True)

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
                por_grupo_avg[g_name] = _average_periods(df_g_sub, volumen_como_promedio_mensual=False)

        _save_global_support_metrics(db, resumen_global_avg, por_grupo_avg)

    print("✅ ANÁLISIS DE SUPPORT COMPLETADO CON ÉXITO.\n")
    return all_summaries