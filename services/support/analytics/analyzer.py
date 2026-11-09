"""El analisis de soporte: la cohorte de cada periodo y el promedio global."""

# backend/support/analyzer.py

from __future__ import annotations

import json
import logging
from collections.abc import Callable

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.cohorts import build_cohort, periodos_disponibles
from services.support.analytics.config import DIM_GRUPO
from services.support.analytics.day_metrics import build_support_day_metrics
from services.support.analytics.dimensions import (
    build_dimension_rows,
    save_support_dimensiones_periodo,
)
from services.support.analytics.escalamiento import cargar_tickets
from services.support.analytics.flujo import run_flujo_analysis
from services.support.analytics.loader import ensure_support_schema
from services.support.analytics.metrics import average_blocks, compute_metrics_for_period

logger = logging.getLogger(__name__)


def _save_cierre_historico(db: DBConnector, periodo: str, metricas: dict) -> None:
    """Guarda (o actualiza) el bloque de metricas de un periodo, como JSONB."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
                    (periodo_reporte, metricas, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (periodo_reporte) DO UPDATE SET
                    metricas = EXCLUDED.metricas,
                    updated_at = NOW()
                """,
                [periodo, json.dumps(metricas)],
            )
        conn.commit()


def _save_metricas_globales(
    db: DBConnector, resumen: dict, por_grupo: dict, periodos: int
) -> None:
    """Guarda la fila unica del dashboard de empresa."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES}
                    (id, resumen_global, por_grupo_trabajo, periodos_evaluados, updated_at)
                VALUES (1, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    resumen_global = EXCLUDED.resumen_global,
                    por_grupo_trabajo = EXCLUDED.por_grupo_trabajo,
                    periodos_evaluados = EXCLUDED.periodos_evaluados,
                    updated_at = NOW()
                """,
                [json.dumps(resumen), json.dumps(por_grupo), periodos],
            )
        conn.commit()


def run_support_analysis(
    periodo_str: str | None = None,
    progreso: Callable[[int, int, str], None] | None = None,
) -> dict:
    """
    Recalcula soporte: la cohorte de cada periodo y el promedio global.

    El promedio acumulado se recalcula siempre sobre TODO lo que hay en
    `support_cierre_historico`, no sólo sobre los periodos recién procesados:
    analizar un mes suelto no debe borrar el histórico del dashboard de empresa.

    De la misma tabla ya clasificada salen también los cortes de cada día del
    periodo (`build_support_day_metrics`): leer y clasificar los tickets es el
    coste, recortar la cohorte treinta y un veces no. `progreso` es lo que
    alimenta la barra de la interfaz mientras los recorre.

    Lo primero es rehacer el recorrido de cada ticket desde sus logs de etapa
    (`run_flujo_analysis`): de él sale cuándo se escaló cada uno, y con eso
    `cargar_tickets` le devuelve a ATC lo que escaló (ver `escalamiento.py`).
    Sin logs cargados no hace nada y los tickets quedan como dice el export.
    """
    db = DBConnector()
    ensure_support_schema(db)
    run_flujo_analysis(db=db)

    df_all = cargar_tickets(db)

    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    un_solo_mes = bool(periodo_str and len(periodo_str) == 7)
    periodos_target = [periodo_str] if un_solo_mes else periodos_disponibles(df_all)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(periodos_target)} PERIODO(S)...")

    resumenes: dict[str, dict] = {}

    for periodo in periodos_target:
        cohorte = build_cohort(df_all, periodo)
        metricas = compute_metrics_for_period(cohorte)

        _save_cierre_historico(db, periodo, metricas)
        save_support_dimensiones_periodo(db, periodo, build_dimension_rows(cohorte))
        # Solo del mes pedido: recorrer los dias de todo el historico son
        # treinta y un cortes por cada mes que haya, y nadie lanza un analisis
        # global esperando eso. El cierre de cada mes si se recalcula entero.
        if un_solo_mes:
            build_support_day_metrics(periodo, db=db, df_all=df_all, progreso=progreso)

        resumenes[periodo] = metricas
        print(f"   · {periodo}: {metricas['tickets_creados']} creados, "
              f"{metricas['tickets_cerrados']} cerrados, "
              f"{metricas['tickets_escalados']} escalados de ATC a Soporte")

    _recompute_global_average(db, df_all)

    print("✅ ANÁLISIS DE SUPPORT COMPLETADO CON ÉXITO.\n")
    return resumenes


def _recompute_global_average(db: DBConnector, df_all: pd.DataFrame) -> None:
    """
    El dashboard de empresa: la media de todos los periodos ya calculados.

    El total se lee de `support_cierre_historico`, que es la verdad persistida.
    El desglose por grupo de trabajo se recalcula sobre los tickets porque
    `build_dimension_rows` lo guarda por periodo, y volver a leerlo periodo a
    periodo costaría más que rehacerlo en memoria.
    """
    df_hist = db.query(f"""
        SELECT periodo_reporte, metricas
        FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
        ORDER BY periodo_reporte ASC
    """)

    if df_hist.empty:
        return

    bloques = [
        m if isinstance(m, dict) else json.loads(m)
        for m in df_hist["metricas"]
    ]
    resumen = average_blocks(bloques)

    periodos = sorted(df_hist["periodo_reporte"].unique().tolist())

    acumulado: dict[str, list[dict]] = {}
    for periodo in periodos:
        cohorte = build_cohort(df_all, periodo)
        for grupo, sub in cohorte.desglosar(DIM_GRUPO):
            acumulado.setdefault(grupo, []).append(compute_metrics_for_period(sub))

    por_grupo = {g: average_blocks(b) for g, b in acumulado.items()}

    _save_metricas_globales(db, resumen, por_grupo, len(periodos))
