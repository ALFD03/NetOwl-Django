"""Metricas diarias de CRM (tabla `crm_day_metrics`).

Una fila por mes con la forma:

    periodo_reporte | dia1 | dia2 | ... | dia31

Cada columna `diaN` es un JSON con el corte acumulado del mes hasta ese dia:

    {"global": {...}, "dimensiones": [{dimension, valor, metricas, efectividad}]}

Es la misma forma que la vista recibe del historico (`get_crm_cierre_historico`
y `get_crm_dimensiones`), de modo que Analytics no distingue si esta mirando el
cierre del mes o el corte de un dia: le llegan las mismas dos props.

**El calculo recorre el mes reutilizando una sola carga.** Preparar la base de
CRM -leer las dos tablas, deduplicar, resolver a que oportunidad pertenece cada
movimiento y medir las estancias en curso- es el coste dominante; hacer despues
treinta y un cortes sobre los mismos frames sale barato comparado con volver a
leerlo todo.

**El mes no viaja entero a los props, a diferencia de suscripciones.** Un dia de
CRM lleva el bloque completo de metricas de cada vendedor, sucursal y campana
-decenas de campos por valor, mas la efectividad por etapa-, asi que el mes son
megabytes. Lo que si viaja entero es la **serie ligera** (`get_crm_day_series`):
el bloque global de los treinta y un dias, recortado en Postgres. Con eso las
tarjetas del dia, el acumulado, la variacion contra el dia anterior y las lineas
de tendencia se resuelven en el cliente sin pedir nada. Solo el desglose
dimensional se pide por dia (`get_crm_day_payload`), y el cliente lo cachea.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from core.config import TableNames
from core.database import DBConnector
from core.day_metrics import (
    fecha_corte,
    leer_payload,
    leer_serie,
    periodos_con_dias,
    ultimo_dia_a_calcular,
)
from core.utils import clean_json_props

from .dimensions import build_crm_dimension_rows
from .poblaciones import (
    DatosCrm,
    PoblacionesCrm,
    construir_poblaciones,
    preparar_datos,
)

logger = logging.getLogger(__name__)

# Cada cuantos dias se vuelca el progreso a la base.
FLUSH_CADA_N_DIAS = 5


def _payload_dia(pob: PoblacionesCrm) -> dict[str, Any]:
    """El JSON de un dia: el cierre acumulado mas su desglose dimensional.

    `global` lleva ademas `periodo_reporte` para ser intercambiable con la fila
    de `crm_cierre_historico`, que es lo que la vista manda cuando el mes no
    tiene cortes diarios.
    """
    return clean_json_props({
        "global": {"periodo_reporte": pob.periodo, **pob.metricas()},
        "dimensiones": build_crm_dimension_rows(pob),
    })


def build_crm_day_metrics(
    year_month: str,
    db: DBConnector | None = None,
    datos: DatosCrm | None = None,
    hasta_dia: int | None = None,
    progreso: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """Calcula y guarda el corte de cada dia del mes.

    `datos` permite reaprovechar la base que ya preparo el analisis mensual, de
    modo que un solo boton haga una sola lectura para el cierre y para los dias.

    `progreso(hechos, total, etiqueta)` se llama al cerrar cada dia: es lo que
    alimenta la barra de la interfaz desde la tarea de Celery.
    """
    db = db or DBConnector()
    datos = datos if datos is not None else preparar_datos(db)
    if datos.vacio:
        return {"periodo_reporte": year_month, "dias_calculados": 0}

    tope = ultimo_dia_a_calcular(year_month, hasta_dia)
    # La clave de fila es el mes en `YYYY-MM`, la misma que usan el cierre y las
    # dimensiones de CRM. Suscripciones usa la etiqueta larga porque asi nacieron
    # sus tablas; mezclarlas aqui obligaria a traducir en cada lectura.
    label = year_month
    pendientes: dict[str, Any] = {}
    calculados = 0

    for dia in range(1, tope + 1):
        pob = construir_poblaciones(datos, year_month, hasta=fecha_corte(year_month, dia))
        # Un dia sin nada creado todavia no deja columna: la barra lo pinta como
        # hueco en vez de como un corte de ceros, que se leeria como un dato.
        if pob is not None:
            pendientes[f"dia{dia}"] = _payload_dia(pob)
            calculados += 1
        print(f"  dia {dia:02d}/{tope} OK")
        if progreso is not None:
            progreso(dia, tope, f"Dia {dia} de {tope}")

        # Volcado parcial: el upsert solo toca los dias enviados, asi que si la
        # ejecucion se corta el trabajo ya hecho queda guardado.
        if len(pendientes) >= FLUSH_CADA_N_DIAS:
            _guardar(db, label, pendientes)
            print(f"  -> guardados {len(pendientes)} dias")
            pendientes = {}

    if pendientes:
        _guardar(db, label, pendientes)

    print(f"\nMETRICAS DIARIAS DE CRM GUARDADAS | {label} | {calculados} dias")
    return {"periodo_reporte": label, "dias_calculados": calculados}


def _guardar(db: DBConnector, label: str, dias: dict[str, Any]) -> None:
    """Vuelca los dias pendientes a `crm_day_metrics`."""
    db.save_day_metrics(label, dias, table=TableNames.CRM_DAY_METRICS)


def get_crm_day_payload(year_month: str, dia: int) -> dict[str, Any] | None:
    """El corte completo de un dia: `{global, dimensiones}`, o None si no esta.

    Es lo pesado —el bloque de cada vendedor, sucursal y campana— y por eso se
    pide de uno en uno. Los dias que hay calculados los dice `get_crm_day_series`.
    """
    return leer_payload(TableNames.CRM_DAY_METRICS, year_month, dia, clave=year_month)


def get_crm_day_series(year_month: str) -> dict[str, Any]:
    """La serie ligera del mes: el bloque global de cada dia, sin desgloses.

    Es lo que alimenta las tarjetas del dia y las lineas de tendencia sin que
    mover la barra cueste una consulta.
    """
    return leer_serie(TableNames.CRM_DAY_METRICS, year_month, clave=year_month)


def get_crm_periodos_con_dias() -> list[str]:
    """Meses (`YYYY-MM`) que ya tienen cortes diarios calculados."""
    return periodos_con_dias(TableNames.CRM_DAY_METRICS)
