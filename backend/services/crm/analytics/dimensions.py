"""El mismo bloque de metricas, recortado por campana, sucursal y vendedor."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from core.database import DBConnector
from core.tables import replace

from .config import DIMENSIONES
from .populations import CrmPopulations
from .tables import DIMENSION_HISTORY

logger = logging.getLogger(__name__)


def build_crm_dimension_rows(pob: CrmPopulations) -> list[dict[str, Any]]:
    """Las metricas de cada valor dimensional del periodo.

    Cada rebanada se calcula con la **misma** funcion que el total, asi que una
    sucursal se mide exactamente igual que la empresa entera: `CrmPopulations`
    se recorta y se vuelve a medir, sin una segunda definicion de nada.

    La forma de cada fila es la que devuelve `get_crm_dimensiones`, de modo que
    la vista lee igual una fila persistida que una recien calculada para un dia.
    """
    filas: list[dict[str, Any]] = []

    for dim in DIMENSIONES:
        for valor in pob.valores(dim):
            rebanada = pob.filtrar(dim, valor)
            if rebanada.vacio:
                continue
            metricas = rebanada.metricas()
            filas.append({
                "periodo_reporte": pob.periodo,
                "dimension": dim,
                "valor": valor,
                "metricas": metricas,
                "efectividad": metricas.get("efectividad", []),
            })

    return filas


def save_dimensions(db: DBConnector, periodo: str, filas: list[dict[str, Any]]) -> None:
    """Reemplaza las filas dimensionales del periodo por las recién calculadas."""
    df = pd.DataFrame(filas, columns=["dimension", "valor", "metricas", "efectividad"])
    with db.transaction() as cur:
        replace(cur, DIMENSION_HISTORY, df, periodo_reporte=periodo)
