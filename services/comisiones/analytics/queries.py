"""Lo que leen las vistas de comisiones."""

from __future__ import annotations

from datetime import date
from typing import Any

from services.comisiones.models import ComisionPeriodo

from .calculo import construir_informe, dia_del_mes, fin_de, mes_anterior


def periodos() -> list[dict[str, Any]]:
    """Los periodos creados, del mas reciente al mas antiguo."""
    return [
        {
            "periodo": p.periodo,
            "estado": p.estado,
            "inicio": p.inicio.isoformat(),
            "fin": fin_de(p).isoformat(),
            "inicio_promo": p.inicio_promo.isoformat(),
        }
        for p in ComisionPeriodo.objects.all()
    ]


def informe(periodo: ComisionPeriodo) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """`(informe, ventas)`: congelado si el periodo esta cerrado, recalculado si no."""
    if periodo.cerrado and periodo.resumen:
        return periodo.resumen, [v.datos for v in periodo.ventas.all()]
    return construir_informe(periodo)


def propuesta(periodo: str, dia_promocional: int) -> dict[str, Any]:
    """Lo que el formulario de un periodo nuevo (o editado) propone.

    El inicio sale de los dias promocionales del mes anterior si ese periodo
    existe —y entonces no se pregunta—; si no, se pregunta, con el dia
    habitual de ese mes como sugerencia. El inicio de los dias promocionales
    del propio mes se propone siempre con el dia habitual.
    """
    existente = ComisionPeriodo.objects.filter(periodo=periodo).first()
    anterior = ComisionPeriodo.objects.filter(periodo=mes_anterior(periodo)).first()
    inicio_promo = existente.inicio_promo if existente else dia_del_mes(periodo, dia_promocional)
    if anterior:
        inicio, preguntar = anterior.inicio_promo, False
    elif existente:
        inicio, preguntar = existente.inicio, True
    else:
        inicio, preguntar = dia_del_mes(mes_anterior(periodo), dia_promocional), True
    return {
        "periodo": periodo,
        "inicio": inicio.isoformat(),
        "preguntar_inicio": preguntar,
        "inicio_promo": inicio_promo.isoformat(),
    }


def periodo_por_defecto(dias_espera: int) -> str:
    """El mes que toca calcular hoy: el ultimo cuyo plazo de espera ya paso."""
    hoy = date.today()
    mes = f"{hoy.year}-{hoy.month:02d}"
    from .calculo import fecha_de_calculo

    while fecha_de_calculo(mes, dias_espera) > hoy:
        mes = mes_anterior(mes)
    return mes
