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
    last_day_to_compute,
    month_bounds,
    month_label,
    months_with_days,
    read_month,
    save_days,
)
from core.models import Period

from .analyzer import MetricsAnalyzer
from .analyzer import dimensions as dim_mod
from .tables import DAY_METRICS

logger = logging.getLogger(__name__)

# Dimension que necesitan SalesReport y BusinessUnits para agrupar por sede.
DAILY_DIMENSION = "zona_sucursal"

# Dimensiones del selector de Analytics: se guardan por dia para que la tabla
# y los graficos por dimension cambien junto con la barra de dias.
DIMENSIONS_ANALYTICS = ["zona", "sucursal", "municipio", "campanna", "producto"]

DAILY_DIMENSIONS = [DAILY_DIMENSION, *DIMENSIONS_ANALYTICS]

# Cada cuantos dias se vuelca el progreso a la base.
FLUSH_EVERY_N_DAYS = 5


def _day_payload(c: dict[str, Any], dim_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Arma el JSON de un dia: metricas globales + desgloses por dimension.

    `dimensiones` se mantiene como lista plana de `zona_sucursal` (la forma que
    ya leen SalesReport y BusinessUnits) y `dims` agrupa las dimensiones del
    selector de Analytics por nombre.
    """
    summary = dict(c["summary"])
    summary.pop("periodo", None)

    flat: list[dict[str, Any]] = []
    by_dim: dict[str, list[dict[str, Any]]] = {d: [] for d in DIMENSIONS_ANALYTICS}
    for row in dim_rows:
        dim = row.get("dimension")
        clean = {k: v for k, v in row.items() if k != "dimension"}
        if dim == DAILY_DIMENSION:
            flat.append(clean)
        elif dim in by_dim:
            by_dim[dim].append(clean)

    return {"global": summary, "dimensiones": flat, "dims": by_dim}


def build_day_metrics(
    year_month: str,
    db: DBConnector | None = None,
    until_day: int | None = None,
    analyzer: MetricsAnalyzer | None = None,
    progress: Callable[[int, int, str], None] | None = None,
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
    year, month, _ = month_bounds(year_month)
    cap = last_day_to_compute(year_month, until_day)

    if analyzer is None:
        analyzer = MetricsAnalyzer(db, Period.build(f"{year_month}-01"))
        analyzer.load_data()
        analyzer.build_clean_data()
        analyzer._apply_log_rules()

    pending: dict[str, Any] = {}
    active_start = 0
    label = month_label(year_month)

    for day in range(1, cap + 1):
        period = Period.build(
            f"{year_month}-01", f"{year:04d}-{month:02d}-{day:02d}"
        )
        c = analyzer._compute(period)
        dim_rows = dim_mod.aggregate_dimensions(
            db, period,
            c["act_ini"], c["act_fin"], c["nuevos"], c["df_bajas"],
            c["df_inactivos"], c["df_react_all"], c["df_corte_impagado"],
            df_react_not_in_ini=c["df_react_not_in_ini"],
            df_subs_full=analyzer.df_subs_full,
            df_free_end=c["free_fin"],
            df_free_period=c["df_free_periodo"],
            df_free_comeback=c["df_free_retorno"],
            persist=False,
            # Sobre el frame ya preparado: evita rehacer el mapeo 31 veces.
            dims=DAILY_DIMENSIONS,
            prepared=analyzer._dim_prepared,
        )
        active_start = c["summary"]["activos_inicio"]
        pending[f"dia{day}"] = _day_payload(c, dim_rows)
        print(f"  dia {day:02d}/{cap} OK")
        if progress is not None:
            progress(day, cap, f"Dia {day} de {cap}")

        # Volcado parcial: el upsert solo toca los dias enviados, asi que si la
        # ejecucion se corta el trabajo ya hecho queda guardado.
        if len(pending) >= FLUSH_EVERY_N_DAYS:
            _save(db, label, active_start, pending)
            print(f"  -> guardados {len(pending)} dias")
            pending = {}

    if pending:
        _save(db, label, active_start, pending)

    print(f"\nMETRICAS DIARIAS GUARDADAS | {label} | {cap} dias")
    return {"periodo_reporte": label, "dias_calculados": cap}


def _save(db: DBConnector, label: str, active_start: int, days: dict[str, Any]) -> None:
    """Vuelca los dias pendientes a `analyzer_day_metrics`."""
    save_days(db, DAY_METRICS, label, days, active_start=active_start)


def get_day_metrics(year_month: str) -> dict[str, Any]:
    """Devuelve el mes completo: {activos_inicio, dias: {1: {...}, ...}}."""
    data = read_month(TableNames.ANALYZER_DAY_METRICS, year_month, scalars=("activos_inicio",))
    if not data:
        return {}
    data["activos_inicio"] = int(data.get("activos_inicio") or 0)
    return data


def get_periods_with_days() -> list[str]:
    """Meses (YYYY-MM) que ya tienen metricas diarias calculadas."""
    return months_with_days(TableNames.ANALYZER_DAY_METRICS)
