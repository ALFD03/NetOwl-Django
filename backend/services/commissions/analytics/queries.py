"""Lo que leen las vistas de comisiones."""

from __future__ import annotations

from datetime import date
from typing import Any

from services.commissions.models import CommissionPeriod

from .calculation import build_report, cutoff_of, day_of_month, end_of, next_month, previous_month


def periods(cutoff_day: int) -> list[dict[str, Any]]:
    """Los periodos creados, del mas reciente al mas antiguo."""
    return [
        {
            "periodo": p.period,
            "estado": p.status,
            "inicio": p.start.isoformat(),
            "fin": end_of(p).isoformat(),
            "inicio_promo": p.promo_start.isoformat(),
            "corte_adelantos": cutoff_of(p, cutoff_day).isoformat(),
        }
        for p in CommissionPeriod.objects.all()
    ]


def period_report(period: CommissionPeriod) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """`(informe, ventas)`: congelado si el periodo esta cerrado, recalculado si no."""
    if period.is_closed and period.summary:
        return period.summary, [v.data for v in period.sales.all()]
    return build_report(period)


def proposal(period: str, promo_day: int, cutoff_day: int) -> dict[str, Any]:
    """Lo que el formulario de un periodo nuevo (o editado) propone.

    El inicio sale de los dias promocionales del mes anterior si ese periodo
    existe —y entonces no se pregunta—; si no, se pregunta, con el dia
    habitual de ese mes como sugerencia. El inicio de los dias promocionales
    del propio mes y el corte de los adelantos se proponen con el dia habitual.
    """
    existing = CommissionPeriod.objects.filter(period=period).first()
    previous = CommissionPeriod.objects.filter(period=previous_month(period)).first()
    promo_start = existing.promo_start if existing else day_of_month(period, promo_day)
    cutoff = cutoff_of(existing, cutoff_day) if existing else day_of_month(next_month(period), cutoff_day)
    if previous:
        start, ask = previous.promo_start, False
    elif existing:
        start, ask = existing.start, True
    else:
        start, ask = day_of_month(previous_month(period), promo_day), True
    return {
        "periodo": period,
        "inicio": start.isoformat(),
        "preguntar_inicio": ask,
        "inicio_promo": promo_start.isoformat(),
        "corte_adelantos": cutoff.isoformat(),
    }


def default_period(wait_days: int) -> str:
    """El mes que toca calcular hoy: el ultimo cuyo plazo de espera ya paso."""
    today = date.today()
    month = f"{today.year}-{today.month:02d}"
    from .calculation import calculation_date

    while calculation_date(month, wait_days) > today:
        month = previous_month(month)
    return month
