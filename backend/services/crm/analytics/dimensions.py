"""El mismo bloque de metricas, recortado por campana, sucursal y vendedor."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from core.database import DBConnector
from core.tables import replace

from .config import DIMENSIONS
from .populations import CrmPopulations
from .tables import DIMENSION_HISTORY

logger = logging.getLogger(__name__)


def build_crm_dimension_rows(pop: CrmPopulations) -> list[dict[str, Any]]:
    """Las metricas de cada valor dimensional del periodo.

    Cada rebanada se calcula con la **misma** funcion que el total, asi que una
    sucursal se mide exactamente igual que la empresa entera: `CrmPopulations`
    se recorta y se vuelve a medir, sin una segunda definicion de nada.

    La forma de cada fila es la que devuelve `get_crm_dimensions`, de modo que
    la vista lee igual una fila persistida que una recien calculada para un dia.
    """
    rows: list[dict[str, Any]] = []

    for dim in DIMENSIONS:
        for value in pop.values(dim):
            segment = pop.filter_by(dim, value)
            if segment.empty:
                continue
            metrics = segment.metrics()
            rows.append({
                "periodo_reporte": pop.period,
                "dimension": dim,
                "valor": value,
                "metricas": metrics,
                "efectividad": metrics.get("efectividad", []),
            })

    return rows


def save_dimensions(db: DBConnector, period: str, rows: list[dict[str, Any]]) -> None:
    """Reemplaza las filas dimensionales del periodo por las recién calculadas."""
    df = pd.DataFrame(rows, columns=["dimension", "valor", "metricas", "efectividad"])
    with db.transaction() as cur:
        replace(cur, DIMENSION_HISTORY, df, periodo_reporte=period)
