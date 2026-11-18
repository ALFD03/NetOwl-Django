"""Metricas diarias de soporte (tabla `support_day_metrics`).

Una fila por mes con la forma:

    periodo_reporte | dia1 | dia2 | ... | dia31

Cada columna `diaN` es un JSON con el corte acumulado del mes hasta ese dia:

    {"global": {...}, "global_grupos": {...}, "grupos": {...}, "incidencia_zonas": {...}}

`grupos` e `incidencia_zonas` son las dos claves que
`get_support_analytics_structured` devuelve para el mes entero, asi que Analytics
no distingue si esta mirando el cierre o el corte de un dia: recibe el mismo
bloque. `global` es el bloque de la cohorte completa del dia -el mismo que
`support_cierre_historico` guarda para el mes- y `global_grupos` el de cada grupo
de trabajo por separado. Los dos estan aparte porque son lo unico que se lee de
los treinta y un dias a la vez: de ahi salen las tarjetas del dia, el acumulado y
las lineas de tendencia, sin traerse los desgloses.

`global_grupos` existe porque **la pagina entera esta filtrada por grupo**: el
selector no tiene un "todos", asi que unas tarjetas con el total de la empresa
dirian otra cosa que el resto de la pantalla. No cuesta nada calcularlo:
`build_dimension_rows` ya mide cada grupo para su fila `grupo_trabajo`, y aqui
solo se recogen esas metricas.

**El corte del dia N es el acumulado del mes hasta ese dia**: los tickets que
habian nacido y los que ya habian cerrado. Un ticket abierto el 3 y cerrado el
20 cuenta como creado -y como rezagado- en el corte del 15, y solo pasa a
cerrado del 20 en adelante. Es la misma lectura que la barra de suscripciones.

**El mes no viaja entero a los props.** Un dia de soporte lleva el bloque
completo de metricas de cada grupo de trabajo por sus seis ejes -zona, sucursal,
tecnico, tipo, razon y solucion-, que son varios cientos de bloques; el mes
serian megabytes en el navegador. Lo que si viaja entero es la **serie ligera**
(`get_support_day_series`): el bloque global de los treinta y un dias, recortado
en Postgres. Con eso las tarjetas del dia, el acumulado, la variacion contra el
dia anterior y las lineas de tendencia se resuelven en el cliente sin pedir nada.
Solo el desglose se pide por dia (`get_support_day_payload`), y el cliente lo
cachea.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import pandas as pd

from core.config import TableNames
from core.database import DBConnector
from core.day_metrics import (
    cutoff_date,
    last_day_to_compute,
    months_with_days,
    read_day,
    read_series,
    save_days,
)
from core.utils import clean_json_props

from .cohorts import build_cohort
from .dimensions import build_dimension_rows
from .escalation import load_tickets
from .metrics import compute_metrics_for_period
from .queries import (
    contexto_incidencia,
    get_incidence_by_zone,
    structure_groups,
)
from .tables import DAY_METRICS
from .users import annotate_departments

logger = logging.getLogger(__name__)

# Cada cuantos dias se vuelca el progreso a la base.
FLUSH_EVERY_N_DAYS = 5


def build_support_day_metrics(
    year_month: str,
    db: DBConnector | None = None,
    df_all: pd.DataFrame | None = None,
    until_day: int | None = None,
    progreso: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """Calcula y guarda el corte de cada dia del mes.

    `df_all` permite reaprovechar los tickets que ya clasifico -y repartio entre
    ATC y Soporte- el analisis mensual: leer y clasificar la tabla es el coste dominante, recortar treinta
    y un cortes sobre ella no.

    `progreso(hechos, total, etiqueta)` se llama al cerrar cada dia: es lo que
    alimenta la barra de la interfaz desde la tarea de Celery.
    """
    db = db or DBConnector()
    if df_all is None:
        df_all = load_tickets(db)
    if df_all.empty:
        return {"periodo_reporte": year_month, "dias_calculados": 0}

    tope = last_day_to_compute(year_month, until_day)
    # Las zonas y los activos del mes son los mismos para los treinta y un
    # cortes: se leen una vez y se comparten.
    zone_info, active_map = contexto_incidencia(db, year_month)

    pendientes: dict[str, Any] = {}
    calculados = 0

    for dia in range(1, tope + 1):
        cohorte = build_cohort(df_all, year_month, hasta=cutoff_date(year_month, dia))
        # Un dia sin un solo ticket no deja columna: la barra lo pinta como hueco
        # en vez de como un corte de ceros, que se leeria como un dato.
        if not cohorte.empty:
            grupos = structure_groups(build_dimension_rows(cohorte))
            pendientes[f"dia{dia}"] = clean_json_props({
                "global": compute_metrics_for_period(cohorte),
                # Reaprovechadas de las filas dimensionales: la metrica de cada
                # grupo ya se calculo para su fila `grupo_trabajo`.
                "global_grupos": {g: b["metricas"] for g, b in grupos.items()},
                "grupos": grupos,
                "incidencia_zonas": get_incidence_by_zone(
                    db, cohorte, zone_info=zone_info, active_map=active_map
                ),
            })
            calculados += 1
        print(f"  dia {dia:02d}/{tope} OK")
        if progreso is not None:
            progreso(dia, tope, f"Dia {dia} de {tope}")

        # Volcado parcial: el upsert solo toca los dias enviados, asi que si la
        # ejecucion se corta el trabajo ya hecho queda guardado.
        if len(pendientes) >= FLUSH_EVERY_N_DAYS:
            _save(db, year_month, pendientes)
            print(f"  -> guardados {len(pendientes)} dias")
            pendientes = {}

    if pendientes:
        _save(db, year_month, pendientes)

    print(f"\nMETRICAS DIARIAS DE SOPORTE GUARDADAS | {year_month} | {calculados} dias")
    return {"periodo_reporte": year_month, "dias_calculados": calculados}


def _save(db: DBConnector, label: str, dias: dict[str, Any]) -> None:
    """Vuelca los dias pendientes a `support_day_metrics`."""
    save_days(db, DAY_METRICS, label, dias)


def get_support_day_payload(year_month: str, dia: int) -> dict[str, Any] | None:
    """El corte completo de un dia: `{global, grupos, incidencia_zonas}`, o None.

    Es lo pesado —cada grupo de trabajo por sus seis ejes— y por eso se pide de
    uno en uno. Los dias calculados los dice `get_support_day_series`.

    El departamento de cada persona se anota **aqui, al leer**, y no esta
    guardado dentro del corte: asi un cambio en el directorio se ve en todos
    los dias ya calculados sin volver a analizar el mes.
    """
    payload = read_day(TableNames.SUPPORT_DAY_METRICS, year_month, dia, key=year_month)
    if payload:
        annotate_departments(payload.get("grupos") or {}, cutoff_date(year_month, dia))
    return payload


def get_support_day_series(year_month: str) -> dict[str, Any]:
    """La serie ligera del mes: los bloques globales de cada dia, sin desgloses.

    Devuelve lo de `read_series` mas `serie_grupos`, que es lo mismo abierto por
    grupo de trabajo. Las dos viajan a los props porque la pagina esta filtrada
    por grupo y las tarjetas tienen que seguir al selector; juntas son unos pocos
    kilobytes, frente a los megabytes de los desgloses.

    Son dos lecturas de la misma fila y no una para no traerse el resto del JSON:
    el recorte lo sigue haciendo Postgres.
    """
    serie = read_series(TableNames.SUPPORT_DAY_METRICS, year_month, key=year_month)
    por_grupo = read_series(
        TableNames.SUPPORT_DAY_METRICS, year_month,
        key=year_month, block="global_grupos",
    )
    return {**serie, "serie_grupos": por_grupo.get("serie", {})}


def get_support_periods_with_days() -> list[str]:
    """Meses (`YYYY-MM`) que ya tienen cortes diarios calculados."""
    return months_with_days(TableNames.SUPPORT_DAY_METRICS)
