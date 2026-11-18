"""`/api/commissions/`: el informe de comisiones y la ventana de pago.

Ver el informe es `can_view_commissions`; crear el periodo, decidir revisiones,
agregar ventas, escribir cumplimientos y cerrar, `can_manage_commissions`.
Reabrir y borrar tienen permiso propio. El informe de un borrador se calcula en
la petición: es un mes de instalaciones.
"""

from __future__ import annotations

import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from functools import wraps
from typing import Any

from django.db import transaction
from django.utils import timezone

from services.catalogs.models import SalesPerson, SalesTeam
from services.catalogs.teams import ROLES, ROLES_BY_TEAM
from services.commissions.analytics.calculation import (
    MissingCommissionColumns,
    current_conditions,
    next_month,
    previous_month,
    read_orders,
)
from services.commissions.analytics.closing import CannotClose, close_period, reopen_period
from services.commissions.analytics.queries import default_period, period_report, periods, proposal
from services.commissions.analytics.rules import ALREADY_PAID, COUNT, DONT_COUNT, NORMAL, VALID
from services.commissions.api_keys import COMMISSION_KEYS
from services.commissions.models import (
    ArchivedClose,
    CommissionConditions,
    CommissionIndicator,
    CommissionPeriod,
    CommissionReview,
    CommissionSale,
    ManualSale,
)
from services.config.api import ApiError, endpoint, json_body
from services.config.auth import has_permission
from services.subscriptions.analytics.bcv import RateUnavailable, fetch_current_rate
from services.subscriptions.models import Plan

logger = logging.getLogger(__name__)

VIEW = ["can_view_commissions"]
MANAGE = ["can_manage_commissions"]
REOPEN = ["can_reopen_commissions"]
DELETE = ["can_delete_commissions"]

_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _month(value: Any, field: str = "period") -> str:
    text = str(value or "").strip()
    if not _MONTH.match(text):
        raise ApiError(f"«{field}» tiene que ser un mes YYYY-MM.")
    return text


def _date(value: Any, field: str) -> date:
    try:
        return date.fromisoformat(str(value or "").strip())
    except ValueError:
        raise ApiError(f"«{field}» tiene que ser una fecha YYYY-MM-DD.") from None


def _decimal(value: Any, field: str, *, nullable: bool = True) -> Decimal | None:
    if value in (None, ""):
        if nullable:
            return None
        raise ApiError(f"«{field}» es obligatorio.")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ApiError(f"«{field}» tiene que ser un número.") from None


def _conflict(message: str) -> ApiError:
    return ApiError(message, 409)


