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

from psycopg2.extras import execute_values

from backend.conf_config import DB_SCHEMA, TableNames
from backend.database import DBConnector
from backend.support.cohorts import PeriodCohort
from backend.support.config import (
    DIM_GRUPO,
    SUPPORT_DESGLOSES,
    SUPPORT_DIMENSIONES,
)
from backend.support.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)

_INSERT_COLUMNS = ["periodo_reporte", "grupo_trabajo", "dimension", "valor", "metricas"]


def build_dimension_rows(cohorte: PeriodCohort) -> list[tuple]:
    """Las filas de dimensión de una cohorte, listas para insertar."""
    rows: list[tuple] = []

    def fila(grupo: str, dimension: str, valor: str, sub: PeriodCohort) -> None:
        rows.append((
            cohorte.periodo, grupo, dimension, valor,
            json.dumps(compute_metrics_for_period(sub)),
        ))

    for grupo, c_grupo in cohorte.desglosar(DIM_GRUPO):
        fila(grupo, DIM_GRUPO, grupo, c_grupo)

        for dimension in (*SUPPORT_DIMENSIONES, *SUPPORT_DESGLOSES):
            for valor, c_valor in c_grupo.desglosar(dimension):
                fila(grupo, dimension, valor, c_valor)

    return rows


def save_support_dimensiones_periodo(db: DBConnector, periodo: str, rows: list[tuple]) -> None:
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
                    rows,
                    template="(%s, %s, %s, %s, %s, NOW())",
                )
        conn.commit()
