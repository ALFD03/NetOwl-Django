"""El analisis de soporte: la cohorte de cada periodo y el promedio global."""

# backend/support/analyzer.py

from __future__ import annotations

import json
import logging
from collections.abc import Callable

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.tables import ensure_tables, upsert
from services.support.analytics import tables
from services.support.analytics.cohorts import available_periods, build_cohort
from services.support.analytics.config import GROUP_DIM
from services.support.analytics.day_metrics import build_support_day_metrics
from services.support.analytics.dimensions import (
    build_dimension_rows,
    save_dimensions,
)
from services.support.analytics.escalation import load_tickets
from services.support.analytics.flow import run_flow_analysis
from services.support.analytics.metrics import average_blocks, compute_metrics_for_period

logger = logging.getLogger(__name__)


def _save_close(db: DBConnector, periodo: str, metricas: dict) -> None:
    """Guarda (o actualiza) el bloque de métricas de un periodo."""
    with db.transaction() as cur:
        upsert(cur, tables.CLOSE_HISTORY, [{"periodo_reporte": periodo, "metricas": metricas}])


def _save_global(db: DBConnector, resumen: dict, por_grupo: dict, periodos: int) -> None:
    """Guarda la fila única del dashboard de empresa."""
    row = {"id": 1, "resumen_global": resumen, "por_grupo_trabajo": por_grupo, "periodos_evaluados": periodos}
    with db.transaction() as cur:
        upsert(cur, tables.GLOBAL_METRICS, [row])


def run_support_analysis(
    period_str: str | None = None,
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
    (`run_flow_analysis`): de él sale cuándo se escaló cada uno, y con eso
    `load_tickets` le devuelve a ATC lo que escaló (ver `escalation.py`).
    Sin logs cargados no hace nada y los tickets quedan como dice el export.
    """
    db = DBConnector()
    ensure_tables(db, *tables.ALL)
    run_flow_analysis(db=db)

    df_all = load_tickets(db)

    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    single_month = bool(period_str and len(period_str) == 7)
    target_periods = [period_str] if single_month else available_periods(df_all)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(target_periods)} PERIODO(S)...")

    resumenes: dict[str, dict] = {}

    for periodo in target_periods:
        cohorte = build_cohort(df_all, periodo)
        metricas = compute_metrics_for_period(cohorte)

        _save_close(db, periodo, metricas)
        save_dimensions(db, periodo, build_dimension_rows(cohorte))
        # Solo del mes pedido: recorrer los dias de todo el historico son
        # treinta y un cortes por cada mes que haya, y nadie lanza un analisis
        # global esperando eso. El cierre de cada mes si se recalcula entero.
        if single_month:
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
        FROM {DB_SCHEMA}.{TableNames.SUPPORT_CLOSE_HISTORY}
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
        for grupo, sub in cohorte.desglosar(GROUP_DIM):
            acumulado.setdefault(grupo, []).append(compute_metrics_for_period(sub))

    por_grupo = {g: average_blocks(b) for g, b in acumulado.items()}

    _save_global(db, resumen, por_grupo, len(periodos))
