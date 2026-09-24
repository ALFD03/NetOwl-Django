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

import json
import logging
from typing import Any

from psycopg2.extras import execute_values

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.cohorts import PeriodCohort
from services.support.analytics.config import (
    DIM_GRUPO,
    SUPPORT_DESGLOSES,
    SUPPORT_DIMENSIONES,
)
from services.support.analytics.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)

_INSERT_COLUMNS = ["periodo_reporte", "grupo_trabajo", "dimension", "valor", "metricas"]


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

    for grupo, c_grupo in cohorte.desglosar(DIM_GRUPO):
        fila(grupo, DIM_GRUPO, grupo, c_grupo)

        for dimension in (*SUPPORT_DIMENSIONES, *SUPPORT_DESGLOSES):
            for valor, c_valor in c_grupo.desglosar(dimension):
                fila(grupo, dimension, valor, c_valor)

    return rows


def save_support_dimensiones_periodo(
    db: DBConnector, periodo: str, rows: list[dict[str, Any]]
) -> None:
    """
    Reemplaza las filas dimensionales del periodo por las recién calculadas.

    Un periodo son varios cientos de filas —cada grupo por sus seis ejes—, así
    que se insertan en una sola sentencia con `execute_values` en vez de dar
    otras tantas vueltas a la base.
    """
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} "
                f"WHERE periodo_reporte = %s",
                [periodo],
            )
            if rows:
                execute_values(
                    cur,
                    f"""
                    INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
                    ({", ".join(_INSERT_COLUMNS)}, updated_at)
                    VALUES %s
                    """,
                    [
                        (
                            periodo, r["grupo_trabajo"], r["dimension"], r["valor"],
                            json.dumps(r["metricas"]),
                        )
                        for r in rows
                    ],
                    template="(%s, %s, %s, %s, %s, NOW())",
                )
        conn.commit()
