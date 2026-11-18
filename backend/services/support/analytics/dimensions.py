# backend/support/dimensions.py
"""
Persistencia del corte dimensional de un periodo.

Se guarda un nivel plano: el total de cada grupo de trabajo y, dentro de él,
cada valor de las tres dimensiones (zona, sucursal, asignado a) y de los tres
desgloses (tipo, razón, solución).

El cruce dimensión × desglose —la zona X vista por razón de falla— NO se
persiste. Con el volumen real el producto cartesiano son decenas de miles de
filas JSONB por periodo, para algo que se consulta de una en una;
`queries.get_support_breakdown` lo calcula al vuelo sobre los tickets del
periodo con estas mismas funciones.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from core.database import DBConnector
from core.tables import replace
from services.support.analytics.cohorts import PeriodCohort
from services.support.analytics.config import (
    GROUP_DIM,
    SUPPORT_DESGLOSES,
    SUPPORT_DIMENSIONES,
)
from services.support.analytics.metrics import compute_metrics_for_period
from services.support.analytics.tables import DIMENSION_HISTORY

logger = logging.getLogger(__name__)


def build_dimension_rows(cohorte: PeriodCohort) -> list[dict[str, Any]]:
    """Las filas de dimensión de una cohorte.

    La forma de cada fila es la misma que devuelve `get_support_dimension_metrics`
    al leerlas de la base, de modo que un corte recién calculado y uno persistido
    se estructuran con la misma función.
    """
    rows: list[dict[str, Any]] = []

    def fila(grupo: str, dimension: str, valor: str, sub: PeriodCohort) -> None:
        rows.append({
            "grupo_trabajo": grupo,
            "dimension": dimension,
            "valor": valor,
            "metricas": compute_metrics_for_period(sub),
        })

    for grupo, c_group in cohorte.desglosar(GROUP_DIM):
        fila(grupo, GROUP_DIM, grupo, c_group)

        for dimension in (*SUPPORT_DIMENSIONES, *SUPPORT_DESGLOSES):
            for valor, c_value in c_group.desglosar(dimension):
                fila(grupo, dimension, valor, c_value)

    return rows


def save_dimensions(db: DBConnector, periodo: str, rows: list[dict[str, Any]]) -> None:
    """Reemplaza las filas dimensionales del periodo por las recién calculadas."""
    df = pd.DataFrame(rows, columns=["grupo_trabajo", "dimension", "valor", "metricas"])
    with db.transaction() as cur:
        replace(cur, DIMENSION_HISTORY, df, periodo_reporte=periodo)
