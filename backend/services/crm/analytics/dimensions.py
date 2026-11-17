"""El mismo bloque de metricas, recortado por campana, sucursal y vendedor."""

from __future__ import annotations

import json
import logging
from typing import Any

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector

from .config import DIMENSIONES
from .poblaciones import PoblacionesCrm

logger = logging.getLogger(__name__)


def build_crm_dimension_rows(pob: PoblacionesCrm) -> list[dict[str, Any]]:
    """Las metricas de cada valor dimensional del periodo.

    Cada rebanada se calcula con la **misma** funcion que el total, asi que una
    sucursal se mide exactamente igual que la empresa entera: `PoblacionesCrm`
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


def save_crm_dimensiones_periodo(
    db: DBConnector, periodo: str, filas: list[dict[str, Any]]
) -> None:
    """Reemplaza las filas dimensionales del periodo por las recien calculadas."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO} WHERE periodo_reporte = %s",
                [periodo]
            )
            for fila in filas:
                cur.execute(
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}
                    (periodo_reporte, dimension, valor, metricas, efectividad, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    """,
                    [
                        periodo,
                        fila["dimension"],
                        fila["valor"],
                        json.dumps(fila["metricas"]),
                        json.dumps(fila["efectividad"]),
                    ],
                )
        conn.commit()
