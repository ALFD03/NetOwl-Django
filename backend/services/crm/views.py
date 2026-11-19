"""`/api/crm/`: datos de las páginas de CRM."""

from __future__ import annotations

from core.day_metrics import previous_month
from core.utils import clean_periods, request_int
from services.config.api import ApiError, endpoint
from services.config.periods import (
    clamp_requested,
    month_denied,
    period_denied,
    sees_all_periods,
    visible_period,
    visible_periods,
)
from services.crm.analytics import (
    get_crm_close_history,
    get_crm_day_payload,
    get_crm_day_series,
    get_crm_dimensions,
    get_crm_metric_totals,
    get_crm_periods,
)
from services.crm.api_keys import CRM_KEYS

PERIOD_DENIED = "Acceso denegado. Solo puedes ver el último periodo evaluado."


def _metric_totals(request, period: str | None) -> dict:
    """El global, o solo el último periodo si la cuenta no ve todos."""
    if sees_all_periods(request):
        return get_crm_metric_totals(period)
    if not period:
        return {"resumen_global": {}, "tiempo_por_etapa": [], "efectividad": [], "historico_tendencias": []}
    return get_crm_metric_totals(only=period)


@endpoint(perms=["can_view_crm", "can_view_crm_dashboard"], require_all=True, keys=CRM_KEYS)
def dashboard(request):
    """El promedio global y su serie histórica."""
    periods = visible_periods(request, get_crm_periods())
    period = visible_period(request, request.GET.get("period"), get_crm_periods)
    return {
        "metrics": _metric_totals(request, period),
        "periods": periods,
        "selectedPeriod": period or (periods[0] if periods else ""),
    }


def _previous_series(request, month: str | None) -> dict:
    """La serie ligera del mes anterior, si la cuenta puede ver más de un periodo."""
    if not month or not sees_all_periods(request):
        return {}
    previous = previous_month(month)
    return {"previous_month": previous, "previous_series": get_crm_day_series(previous).get("serie", {})}


@endpoint(perms=["can_view_crm_analytics"], keys=CRM_KEYS)
def analytics(request):
    """Las dimensiones del periodo y su global, al corte `?day=` o al último calculado.

    Trae además la serie ligera del mes (el global de cada día): mover la barra
    de días solo pide el desglose a `day-metrics/`. Con `can_view_all_periods`,
    también la del mes anterior, que es la referencia del mismo día.
    """
    periods = visible_periods(request, get_crm_periods())
    period = visible_period(request, request.GET.get("period"), lambda: periods)
    day = request_int(request, "day", min_value=1, max_value=31)
    target = period or (periods[0] if periods else None)

    series = get_crm_day_series(target) if target else {}
    available = series.get("dias_disponibles", [])
    active_day = day if day in available else (available[-1] if available else 0)
    cut = get_crm_day_payload(target, active_day) if active_day else None

    if cut:
        dimensions, global_data = cut.get("dimensiones", []), cut.get("global", {})
    else:
        # Sin cortes diarios, el cierre del mes.
        dimensions = get_crm_dimensions(periods=[target] if target else None)
        closing = get_crm_close_history([target]) if target else []
        global_data = closing[0] if closing else {}

    return {
        "dimensionsData": dimensions,
        "globalData": global_data,
        "dayMetrics": {
            "periodo_mes": series.get("periodo_mes", target or ""),
            "dias_disponibles": available,
            "dia": active_day,
            "serie": series.get("serie", {}),
            **_previous_series(request, target),
        },
        "periods": periods,
        "selectedPeriod": target or "",
    }


@endpoint(perms=["can_view_crm_results"], keys=CRM_KEYS)
def results(request):
    """Los cierres de los periodos pedidos (`?periods=a,b`)."""
    periods = clamp_requested(request, clean_periods(request.GET.get("periods")), get_crm_periods)
    return {"historico": get_crm_close_history(periods) if periods != [] else []}


@endpoint(perms=["can_view_crm_analytics"], keys=CRM_KEYS)
def day_metrics(request):
    """El corte completo de un día: `{global, dimensions}`. Lo escribe el análisis."""
    period = request.GET.get("period")
    day = request_int(request, "day", min_value=1, max_value=31)
    if not period or not day:
        raise ApiError("Se requieren period y day.")
    if month_denied(request, period, get_crm_periods):
        raise ApiError(PERIOD_DENIED, 403)
    cut = get_crm_day_payload(period, day)
    if cut is None:
        return {"status": "empty", "dia": day}, 404
    return {"dia": day, **cut}


@endpoint(perms=["can_view_crm_analytics", "can_view_crm_results"], keys=CRM_KEYS)
def dimension_metrics(request):
    """Las métricas de una dimensión y un periodo."""
    period = request.GET.get("period")
    if period and period_denied(request, period, get_crm_periods):
        raise ApiError(PERIOD_DENIED, 403)
    periods = clamp_requested(request, [period] if period else None, get_crm_periods)
    if periods == []:
        return {"dimensiones": []}
    return {"dimensiones": get_crm_dimensions(periods=periods, dimension=request.GET.get("dimension"))}
