# backend/support/analyzer.py

from __future__ import annotations

import json
import logging
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.cohorts import build_cohort, classify_tickets, periodos_disponibles
from services.support.analytics.config import (
    DIM_GRUPO,
    SUPPORT_RATE_FIELDS,
    SUPPORT_TIME_MEASURES,
    SUPPORT_VOLUME_FIELDS,
    TIME_STATS,
)
from services.support.analytics.dimensions import (
    build_dimension_rows,
    save_support_dimensiones_periodo,
)
from services.support.analytics.loader import ensure_support_schema
from services.support.analytics.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)


def _save_cierre_historico(db: DBConnector, periodo: str, metricas: dict) -> None:
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


# Cada medida de tiempo con la columna que dice cuántos tickets pudo medir.
# Promediar un periodo sin ninguna duración medible metería un 0 en la media,
# que es justo el sesgo que `_compute_stats_for_series` corrige a nivel de
# ticket: los periodos con muestra 0 se excluyen de la media de esa medida.
_TIME_MASKS = {medida: f"muestra_{medida}" for medida in SUPPORT_TIME_MEASURES}


def _mean_of(df: pd.DataFrame, field: str, mask_field: str | None = None) -> float:
    if field not in df.columns:
        return 0.0

    serie = pd.to_numeric(df[field], errors="coerce")
    if mask_field and mask_field in df.columns:
        serie = serie[pd.to_numeric(df[mask_field], errors="coerce").fillna(0) > 0]

    serie = serie.dropna()
    return round(float(serie.mean()), 2) if not serie.empty else 0.0


def average_blocks(bloques: list[dict]) -> dict[str, Any]:
    """
    Promedia varios bloques de periodo en uno solo.

    Los volúmenes quedan como promedio mensual y las tasas como promedio simple
    de las tasas de cada periodo —no como la tasa del agregado—, para que un mes
    de mucho volumen no aplaste a los demás al juzgar el desempeño típico.
    """
    if not bloques:
        return {}

    df = pd.DataFrame(bloques)
    avg: dict[str, Any] = {field: _mean_of(df, field) for field in SUPPORT_VOLUME_FIELDS}
    avg.update({field: _mean_of(df, field) for field in SUPPORT_RATE_FIELDS})

    for medida, muestra in _TIME_MASKS.items():
        for stat in TIME_STATS:
            key = f"tiempo_{stat}_{medida}_horas"
            avg[key] = _mean_of(df, key, muestra)
        avg[f"pct_excede_promedio_{medida}"] = _mean_of(df, f"pct_excede_promedio_{medida}", muestra)
        avg[muestra] = _mean_of(df, muestra)

    avg["periodos_evaluados"] = len(bloques)
    return avg


def run_support_analysis(periodo_str: str | None = None) -> dict:
    """
    Recalcula soporte: la cohorte de cada periodo y el promedio global.

    El promedio acumulado se recalcula siempre sobre TODO lo que hay en
    `support_cierre_historico`, no sólo sobre los periodos recién procesados:
    analizar un mes suelto no debe borrar el histórico del dashboard de empresa.
    """
    db = DBConnector()
    ensure_support_schema(db)
    df_all = db.read_table(TableNames.SUPPORT_TICKETS)

    if df_all.empty:
        print("⚠️ No hay tickets de soporte para analizar.")
        return {"status": "empty", "message": "No hay tickets cargados."}

    df_all = classify_tickets(df_all)

    if periodo_str and len(periodo_str) == 7:
        periodos_target = [periodo_str]
    else:
        periodos_target = periodos_disponibles(df_all)

    print(f"\n📊 PROCESANDO SOPORTE TÉCNICO PARA {len(periodos_target)} PERIODO(S)...")

    resumenes: dict[str, dict] = {}

    for periodo in periodos_target:
        cohorte = build_cohort(df_all, periodo)
        metricas = compute_metrics_for_period(cohorte)

        _save_cierre_historico(db, periodo, metricas)
        save_support_dimensiones_periodo(db, periodo, build_dimension_rows(cohorte))

        resumenes[periodo] = metricas
        print(f"   · {periodo}: {metricas['tickets_creados']} creados, "
              f"{metricas['tickets_cerrados']} cerrados")

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
