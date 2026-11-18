"""`/api/support/`: datos de las páginas de soporte."""

from __future__ import annotations

from core.utils import clean_periods, request_int
from services.config.api import ApiError, endpoint
from services.config.auth import has_permission
from services.config.periods import (
    clamp_requested,
    month_denied,
    period_denied,
    sees_all_periods,
    visible_period,
    visible_periods,
)
from services.support.analytics.day_metrics import get_support_day_payload, get_support_day_series
from services.support.analytics.flow import get_open_tickets
from services.support.analytics.queries import (
    get_support_analytics_structured,
    get_support_breakdown,
    get_support_close_history,
    get_support_metric_totals,
    get_support_periods,
)
from services.support.api_keys import SUPPORT_KEYS

PERIOD_DENIED = "Acceso denegado. Solo puedes ver el último periodo evaluado."


def _metric_totals(request) -> dict:
    """El global, o solo el último periodo si la cuenta no ve todos."""
    if sees_all_periods(request):
        return get_support_metric_totals()
    period = visible_period(request, None, get_support_periods)
    if not period:
        return {"periodos_evaluados": 0, "resumen_global": {}, "por_grupo_trabajo": {}, "historico_tendencias": []}
    return get_support_metric_totals(solo=period)


@endpoint(perms=["can_view_support", "can_view_support_dashboard"], require_all=True, keys=SUPPORT_KEYS)
def dashboard(request):
    """El promedio de los periodos evaluados y, con su permiso, los tickets abiertos hoy."""
    open_tickets = get_open_tickets() if has_permission(request.user, "can_view_support_abiertos") else None
    return {"metrics": _metric_totals(request), "abiertos": open_tickets}


@endpoint(perms=["can_view_support_analytics"], keys=SUPPORT_KEYS)
def analytics(request):
    """El bloque de un periodo al corte `?day=` (o al último) y la serie ligera del mes."""
    periods = visible_periods(request, get_support_periods())
    data = get_support_analytics_structured(visible_period(request, request.GET.get("period"), lambda: periods))
    period = data.get("periodo", "")

    day = request_int(request, "day", minimo=1, maximo=31)
    series = get_support_day_series(period) if period else {}
    available = series.get("dias_disponibles", [])
    active_day = day if day in available else (available[-1] if available else 0)
    cut = get_support_day_payload(period, active_day) if active_day else None
    if cut:
        data = {**data, **cut}

    return {
        "analyticsData": data,
        "dayMetrics": {
            "periodo_mes": series.get("periodo_mes", period),
            "dias_disponibles": available,
            "dia": active_day,
            "serie": series.get("serie", {}),
            "serie_grupos": series.get("serie_grupos", {}),
        },
        "periods": periods,
        "selectedPeriod": period,
    }


@endpoint(perms=["can_view_support_results"], keys=SUPPORT_KEYS)
def results(request):
    """Los cierres por periodo y el detalle estructurado de un mes (`?period=`)."""
    periods = clamp_requested(request, clean_periods(request.GET.get("periods")), get_support_periods)
    visible = visible_periods(request, get_support_periods())
    detail = (
        get_support_analytics_structured(visible_period(request, request.GET.get("period"), lambda: visible))
        if visible else {"periodo": "", "grupos": {}, "incidencia_zonas": {}}
    )
    return {
        "historico": get_support_close_history(periods) if periods != [] else [],
        "analyticsData": detail,
        "periods": visible,
        "selectedPeriod": detail.get("periodo", ""),
    }


@endpoint(perms=["can_view_support_analytics", "can_view_support_results"], keys=SUPPORT_KEYS)
def breakdown(request):
    """El drill-down de un valor dimensional: sus tipos, razones y soluciones."""
    period = request.GET.get("period")
    dimension = request.GET.get("dimension")
    value = request.GET.get("value")
    if not (period and dimension and value):
        raise ApiError("Se requieren period, dimension y value.")
    if period_denied(request, period, get_support_periods):
        raise ApiError(PERIOD_DENIED, 403)
    return get_support_breakdown(
        periodo=period, dimension=dimension, valor=value, grupo=request.GET.get("group") or None,
    )


@endpoint(perms=["can_view_support_analytics"], keys=SUPPORT_KEYS)
def day_metrics(request):
    """El corte completo de un día: `{global, groups, zone_incidence}`."""
    period = request.GET.get("period")
    day = request_int(request, "day", minimo=1, maximo=31)
    if not period or not day:
        raise ApiError("Se requieren period y day.")
    if month_denied(request, period, get_support_periods):
        raise ApiError(PERIOD_DENIED, 403)
    cut = get_support_day_payload(period, day)
    if cut is None:
        return {"status": "empty", "dia": day}, 404
    return {"dia": day, **cut}
