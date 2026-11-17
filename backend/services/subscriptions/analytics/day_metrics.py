"""Metricas diarias por periodo (tabla `analyzer_day_metrics`).

Una fila por mes con la forma:

    periodo_reporte | activos_inicio | dia1 | dia2 | ... | dia31

`activos_inicio` es la base activa con la que abre el mes (identica para todos
los dias). Cada columna `diaN` es un JSON con el corte acumulado del mes hasta
ese dia: metricas globales, el desglose por `zona_sucursal` que consumen los
reportes de ventas y unidades de negocio, y el resto de dimensiones del selector
de Analytics (bajo la clave `dims`) para que su tabla y sus graficos sigan al
dia elegido.

El objetivo es que una sola lectura de fila entregue el mes completo, de modo
que seleccionar un dia en la barra de progreso sea puramente de cliente y no
dispare ningun recalculo.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from core.config import TableNames
from core.database import DBConnector
from core.day_metrics import (
    leer_mes,
    mes_bounds,
    periodo_label_mes,
    periodos_con_dias,
    ultimo_dia_a_calcular,
)
from core.models import Periodo

from .analyzer import MetricsAnalyzer
from .analyzer import dimensions as dim_mod

logger = logging.getLogger(__name__)

# Dimension que necesitan SalesReport y BusinessUnits para agrupar por sede.
DIMENSION_DIARIA = "zona_sucursal"

# Dimensiones del selector de Analytics: se guardan por dia para que la tabla
# y los graficos por dimension cambien junto con la barra de dias.
DIMENSIONES_ANALYTICS = ["zona", "sucursal", "municipio", "campanna", "producto"]

DIMENSIONES_DIARIAS = [DIMENSION_DIARIA, *DIMENSIONES_ANALYTICS]

# Cada cuantos dias se vuelca el progreso a la base.
FLUSH_CADA_N_DIAS = 5


def _payload_dia(c: dict[str, Any], dim_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Arma el JSON de un dia: metricas globales + desgloses por dimension.

    `dimensiones` se mantiene como lista plana de `zona_sucursal` (la forma que
    ya leen SalesReport y BusinessUnits) y `dims` agrupa las dimensiones del
    selector de Analytics por nombre.
    """
    summary = dict(c["summary"])
    summary.pop("periodo", None)

    plana: list[dict[str, Any]] = []
    por_dim: dict[str, list[dict[str, Any]]] = {d: [] for d in DIMENSIONES_ANALYTICS}
    for row in dim_rows:
        dim = row.get("dimension")
        limpia = {k: v for k, v in row.items() if k != "dimension"}
        if dim == DIMENSION_DIARIA:
            plana.append(limpia)
        elif dim in por_dim:
            por_dim[dim].append(limpia)

    return {"global": summary, "dimensiones": plana, "dims": por_dim}


def build_day_metrics(
    year_month: str,
    db: DBConnector | None = None,
    hasta_dia: int | None = None,
    analyzer: MetricsAnalyzer | None = None,
    progreso: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """Calcula y guarda las metricas de cada dia del mes.

    Recorre los dias reutilizando una unica carga de datos: el coste dominante
    es la lectura de subscriptions/logs, no el calculo por corte.

    `analyzer` permite reaprovechar uno que ya tenga los datos cargados (el del
    analisis mensual), de modo que un solo boton haga una sola lectura para el
    cierre del mes y para los 31 dias.

    `progreso(hechos, total, etiqueta)` se llama al cerrar cada dia. Lo usa la
    tarea de Celery para alimentar la barra de la interfaz: el recorrido de los
    dias es la parte larga y es la unica con pasos contables.
    """
    db = db or DBConnector()
    anio, mes, _ = mes_bounds(year_month)
    tope = ultimo_dia_a_calcular(year_month, hasta_dia)

    if analyzer is None:
        analyzer = MetricsAnalyzer(db, Periodo.build(f"{year_month}-01"))
        analyzer.load_data()
        analyzer.build_clean_data()
        analyzer._apply_log_rules()

    pendientes: dict[str, Any] = {}
    activos_inicio = 0
    label = periodo_label_mes(year_month)

    for dia in range(1, tope + 1):
        periodo = Periodo.build(
            f"{year_month}-01", f"{anio:04d}-{mes:02d}-{dia:02d}"
        )
        c = analyzer._compute(periodo)
        dim_rows = dim_mod.aggregate_dimensions(
            db, periodo,
            c["act_ini"], c["act_fin"], c["nuevos"], c["df_bajas"],
            c["df_inactivos"], c["df_react_all"], c["df_corte_impagado"],
            df_react_not_in_ini=c["df_react_not_in_ini"],
            df_subs_full=analyzer.df_subs_full,
            df_free_fin=c["free_fin"],
            df_free_periodo=c["df_free_periodo"],
            df_free_retorno=c["df_free_retorno"],
            persist=False,
            # Sobre el frame ya preparado: evita rehacer el mapeo 31 veces.
            dims=DIMENSIONES_DIARIAS,
            prepared=analyzer._dim_prepared,
        )
        activos_inicio = c["summary"]["activos_inicio"]
        pendientes[f"dia{dia}"] = _payload_dia(c, dim_rows)
        print(f"  dia {dia:02d}/{tope} OK")
        if progreso is not None:
            progreso(dia, tope, f"Dia {dia} de {tope}")

        # Volcado parcial: el upsert solo toca los dias enviados, asi que si la
        # ejecucion se corta el trabajo ya hecho queda guardado.
        if len(pendientes) >= FLUSH_CADA_N_DIAS:
            _guardar(db, label, activos_inicio, pendientes)
            print(f"  -> guardados {len(pendientes)} dias")
            pendientes = {}

    if pendientes:
        _guardar(db, label, activos_inicio, pendientes)

    print(f"\nMETRICAS DIARIAS GUARDADAS | {label} | {tope} dias")
    return {"periodo_reporte": label, "dias_calculados": tope}


def _guardar(
    db: DBConnector, label: str, activos_inicio: int, dias: dict[str, Any]
) -> None:
    """Vuelca los dias pendientes a `analyzer_day_metrics`."""
    db.save_day_metrics(
        label,
        dias,
        table=TableNames.ANALYZER_DAY_METRICS,
        escalares={"activos_inicio": activos_inicio},
    )


def get_day_metrics(year_month: str) -> dict[str, Any]:
    """Devuelve el mes completo: {activos_inicio, dias: {1: {...}, ...}}."""
    datos = leer_mes(
        TableNames.ANALYZER_DAY_METRICS, year_month, escalares=("activos_inicio",)
    )
    if not datos:
        return {}
    datos["activos_inicio"] = int(datos.get("activos_inicio") or 0)
    return datos


def get_periodos_con_dias() -> list[str]:
    """Meses (YYYY-MM) que ya tienen metricas diarias calculadas."""
    return periodos_con_dias(TableNames.ANALYZER_DAY_METRICS)
