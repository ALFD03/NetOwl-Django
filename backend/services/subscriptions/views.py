"""`/api/subscriptions/`: datos de las páginas de suscripciones (ETA en `views_eta.py`)."""

from __future__ import annotations

import logging

from core.utils import entero_de_peticion, limpiar_periodos
from services.config.api import ApiError, endpoint
from services.config.periods import (
    clamp_requested,
    period_denied,
    sees_all_periods,
    visible_period,
    visible_periods,
)
from services.config.units import unit_scope
from services.imports.jobs import lanzar_analisis
from services.subscriptions.analytics import (
    get_analytics_data,
    get_bajas_detalle,
    get_business_units_data,
    get_cierre_churn,
    get_day_metrics,
    get_dimensiones,
    get_objetivos_config,
    get_periodos,
    get_sales_report_data,
    get_zonas_config,
    limpiar_nodos,
    restringir_unidades,
)
from services.subscriptions.analytics.coordinadoras_oficina import get_coordinadoras_oficina
from services.subscriptions.analytics.lifetime import (
    get_lifetime_detalle,
    get_lifetime_mes,
    get_meses_lifetime,
)

logger = logging.getLogger(__name__)

PERIOD_DENIED = "Acceso denegado. Solo puedes ver el último periodo evaluado."


def _day(request) -> int | None:
    return entero_de_peticion(request, "dia", minimo=1, maximo=31)


def _visible_selector(request, data: dict) -> dict:
    """Deja en el selector de un reporte solo los periodos visibles."""
    if "periods" in data:
        data["periods"] = visible_periods(request, data["periods"])
    return data


@endpoint(perms=["can_view_subscriptions", "can_view_subs_dashboard"], require_all=True)
def dashboard(request):
    """Los cierres de todos los periodos visibles y sus zonas."""
    periods = clamp_requested(request, None, get_periodos)
    closings = get_cierre_churn(periods) if periods != [] else []
    dims = get_dimensiones(periods) if periods != [] else []
    zones = [zone for period in dims for zone in period.get("dimensiones", {}).get("zona", [])]
    return {"periodos": closings, "dimensiones": {"zona": zones}, "objetivos": get_objetivos_config()}


@endpoint(perms=["can_view_subs_analytics"])
def analytics(request):
    """Cierres, dimensiones y el mes completo de métricas diarias (`?period=YYYY-MM`)."""
    periods = clamp_requested(request, limpiar_periodos(request.GET.get("periods")), get_periodos)
    data = get_analytics_data(periods) if periods != [] else {}
    month = (request.GET.get("period") or "")[:7] if sees_all_periods(request) else ""
    if not month:
        listed = data.get("periodos", [])
        month = listed[0].get("periodo_reporte", "")[:7] if listed else ""
    return {
        "periodos": data.get("periodos", []),
        "dimensiones": data.get("dimensiones", []),
        "dayMetrics": get_day_metrics(month),
        "objetivos": get_objetivos_config(),
    }


@endpoint(perms=["can_view_subs_results"])
def results(request):
    """Los cierres para la tabla de resultados; `?period=` preselecciona uno."""
    period = request.GET.get("period") or None
    periods = clamp_requested(request, [period] if period else None, get_periodos)
    if period and periods is not None and period not in periods:
        period = None
    return {
        "periodos": get_cierre_churn(periods) if periods != [] else [],
        "selected_periodo": period,
        "objetivos": get_objetivos_config(),
    }


@endpoint(perms=["can_view_subs_results"])
def result_detail(request, period: str):
    """El cierre y las dimensiones de un periodo."""
    if period_denied(request, period, get_periodos):
        raise ApiError(PERIOD_DENIED, 403)
    closing = get_cierre_churn([period])
    dims = get_dimensiones([period])
    return {
        "periodo": period,
        "summary": closing[0] if closing else {},
        "dimensions": dims[0]["dimensiones"] if dims else {},
    }


@endpoint(perms=["can_view_subs_lifetime"])
def lifetime(request):
    """Cuánto duraron activas las bajas de un mes (`?period=`, por defecto el último)."""
    try:
        months = visible_periods(request, get_meses_lifetime())
    except Exception:
        # La página abre aunque el análisis nunca se haya ejecutado.
        logger.exception("Error leyendo los meses de lifetime")
        months = []
    period = request.GET.get("period")
    if period not in months:
        period = months[0] if months else None
    return {"meses": months, "periodo": period, "lifetime": get_lifetime_mes(period)}


@endpoint(perms=["can_view_subs_lifetime"])
def lifetime_detail(request):
    """Las bajas de un mes con sus duraciones, una por orden, para exportar."""
    period = request.GET.get("period")
    if period_denied(request, period, get_meses_lifetime):
        raise ApiError(PERIOD_DENIED, 403)
    return {"period": period, "bajas": get_lifetime_detalle(period)}


@endpoint(methods=["POST"], perms=["can_run_lifetime"], rate="2/m")
def lifetime_run(request):
    """Encola el lifetime de todos los meses; se sigue en `/api/imports/jobs/<id>/`."""
    return lanzar_analisis(request, "subs_lifetime", requiere_periodo=False)


@endpoint(perms=["can_view_subs_sales"])
def sales_report(request):
    """Reporte de ventas: site → tecnología → nodos, con las coordinadoras de oficina."""
    period = visible_period(request, request.GET.get("period"), get_periodos)
    data = _visible_selector(request, get_sales_report_data(period, _day(request)))
    return {
        "reportData": data,
        "dayMetrics": get_day_metrics((data.get("period") or "")[:7]),
        "coordinadorasOficina": get_coordinadoras_oficina(data.get("period")),
        "zonasConfig": get_zonas_config(),
        "objetivos": get_objetivos_config(),
    }


@endpoint(perms=["can_view_subs_business_units"])
def business_units(request):
    """Reporte por coordinador; quien no ve todas las unidades recibe solo las suyas."""
    period = visible_period(request, request.GET.get("period"), get_periodos)
    data = _visible_selector(request, get_business_units_data(period, _day(request)))
    day_metrics = get_day_metrics((data.get("period") or "")[:7])
    zones = get_zonas_config()
    scope = unit_scope(request.user)
    if scope is not None:
        data, day_metrics, zones = restringir_unidades(data, day_metrics, zones, scope.names(), scope.rf)
    return {"buData": data, "dayMetrics": day_metrics, "zonasConfig": zones, "objetivos": get_objetivos_config()}


@endpoint(perms=["can_view_subs_results", "can_view_subs_sales", "can_view_subs_business_units"])
def churn_detail(request):
    """Las bajas de un periodo con la ficha de cada cliente, para exportar.

    `?nodo=` repetido acota a esos nodos `"Zona - Sucursal"`. Siempre es el
    detalle del cierre: los cortes diarios guardan agregados, no órdenes.
    """
    nodes = limpiar_nodos(request.GET.getlist("nodo"))
    period = visible_period(request, request.GET.get("period"), get_periodos)
    return get_bajas_detalle(period, nodes)
