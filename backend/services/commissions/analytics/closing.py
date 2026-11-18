"""Cerrar y reabrir un periodo de comisiones.

Cerrar congela el informe tal y como se ve en ese momento: las ventas con su
clasificacion (`ComisionVenta`), lo que cobra cada persona (`ComisionPago`), las
condiciones usadas y el resumen. Despues de eso el periodo ya no se recalcula,
y sus ventas validas no vuelven a contar en ningun otro.

Reabrir lo devuelve a borrador y borra lo congelado: la siguiente vez que se
abra se calcula con los datos de ese momento, que pueden no ser los del cierre.
Por eso, antes de borrar, el cierre entero se copia en `ComisionCierreArchivado`
con quien reabrio y por que: una nomina ya pagada no puede desaparecer.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from services.commissions.models import (
    ArchivedClose,
    CommissionPayment,
    CommissionPeriod,
    CommissionSale,
)

from .calculation import build_report, current_conditions, next_month


class CannotClose(RuntimeError):
    """El informe todavia tiene algo por decidir (ver `pendientes_cierre`)."""


def close_period(period: CommissionPeriod, user) -> dict:
    """Congela el periodo. Levanta `CannotClose` si queda algo pendiente."""
    period_report, sales = build_report(period)
    if period_report["pendientes_cierre"]:
        raise CannotClose("; ".join(period_report["pendientes_cierre"]))

    with transaction.atomic():
        period.sales.all().delete()
        period.payments.all().delete()
        CommissionSale.objects.bulk_create(
            CommissionSale(period=period, order=v["orden"], classification=v["clasificacion"], data=v)
            for v in sales
        )
        CommissionPayment.objects.bulk_create(
            CommissionPayment(
                period=period,
                person_id=p["persona_id"],
                name=p["nombre"][:170],
                title=p["rol"],
                net=Decimal(str(p["neto"])),
                data=p,
            )
            for p in period_report["pagos"]
        )
        period.status = "cerrado"
        period.conditions = current_conditions()
        period.closed_by = user
        period.closed_at = timezone.now()
        period_report["estado"] = "cerrado"
        period.summary = period_report
        period.save()
    return period_report


# Lo minimo que tiene que explicar quien reabre: un "x" no es un motivo.
MIN_REASON = 10


def _iso_date(value):
    return value.isoformat() if value else None


def close_snapshot(period: CommissionPeriod) -> dict:
    """El cierre entero en JSON: el periodo, lo congelado y cada venta y pago."""
    return {
        "periodo": {
            "periodo": period.period,
            "inicio": _iso_date(period.start),
            "inicio_promo": _iso_date(period.promo_start),
            "corte_adelantos": _iso_date(period.advance_cutoff),
            "tasa_conatel": str(period.conatel_rate) if period.conatel_rate is not None else None,
            "tasa_conatel_publicada": _iso_date(period.conatel_rate_published),
            "cerrado_por": period.closed_by.username if period.closed_by else None,
            "cerrado_en": _iso_date(period.closed_at),
        },
        "condiciones": period.conditions,
        "resumen": period.summary,
        "ventas": [
            {"orden": v.order, "clasificacion": v.classification, "datos": v.data}
            for v in period.sales.all().order_by("order")
        ],
        "pagos": [
            {
                "persona_id": p.person_id,
                "nombre": p.name,
                "cargo": p.title,
                "neto": str(p.net),
                "datos": p.data,
            }
            for p in period.payments.all().order_by("title", "name")
        ],
    }


def reopen_period(period: CommissionPeriod, user, reason: str) -> ArchivedClose:
    """Devuelve el periodo a borrador, archivando antes el cierre.

    No se reabre si el siguiente esta cerrado: su ventana empieza donde termina
    esta, y sus ventas ya excluyeron las que este pago. Tampoco sin un motivo de
    al menos `MIN_REASON` caracteres. La copia y el borrado van en la misma
    transaccion: o queda archivado y reabierto, o nada.
    """
    reason = (reason or "").strip()
    if len(reason) < MIN_REASON:
        raise CannotClose(
            f"Escribe el motivo de la reapertura (al menos {MIN_REASON} caracteres)."
        )
    next_row = CommissionPeriod.objects.filter(period=next_month(period.period)).first()
    if next_row and next_row.is_closed:
        raise CannotClose(f"El periodo {next_row.period} está cerrado: reábrelo primero.")
    with transaction.atomic():
        # Bloquea la fila: dos reaperturas a la vez archivarian la misma version.
        period = CommissionPeriod.objects.select_for_update().get(pk=period.pk)
        if not period.is_closed:
            raise CannotClose(f"El periodo {period.period} ya está en borrador.")
        snapshot = close_snapshot(period)
        last = period.archives.order_by("-version").values_list("version", flat=True).first() or 0
        archive = ArchivedClose.objects.create(
            period=period,
            version=last + 1,
            closed_by=snapshot["periodo"]["cerrado_por"] or "",
            closed_at=period.closed_at,
            reopened_by=user,
            reopened_by_name=user.username,
            reason=reason,
            net_total=sum((Decimal(p["neto"]) for p in snapshot["pagos"]), Decimal("0")),
            payments=len(snapshot["pagos"]),
            sales=len(snapshot["ventas"]),
            snapshot=snapshot,
        )
        period.sales.all().delete()
        period.payments.all().delete()
        period.status = "borrador"
        period.conditions = None
        period.summary = None
        period.closed_by = None
        period.closed_at = None
        period.save()
    return archive
