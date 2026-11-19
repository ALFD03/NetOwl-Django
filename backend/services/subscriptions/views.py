"""`/api/subscriptions/`: datos de las páginas de suscripciones (ETA en `views_eta.py`)."""

from __future__ import annotations

import logging

from core.day_metrics import previous_month
from core.utils import clean_periods, request_int
from services.config.api import ApiError, endpoint
from services.config.periods import (
    clamp_requested,
    period_denied,
    sees_all_periods,
    visible_period,
    visible_periods,
)
from services.config.units import unit_scope
from services.imports.jobs import launch_analysis
from services.subscriptions.analytics import (
    clean_nodes,
    get_analytics_data,
    get_business_units_data,
    get_churn_close,
    get_churn_detail,
    get_day_metrics,
    get_day_series,
    get_dimensions,
    get_periods,
    get_sales_report_data,
    get_targets_config,
    get_zones_config,
    restrict_units,
)
from services.subscriptions.analytics.lifetime import (
    get_lifetime_detail,
    get_lifetime_month,
    get_lifetime_months,
)
from services.subscriptions.analytics.office_coordinators import get_office_coordinators
from services.subscriptions.api_keys import SUBS_KEYS

logger = logging.getLogger(__name__)

PERIOD_DENIED = "Acceso denegado. Solo puedes ver el último periodo evaluado."


def _day(request) -> int | None:
    return request_int(request, "day", min_value=1, max_value=31)


def _visible_selector(request, data: dict) -> dict:
    """Deja en el selector de un reporte solo los periodos visibles."""
    if "periods" in data:
        data["periods"] = visible_periods(request, data["periods"])
    return data


@endpoint(perms=["can_view_subscriptions", "can_view_subs_dashboard"], require_all=True, keys=SUBS_KEYS)
def dashboard(request):
    """Los cierres de todos los periodos visibles y sus zonas."""
    periods = clamp_requested(request, None, get_periods)
    closings = get_churn_close(periods) if periods != [] else []
    dims = get_dimensions(periods) if periods != [] else []
    zones = [zone for period in dims for zone in period.get("dimensiones", {}).get("zona", [])]
    return {"closings": closings, "dimensiones": {"zona": zones}, "objetivos": get_targets_config()}


def _day_metrics_with_previous(request, month: str) -> dict:
    """El mes de métricas diarias y, con `can_view_all_periods`, la serie ligera del anterior."""
    data = get_day_metrics(month)
    if data and sees_all_periods(request):
        previous = previous_month(month)
        data = {**data, "previous_month": previous, "previous_series": get_day_series(previous).get("serie", {})}
    return data


@endpoint(perms=["can_view_subs_analytics"], keys=SUBS_KEYS)
def analytics(request):
    """Cierres, dimensiones y el mes completo de métricas diarias (`?period=YYYY-MM`).

    El mes anterior viaja solo en su serie ligera: es la referencia del mismo día.
    """
    periods = clamp_requested(request, clean_periods(request.GET.get("periods")), get_periods)
    data = get_analytics_data(periods) if periods != [] else {}
    month = (request.GET.get("period") or "")[:7] if sees_all_periods(request) else ""
    if not month:
        listed = data.get("periodos", [])
        month = listed[0].get("periodo_reporte", "")[:7] if listed else ""
    return {
        "closings": data.get("periodos", []),
        "dimensiones": data.get("dimensiones", []),
        "dayMetrics": _day_metrics_with_previous(request, month),
        "objetivos": get_targets_config(),
    }


@endpoint(perms=["can_view_subs_results"], keys=SUBS_KEYS)
def results(request):
    """Los cierres para la tabla de resultados; `?period=` preselecciona uno."""
    period = request.GET.get("period") or None
    periods = clamp_requested(request, [period] if period else None, get_periods)
    if period and periods is not None and period not in periods:
        period = None
    return {
        "closings": get_churn_close(periods) if periods != [] else [],
        "selected_period": period,
        "objetivos": get_targets_config(),
    }


@endpoint(perms=["can_view_subs_results"], keys=SUBS_KEYS)
def result_detail(request, period: str):
    """El cierre y las dimensiones de un periodo."""
    if period_denied(request, period, get_periods):
        raise ApiError(PERIOD_DENIED, 403)
    closing = get_churn_close([period])
    dims = get_dimensions([period])
    return {
        "period": period,
        "summary": closing[0] if closing else {},
        "dimensions": dims[0]["dimensiones"] if dims else {},
    }


@endpoint(perms=["can_view_subs_lifetime"], keys=SUBS_KEYS)
def lifetime(request):
    """Cuánto duraron activas las bajas de un mes (`?period=`, por defecto el último)."""
    try:
        months = visible_periods(request, get_lifetime_months())
    except Exception:
        # La página abre aunque el análisis nunca se haya ejecutado.
        logger.exception("Error leyendo los meses de lifetime")
        months = []
    period = request.GET.get("period")
    if period not in months:
        period = months[0] if months else None
    return {"meses": months, "periodo": period, "lifetime": get_lifetime_month(period)}


@endpoint(perms=["can_view_subs_lifetime"], keys=SUBS_KEYS)
def lifetime_detail(request):
    """Las bajas de un mes con sus duraciones, una por orden, para exportar."""
    period = request.GET.get("period")
    if period_denied(request, period, get_lifetime_months):
        raise ApiError(PERIOD_DENIED, 403)
    return {"period": period, "bajas": get_lifetime_detail(period)}


@endpoint(methods=["POST"], perms=["can_run_lifetime"], rate="2/m")
def lifetime_run(request):
    """Encola el lifetime de todos los meses; se sigue en `/api/imports/jobs/<id>/`."""
    return launch_analysis(request, "subs_lifetime", needs_period=False)


@endpoint(perms=["can_view_subs_sales"], keys=SUBS_KEYS)
def sales_report(request):
    """Reporte de ventas: site → tecnología → nodos, con las coordinadoras de oficina."""
    period = visible_period(request, request.GET.get("period"), get_periods)
    data = _visible_selector(request, get_sales_report_data(period, _day(request)))
    return {
        "reportData": data,
        "dayMetrics": get_day_metrics((data.get("period") or "")[:7]),
        "coordinadorasOficina": get_office_coordinators(data.get("period")),
        "zonasConfig": get_zones_config(),
        "objetivos": get_targets_config(),
    }


@endpoint(perms=["can_view_subs_business_units"], keys=SUBS_KEYS)
def business_units(request):
    """Reporte por coordinador; quien no ve todas las unidades recibe solo las suyas."""
    period = visible_period(request, request.GET.get("period"), get_periods)
    data = _visible_selector(request, get_business_units_data(period, _day(request)))
    day_metrics = get_day_metrics((data.get("period") or "")[:7])
    zones = get_zones_config()
    scope = unit_scope(request.user)
    if scope is not None:
        data, day_metrics, zones = restrict_units(data, day_metrics, zones, scope.names(), scope.rf)
    return {"buData": data, "dayMetrics": day_metrics, "zonasConfig": zones, "objetivos": get_targets_config()}


@endpoint(perms=["can_view_subs_results", "can_view_subs_sales", "can_view_subs_business_units"], keys=SUBS_KEYS)
def churn_detail(request):
    """Las bajas de un periodo con la ficha de cada cliente, para exportar.

    `?node=` repetido acota a esos nodos `"Zona - Sucursal"`. Siempre es el
    detalle del cierre: los cortes diarios guardan agregados, no órdenes.
    """
    nodes = clean_nodes(request.GET.getlist("node"))
    period = visible_period(request, request.GET.get("period"), get_periods)
    return get_churn_detail(period, nodes)
