"""Metricas diarias de soporte (tabla `support_day_metrics`).

Una fila por mes con la forma:

    periodo_reporte | dia1 | dia2 | ... | dia31

Cada columna `diaN` es un JSON con el corte acumulado del mes hasta ese dia:

    {"grupos": {...}, "incidencia_zonas": {...}}

Son las dos claves que `get_support_analytics_structured` devuelve para el mes
entero, asi que Analytics no distingue si esta mirando el cierre o el corte de
un dia: recibe el mismo bloque.

**El corte del dia N es el acumulado del mes hasta ese dia**: los tickets que
habian nacido y los que ya habian cerrado. Un ticket abierto el 3 y cerrado el
20 cuenta como creado -y como rezagado- en el corte del 15, y solo pasa a
cerrado del 20 en adelante. Es la misma lectura que la barra de suscripciones.

**El mes no viaja entero a los props.** Un dia de soporte lleva el bloque
completo de metricas de cada grupo de trabajo por sus seis ejes -zona, sucursal,
tecnico, tipo, razon y solucion-, que son varios cientos de bloques; el mes
serian megabytes en el navegador. La barra viaja con la lista de dias calculados
y elegir uno es una recarga parcial que lee una celda ya calculada.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import pandas as pd

from core.config import TableNames
from core.database import DBConnector
from core.day_metrics import (
    fecha_corte,
    leer_dia,
    periodos_con_dias,
    ultimo_dia_a_calcular,
)
from core.utils import clean_json_props

from .cohorts import build_cohort, classify_tickets
from .dimensions import build_dimension_rows
from .queries import (
    contexto_incidencia,
    estructurar_grupos,
    get_incidencia_por_zona,
)

logger = logging.getLogger(__name__)

# Cada cuantos dias se vuelca el progreso a la base.
FLUSH_CADA_N_DIAS = 5


def build_support_day_metrics(
    year_month: str,
    db: DBConnector | None = None,
    df_all: pd.DataFrame | None = None,
    hasta_dia: int | None = None,
    progreso: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """Calcula y guarda el corte de cada dia del mes.

    `df_all` permite reaprovechar los tickets que ya clasifico el analisis
    mensual: leer y clasificar la tabla es el coste dominante, recortar treinta
    y un cortes sobre ella no.

    `progreso(hechos, total, etiqueta)` se llama al cerrar cada dia: es lo que
    alimenta la barra de la interfaz desde la tarea de Celery.
    """
    db = db or DBConnector()
    if df_all is None:
        df_all = classify_tickets(db.read_table(TableNames.SUPPORT_TICKETS))
    if df_all.empty:
        return {"periodo_reporte": year_month, "dias_calculados": 0}

    tope = ultimo_dia_a_calcular(year_month, hasta_dia)
    # Las zonas y los activos del mes son los mismos para los treinta y un
    # cortes: se leen una vez y se comparten.
    zone_info, activos_map = contexto_incidencia(db, year_month)

    pendientes: dict[str, Any] = {}
    calculados = 0

    for dia in range(1, tope + 1):
        cohorte = build_cohort(df_all, year_month, hasta=fecha_corte(year_month, dia))
        # Un dia sin un solo ticket no deja columna: la barra lo pinta como hueco
        # en vez de como un corte de ceros, que se leeria como un dato.
        if not cohorte.empty:
            pendientes[f"dia{dia}"] = clean_json_props({
                "grupos": estructurar_grupos(build_dimension_rows(cohorte)),
                "incidencia_zonas": get_incidencia_por_zona(
                    db, cohorte, zone_info=zone_info, activos_map=activos_map
                ),
            })
            calculados += 1
        print(f"  dia {dia:02d}/{tope} OK")
        if progreso is not None:
            progreso(dia, tope, f"Dia {dia} de {tope}")

        # Volcado parcial: el upsert solo toca los dias enviados, asi que si la
        # ejecucion se corta el trabajo ya hecho queda guardado.
        if len(pendientes) >= FLUSH_CADA_N_DIAS:
            _guardar(db, year_month, pendientes)
            print(f"  -> guardados {len(pendientes)} dias")
            pendientes = {}

    if pendientes:
        _guardar(db, year_month, pendientes)

    print(f"\nMETRICAS DIARIAS DE SOPORTE GUARDADAS | {year_month} | {calculados} dias")
    return {"periodo_reporte": year_month, "dias_calculados": calculados}


def _guardar(db: DBConnector, label: str, dias: dict[str, Any]) -> None:
    """Vuelca los dias pendientes a `support_day_metrics`."""
    db.save_day_metrics(label, dias, table=TableNames.SUPPORT_DAY_METRICS)


def get_support_day_metrics(year_month: str, dia: int | None = None) -> dict[str, Any]:
    """El corte de un dia del mes, mas los dias que hay calculados.

    Devuelve `{periodo_mes, dias_disponibles, dia, payload}`; `payload` trae
    `grupos` e `incidencia_zonas` con la misma forma que el bloque del mes.
    """
    return leer_dia(TableNames.SUPPORT_DAY_METRICS, year_month, dia, clave=year_month)


def get_support_periodos_con_dias() -> list[str]:
    """Meses (`YYYY-MM`) que ya tienen cortes diarios calculados."""
    return periodos_con_dias(TableNames.SUPPORT_DAY_METRICS)