def _conflicts(view):
    """Las reglas del cierre que no se cumplen (`CannotClose`, `MissingCommissionColumns`) responden 409."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except (CannotClose, MissingCommissionColumns) as exc:
            raise _conflict(str(exc)) from exc
    return wrapped


def _open_period(key: str) -> CommissionPeriod:
    """El periodo indicado, que tiene que existir y estar en borrador."""
    period = CommissionPeriod.objects.filter(period=key).first()
    if period is None:
        raise ApiError(f"El periodo {key} no existe.")
    if period.is_closed:
        raise _conflict(f"El periodo {key} está cerrado: reábrelo para cambiarlo.")
    return period


def _orders(data: dict, limit: int) -> list[str]:
    """`ordenes` (lista) u `orden` (una), sin vacíos ni repetidas."""
    raw = data.get("ordenes") if isinstance(data.get("ordenes"), list) else [data.get("orden")]
    orders = sorted({str(o or "").strip()[:80] for o in raw} - {""})
    if not orders:
        raise ApiError("Falta la orden.")
    if len(orders) > limit:
        raise ApiError("Demasiadas órdenes de una vez.")
    return orders


def _archive(a: ArchivedClose) -> dict[str, Any]:
    """Un cierre archivado para la lista, sin la copia."""
    return {
        "id": a.id,
        "version": a.version,
        "cerrado_por": a.closed_by,
        "cerrado_en": timezone.localtime(a.closed_at).strftime("%Y-%m-%d %H:%M") if a.closed_at else None,
        "reabierto_por": a.reopened_by_name,
        "reabierto_en": timezone.localtime(a.reopened_at).strftime("%Y-%m-%d %H:%M"),
        "motivo": a.reason,
        "total_neto": float(a.net_total),
        "pagos": a.payments,
        "ventas": a.sales,
    }


# --- El informe ---

@endpoint(perms=VIEW, nullable=True, keys=COMMISSION_KEYS)
def report(request):
    """El informe de un periodo (`?period=YYYY-MM`); sin él, el más reciente o el que toca crear.

    El detalle venta a venta se pide aparte a `sales/`.
    """
    conditions = CommissionConditions.current()
    existing = periods(conditions.cutoff_day)
    requested = request.GET.get("period") or ""
    key = requested if _MONTH.match(requested) else (
        existing[0]["periodo"] if existing else default_period(conditions.wait_days)
    )
    period = CommissionPeriod.objects.filter(period=key).first()
    data, error = None, None
    if period is not None:
        try:
            data, _ = period_report(period)
        except MissingCommissionColumns as exc:
            error = str(exc)
        except Exception:
            logger.exception("No se pudo calcular el informe de comisiones de %s", key)
            error = "No se pudo calcular el informe. Consulte el registro de la aplicación."

    return {
        "periodo": key,
        "periodos": existing,
        "informe": data,
        "error": error,
        "propuesta": proposal(key, conditions.promo_day, conditions.cutoff_day),
        # Las del cierre si está cerrado; si no, las vigentes.
        "condiciones": (
            period.conditions if period is not None and period.is_closed and period.conditions
            else current_conditions()
        ),
        "equipos": [
            {
                "slug": e.slug,
                "nombre": e.name,
                "roles": [{"rol": r, "etiqueta": ROLES[r]["label"]} for r in ROLES_BY_TEAM.get(e.slug, [])],
            }
            for e in SalesTeam.objects.all()
        ],
        "puedeGestionar": has_permission(request.user, MANAGE[0]),
        "puedeReabrir": has_permission(request.user, REOPEN[0]),
        "puedeBorrar": has_permission(request.user, DELETE[0]),
        "archivos": [_archive(a) for a in period.archives.all()] if period is not None else [],
    }


@endpoint(perms=VIEW, nullable=True, keys=COMMISSION_KEYS)
def sales(request):
    """El detalle venta a venta de un periodo, para el desglose y la exportación."""
    key = request.GET.get("period") or ""
    if not _MONTH.match(key):
        raise ApiError("Periodo invalido.")
    period = CommissionPeriod.objects.filter(period=key).first()
    if period is None:
        raise ApiError("El periodo no existe.", 404)
    try:
        _, rows = period_report(period)
    except MissingCommissionColumns as exc:
        raise _conflict(str(exc)) from exc
    return {"status": "success", "ventas": rows}


@endpoint(methods=["POST"], perms=MANAGE, rate="30/m", keys=COMMISSION_KEYS)
@_conflicts
def period_save(request):
    """Crea un periodo en borrador o cambia sus días promocionales.

    `start` solo se acepta si el mes anterior no tiene periodo; mover el
    `promo_start` mueve el inicio del siguiente, que no puede estar cerrado.
    """
    data = COMMISSION_KEYS.back(json_body(request))
    key = _month(data.get("periodo"))
    promo_start = _date(data.get("inicio_promo"), "promo_start")
    if promo_start.strftime("%Y-%m") != key:
        raise ApiError("Los días promocionales del periodo tienen que empezar dentro de su mes.")
    cutoff = _date(data["corte_adelantos"], "advance_cutoff") if data.get("corte_adelantos") else None
    if cutoff and cutoff.strftime("%Y-%m") != next_month(key):
        raise ApiError("El corte de los pagos adelantados tiene que caer en el mes siguiente: es cuando se saca el informe.")

    previous = CommissionPeriod.objects.filter(period=previous_month(key)).first()
    if previous:
        start = previous.promo_start
    else:
        start = _date(data.get("inicio"), "start")
        if start.strftime("%Y-%m") != previous_month(key):
            raise ApiError("El inicio tiene que caer en el mes anterior: es donde empezaron sus días promocionales.")
    if promo_start <= start:
        raise ApiError("El periodo tiene que terminar después de empezar.")

    following = CommissionPeriod.objects.filter(period=next_month(key)).first()
    existing = CommissionPeriod.objects.filter(period=key).first()
    if existing and existing.is_closed:
        raise _conflict(f"El periodo {key} está cerrado: reábrelo para cambiarlo.")
    if following and following.is_closed and (not existing or existing.promo_start != promo_start):
        raise _conflict(f"El periodo {following.period} está cerrado y empieza donde termina este.")

    with transaction.atomic():
        period = existing or CommissionPeriod(period=key, created_by=request.user)
        period.start = start
        period.promo_start = promo_start
        if "corte_adelantos" in data:
            period.advance_cutoff = cutoff
        period.save()
        if following and not following.is_closed:
            following.start = promo_start
            following.save(update_fields=["start"])
    return {"status": "success", "message": f"Periodo {key} guardado."}


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", keys=COMMISSION_KEYS)
@_conflicts
def review_save(request):
    """Decide ventas por facturar; `decision` vacía deshace y `orders` decide varias.

    `contar` o `no_contar`; en el primer periodo también `ya_pagada` o `normal`.
    """
    data = COMMISSION_KEYS.back(json_body(request))
    period = _open_period(_month(data.get("periodo")))
    orders = _orders(data, 5000)
    decision = str(data.get("decision") or "").strip()

    if not decision:
        CommissionReview.objects.filter(order__in=orders, source_period=period.period).delete()
        return {"status": "success", "message": "Decisión deshecha."}
    if decision not in (COUNT, DONT_COUNT, ALREADY_PAID, NORMAL):
        raise ApiError("La decisión es «contar», «no contar», «ya cobrada» o «toca aquí».")
    if decision in (ALREADY_PAID, NORMAL) and CommissionPeriod.objects.filter(period=previous_month(period.period)).exists():
        raise ApiError("El periodo anterior existe: lo que ya se cobró en él lo dice su cierre.")

    note = str(data.get("nota") or "").strip()[:255]
    with transaction.atomic():
        for order in orders:
            CommissionReview.objects.update_or_create(
                order=order, source_period=period.period,
                defaults={"decision": decision, "note": note, "decided_by": request.user},
            )
    return {
        "status": "success",
        "message": "Decisión guardada." if len(orders) == 1 else f"Decisión guardada en {len(orders)} ventas.",
    }


@endpoint(methods=["POST"], perms=MANAGE, rate="30/m", keys=COMMISSION_KEYS)
@_conflicts
def manual_add(request):
    """Agrega ventas a mano (`orders`, `note` obligatoria). Todo o nada."""
    data = COMMISSION_KEYS.back(json_body(request))
    period = _open_period(_month(data.get("periodo")))
    orders = _orders(data, 200)
    note = str(data.get("nota") or "").strip()[:255]
    if not note:
        raise ApiError("Escribe por qué se agrega: queda con la venta.")

    found = read_orders(orders)
    known = set(found["orden_producto"].astype(str)) if not found.empty else set()
    missing = [o for o in orders if o not in known]
    if missing:
        raise ApiError("No están en suscripciones: " + ", ".join(missing) + ".")
    paid = dict(
        CommissionSale.objects.filter(order__in=orders, classification=VALID, period__status="cerrado")
        .exclude(period=period).values_list("order", "period__period")
    )
    if paid:
        raise ApiError("Ya se pagaron: " + ", ".join(f"{o} en {p}" for o, p in sorted(paid.items())) + ".")
    repeated = set(ManualSale.objects.filter(period=period.period, order__in=orders).values_list("order", flat=True))
    if repeated:
        raise ApiError("Ya estaban agregadas: " + ", ".join(sorted(repeated)) + ".")

    ManualSale.objects.bulk_create(
        ManualSale(order=o, period=period.period, note=note, added_by=request.user) for o in orders
    )
    n = len(orders)
    return {"status": "success", "message": f"{n} venta{'s' if n != 1 else ''} agregada{'s' if n != 1 else ''}."}


@endpoint(methods=["POST"], perms=MANAGE, rate="30/m", keys=COMMISSION_KEYS)
@_conflicts
def manual_remove(request):
    """Quita una venta agregada a mano."""
    data = COMMISSION_KEYS.back(json_body(request))
    period = _open_period(_month(data.get("periodo")))
    order = str(data.get("orden") or "").strip()
    deleted, _ = ManualSale.objects.filter(period=period.period, order=order).delete()
    if not deleted:
        raise ApiError(f"La orden {order} no estaba agregada a mano.")
    return {"status": "success", "message": f"{order} quitada."}


@endpoint(methods=["POST"], perms=MANAGE, rate="60/m", keys=COMMISSION_KEYS)
@_conflicts
def indicator_save(request):
    """El % de cumplimiento o de crecimiento a mano de una persona; vacío vuelve al calculado."""
    data = COMMISSION_KEYS.back(json_body(request))
    period = _open_period(_month(data.get("periodo")))
    person = SalesPerson.objects.filter(pk=data.get("persona_id")).first()
    if person is None:
        raise ApiError("La persona no existe.")

    pieces = [
        current_conditions()["equipos"].get(m.team.slug, {}).get(m.role, {})
        for m in person.memberships.select_related("team")
    ]
    row, _ = CommissionIndicator.objects.get_or_create(period=period.period, person=person)
    if "cumplimiento_pct" in data:
        if not any(p.get("factor") not in (None, "ninguno") for p in pieces):
            raise ApiError("Su rol no cobra con un % de cumplimiento.")
        value = _decimal(data.get("cumplimiento_pct"), "compliance_pct")
        if value is not None and value < 0:
            raise ApiError("El cumplimiento no puede ser negativo.")
        row.compliance_pct = value
    if "crecimiento_pct" in data:
        if not any("escalon_crecimiento" in p for p in pieces):
            raise ApiError("Su rol no cobra por el crecimiento de su unidad.")
        row.growth_pct = _decimal(data.get("crecimiento_pct"), "growth_pct")
    row.updated_by = request.user

    if row.compliance_pct is None and row.growth_pct is None:
        row.delete()
    else:
        row.save()
    return {"status": "success", "message": "Guardado."}


@endpoint(perms=VIEW, rate="30/m", keys=COMMISSION_KEYS)
def current_rate(request):
    """La tasa oficial del BCV de hoy, como referencia (no se guarda). 502 si falla."""
    try:
        rate, source = fetch_current_rate()
    except RateUnavailable as exc:
        raise ApiError(str(exc), 502) from exc
    return {"status": "success", "tasa": rate, "fuente": source}


@endpoint(methods=["POST"], perms=MANAGE, rate="10/m", keys=COMMISSION_KEYS)
@_conflicts
def period_close(request):
    """Cierra el periodo: congela ventas, pagos y condiciones. 409 si queda algo pendiente."""
    period = _open_period(_month(COMMISSION_KEYS.back(json_body(request)).get("periodo")))
    close_period(period, request.user)
    return {"status": "success", "message": f"Periodo {period.period} cerrado."}


@endpoint(methods=["POST"], perms=REOPEN, rate="10/m", keys=COMMISSION_KEYS)
@_conflicts
def period_reopen(request):
    """Devuelve un periodo cerrado a borrador archivando su cierre. Exige `reason` y `confirmation`."""
    data = COMMISSION_KEYS.back(json_body(request))
    key = _month(data.get("periodo"))
    if str(data.get("confirmacion") or "").strip() != key:
        raise ApiError(f"Para reabrir, escribe el periodo exacto ({key}) en la confirmación.")
    period = CommissionPeriod.objects.filter(period=key).first()
    if period is None:
        raise ApiError(f"El periodo {key} no existe.")
    if not period.is_closed:
        return {"status": "success", "message": "El periodo ya estaba en borrador."}
    archive = reopen_period(period, request.user, str(data.get("motivo") or ""))
    return {
        "status": "success",
        "message": f"Periodo {key} reabierto. El cierre anterior quedó archivado como versión {archive.version}.",
        "archivo": _archive(archive),
    }


@endpoint(methods=["POST"], perms=DELETE, rate="10/m", keys=COMMISSION_KEYS)
@_conflicts
def period_delete(request):
    """Borra un informe en borrador con lo decidido en él. 409 si está o estuvo cerrado."""
    data = COMMISSION_KEYS.back(json_body(request))
    key = _month(data.get("periodo"))
    if str(data.get("confirmacion") or "").strip() != key:
        raise ApiError(f"Para borrar, escribe el periodo exacto ({key}) en la confirmación.")
    period = CommissionPeriod.objects.filter(period=key).first()
    if period is None:
        raise ApiError(f"El periodo {key} no existe.")
    if period.is_closed:
        raise _conflict(f"El periodo {key} está cerrado: es una nómina pagada. Reábrelo antes de borrarlo.")
    archived = period.archives.count()
    if archived:
        raise _conflict(
            f"El periodo {key} se cerró {archived} vez/veces: sus cierres archivados son el historial de lo"
            " que se pagó y no se borran."
        )
    with transaction.atomic():
        deleted = {
            "revisiones": CommissionReview.objects.filter(source_period=key).delete()[0],
            "manuales": ManualSale.objects.filter(period=key).delete()[0],
            "indicadores": CommissionIndicator.objects.filter(period=key).delete()[0],
        }
        period.delete()
    return {
        "status": "success",
        "message": (
            f"Informe {key} borrado, con {deleted['revisiones']} revisión(es), "
            f"{deleted['manuales']} venta(s) a mano y {deleted['indicadores']} indicador(es)."
        ),
        "borrado": deleted,
    }


@endpoint(perms=VIEW, nullable=True, keys=COMMISSION_KEYS)
def archive_detail(request, archive_id: int):
    """La copia completa de un cierre archivado, para descargarla."""
    archive = ArchivedClose.objects.select_related("period").get(pk=archive_id)
    return {**_archive(archive), "periodo": archive.period.period, "copia": archive.snapshot}


# --- La ventana de pago ---

def _pyme_plans() -> list[dict[str, Any]]:
    return [
        {
            "id": p.id,
            "nombre": p.name,
            "tarifa": p.tariff,
            "precio": float(p.price),
            "comision_pyme_pct": float(p.sme_commission_pct) if p.sme_commission_pct is not None else None,
        }
        for p in Plan.objects.filter(person_type="PYME")
    ]


@endpoint(perms=MANAGE, nullable=True, keys=COMMISSION_KEYS)
def conditions(request):
    """La ventana de pago y los % PYME de cada plan."""
    c = CommissionConditions.current()
    by = c.updated_by
    return {
        "condiciones": {"dia_promocional": c.promo_day, "dias_espera": c.wait_days, "dia_corte": c.cutoff_day},
        "actualizacion": {
            "en": c.updated_at.isoformat() if c.updated_at else None,
            "por": (by.get_full_name() or by.get_username()) if by else None,
        },
        "planesPyme": _pyme_plans(),
        "puedeEditarPlanes": has_permission(request.user, "can_manage_operational_catalog"),
    }


@endpoint(methods=["POST"], perms=MANAGE, rate="30/m", keys=COMMISSION_KEYS)
@_conflicts
def conditions_save(request):
    """Guarda la ventana de pago. Solo afecta a lo que se calcule después."""
    data = COMMISSION_KEYS.back(json_body(request))
    day = _decimal(data.get("dia_promocional"), "promo_day", nullable=False)
    wait = _decimal(data.get("dias_espera"), "wait_days", nullable=False)
    cutoff = _decimal(data.get("dia_corte"), "cutoff_day", nullable=False)
    if not 1 <= day <= 31 or day != int(day):
        raise ApiError("El día promocional es un día del mes, de 1 a 31.")
    if not 1 <= cutoff <= 31 or cutoff != int(cutoff):
        raise ApiError("El día de corte de los adelantos es un día del mes, de 1 a 31.")
    if not 0 <= wait <= 60 or wait != int(wait):
        raise ApiError("Los días de espera van de 0 a 60.")
    c = CommissionConditions.current()
    c.promo_day, c.wait_days, c.cutoff_day = int(day), int(wait), int(cutoff)
    c.updated_by = request.user
    c.save()
    return {"status": "success", "message": "Condiciones guardadas."}
