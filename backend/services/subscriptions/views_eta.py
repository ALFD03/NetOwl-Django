"""`/api/subscriptions/eta-report/`: el reporte ETA para la reguladora.

ETA solo parametriza las excepciones por orden; la clasificación de los planes
se edita en Catálogos.
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from core.database import DBConnector
from core.utils import is_period
from services.config.api import ApiError, endpoint
from services.config.auth import has_permission
from services.subscriptions.analytics import ETAReportManager, get_periods
from services.subscriptions.analytics.bcv import RateUnavailable, fetch_current_rate
from services.subscriptions.api_keys import ETA_KEYS

INVALID_PERIOD = "Periodo inválido (se espera YYYY-MM)."


class PeriodBody(BaseModel):
    period: str

    @field_validator("period")
    @classmethod
    def _valid(cls, value: str) -> str:
        if not is_period(value):
            raise ValueError(INVALID_PERIOD)
        return value


class LockBody(PeriodBody):
    lock: bool = False


class RateBody(PeriodBody):
    rate: float = Field(ge=0)


class OrderBody(BaseModel):
    order: str = Field(min_length=1)


class OrderConfigBody(OrderBody):
    client: str = ""
    product: str = ""
    report: bool = True
    technology: str | None = None
    person_type: str | None = None
    has_tv: bool = False
    data_mbps: float = 0
    is_transport: bool = False
    is_dedicated: bool = False
    # La renta del contrato: cada enlace dedicado negocia la suya.
    price: float = 0


def _manager() -> ETAReportManager:
    return ETAReportManager(DBConnector())


def _months() -> list[str]:
    return sorted({p[:7] for p in get_periods()}, reverse=True)


@endpoint(perms=["can_view_eta"], keys=ETA_KEYS)
def eta_report(request):
    """El reporte de un periodo (`?period=YYYY-MM`, por defecto el último)."""
    months = _months()
    period = request.GET.get("period")
    if not (period and is_period(period)):
        period = months[0] if months else "2024-01"
    data = _manager().calculate_eta_report(period)
    data["periods"] = months
    data["periodo"] = period
    return {"etaData": data}


@endpoint(perms=["can_manage_eta"], keys=ETA_KEYS)
def eta_config(request):
    """La parametrización: excepciones individuales y pendientes."""
    return _manager().get_config_page_data(request.GET.get("period"))


@endpoint(perms=["can_view_eta"], rate="30/m", keys=ETA_KEYS)
def eta_data(request):
    """Recarga del reporte. `?force=true` recalcula todo y exige `can_manage_eta`."""
    period = request.GET.get("period")
    if period and not is_period(period):
        raise ApiError(INVALID_PERIOD)
    force = request.GET.get("force", "false").lower() == "true"
    if force and not has_permission(request.user, "can_manage_eta"):
        raise ApiError("Recalcular el reporte requiere el privilegio: can_manage_eta.", 403)
    months = _months()
    period = period or (months[0] if months else None)
    if not period:
        return {"status": "empty", "message": "No hay periodos calculados."}
    manager = _manager()
    data = manager.calculate_eta_report(period, force_recalc=force)
    data["periods"] = months
    data["individual_configs"] = manager.get_configured_individual_subs()
    return data


@endpoint(methods=["POST"], perms=["can_manage_eta"], rate="5/m", body=LockBody, keys=ETA_KEYS)
def eta_lock(request, body: LockBody):
    """Bloquea o desbloquea un periodo; al bloquear se recalcula una última vez."""
    manager = _manager()
    manager.set_lock_status(body.period, body.lock)
    if body.lock:
        manager.calculate_eta_report(body.period, force_recalc=True)
    return {"status": "success", "esta_bloqueado": body.lock, "message": f"Periodo {body.period} actualizado."}


@endpoint(methods=["POST"], perms=["can_manage_eta"], rate="30/m", body=OrderConfigBody, keys=ETA_KEYS)
def eta_order_save(request, body: OrderConfigBody):
    """Guarda la excepción individual de una orden."""
    _manager().save_sub_individual_config(body.order, ETA_KEYS.back(body.model_dump(exclude={"order"})))
    return {"status": "success", "message": f"Suscripción {body.order} guardada."}


@endpoint(methods=["POST"], perms=["can_manage_eta"], rate="30/m", body=OrderBody, keys=ETA_KEYS)
def eta_order_delete(request, body: OrderBody):
    """Borra la excepción de una orden: vuelve a clasificarse por su plan."""
    _manager().delete_sub_individual_config(body.order)
    return {"status": "success", "message": f"Suscripción '{body.order}' eliminada."}


@endpoint(methods=["POST"], perms=["can_manage_eta"], rate="30/m", body=RateBody, keys=ETA_KEYS)
def eta_rate(request, body: RateBody):
    """Fija a mano la tasa del BCV del periodo (0 = sin fijar). No recalcula el reporte."""
    source = "Escrita a mano"
    _manager().set_bcv_rate(body.period, body.rate, source)
    return {"status": "success", "tasa_bcv": body.rate, "tasa_bcv_fuente": source}


@endpoint(methods=["POST"], perms=["can_manage_eta"], rate="10/m", body=PeriodBody, keys=ETA_KEYS)
def eta_rate_fetch(request, body: PeriodBody):
    """Vuelve a pedirle al BCV la tasa del periodo y la guarda. 502 si el BCV falla."""
    try:
        rate, source = _manager().fetch_bcv_rate(body.period)
    except RateUnavailable as exc:
        raise ApiError(str(exc), 502) from exc
    return {"status": "success", "tasa_bcv": rate, "tasa_bcv_fuente": source}


@endpoint(perms=["can_view_eta"], rate="10/m", keys=ETA_KEYS)
def eta_rate_current(request):
    """La última tasa publicada por el BCV, sin guardarla: sirve para exportar a precio de hoy."""
    try:
        rate, source = fetch_current_rate()
    except RateUnavailable as exc:
        raise ApiError(str(exc), 502) from exc
    return {"status": "success", "tasa_bcv": rate, "tasa_bcv_fuente": source}
