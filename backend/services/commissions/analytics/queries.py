"""Lo que leen las vistas de comisiones."""

from __future__ import annotations

from datetime import date
from typing import Any

from services.commissions.models import ComisionPeriodo

from .calculation import build_report, cutoff_of, day_of_month, end_of, next_month, previous_month


def periodos(dia_corte: int) -> list[dict[str, Any]]:
    """Los periodos creados, del mas reciente al mas antiguo."""
    return [
        {
            "periodo": p.periodo,
            "estado": p.estado,
            "inicio": p.inicio.isoformat(),
            "fin": end_of(p).isoformat(),
            "inicio_promo": p.inicio_promo.isoformat(),
            "corte_adelantos": cutoff_of(p, dia_corte).isoformat(),
        }
        for p in ComisionPeriodo.objects.all()
    ]


def informe(periodo: ComisionPeriodo) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """`(informe, ventas)`: congelado si el periodo esta cerrado, recalculado si no."""
    if periodo.cerrado and periodo.resumen:
        return periodo.resumen, [v.datos for v in periodo.ventas.all()]
    return build_report(periodo)


def propuesta(periodo: str, dia_promocional: int, dia_corte: int) -> dict[str, Any]:
    """Lo que el formulario de un periodo nuevo (o editado) propone.

    El inicio sale de los dias promocionales del mes anterior si ese periodo
    existe —y entonces no se pregunta—; si no, se pregunta, con el dia
    habitual de ese mes como sugerencia. El inicio de los dias promocionales
    del propio mes y el corte de los adelantos se proponen con el dia habitual.
    """
    existente = ComisionPeriodo.objects.filter(periodo=periodo).first()
    anterior = ComisionPeriodo.objects.filter(periodo=previous_month(periodo)).first()
    inicio_promo = existente.inicio_promo if existente else day_of_month(periodo, dia_promocional)
    corte = cutoff_of(existente, dia_corte) if existente else day_of_month(next_month(periodo), dia_corte)
    if anterior:
        inicio, preguntar = anterior.inicio_promo, False
    elif existente:
        inicio, preguntar = existente.inicio, True
    else:
        inicio, preguntar = day_of_month(previous_month(periodo), dia_promocional), True
    return {
        "periodo": periodo,
        "inicio": inicio.isoformat(),
        "preguntar_inicio": preguntar,
        "inicio_promo": inicio_promo.isoformat(),
        "corte_adelantos": corte.isoformat(),
    }


def default_period(dias_espera: int) -> str:
    """El mes que toca calcular hoy: el ultimo cuyo plazo de espera ya paso."""
    hoy = date.today()
    mes = f"{hoy.year}-{hoy.month:02d}"
    from .calculation import calculation_date

    while calculation_date(mes, dias_espera) > hoy:
        mes = previous_month(mes)
    return mes
