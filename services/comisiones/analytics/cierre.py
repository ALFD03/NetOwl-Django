"""Cerrar y reabrir un periodo de comisiones.

Cerrar congela el informe tal y como se ve en ese momento: las ventas con su
clasificacion (`ComisionVenta`), lo que cobra cada persona (`ComisionPago`), las
condiciones usadas y el resumen. Despues de eso el periodo ya no se recalcula,
y sus ventas validas no vuelven a contar en ningun otro.

Reabrir lo devuelve a borrador y borra lo congelado: la siguiente vez que se
abra se calcula con los datos de ese momento, que pueden no ser los del cierre.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from services.comisiones.models import ComisionPago, ComisionPeriodo, ComisionVenta

from .calculo import condiciones_vigentes, construir_informe, mes_siguiente


class NoSePuedeCerrar(RuntimeError):
    """El informe todavia tiene algo por decidir (ver `pendientes_cierre`)."""


def cerrar_periodo(periodo: ComisionPeriodo, usuario) -> dict:
    """Congela el periodo. Levanta `NoSePuedeCerrar` si queda algo pendiente."""
    informe, ventas = construir_informe(periodo)
    if informe["pendientes_cierre"]:
        raise NoSePuedeCerrar("; ".join(informe["pendientes_cierre"]))

    with transaction.atomic():
        periodo.ventas.all().delete()
        periodo.pagos.all().delete()
        ComisionVenta.objects.bulk_create(
            ComisionVenta(periodo=periodo, orden=v["orden"], clasificacion=v["clasificacion"], datos=v)
            for v in ventas
        )
        ComisionPago.objects.bulk_create(
            ComisionPago(
                periodo=periodo,
                persona_id=p["persona_id"],
                nombre=p["nombre"][:170],
                cargo=p["cargo"],
                neto=Decimal(str(p["neto"])),
                datos=p,
            )
            for p in informe["pagos"]
        )
        periodo.estado = "cerrado"
        periodo.condiciones = condiciones_vigentes()
        periodo.cerrado_por = usuario
        periodo.cerrado_en = timezone.now()
        informe["estado"] = "cerrado"
        periodo.resumen = informe
        periodo.save()
    return informe


def reabrir_periodo(periodo: ComisionPeriodo) -> None:
    """Devuelve el periodo a borrador.

    No se reabre si el siguiente esta cerrado: su ventana empieza donde termina
    esta, y sus ventas ya excluyeron las que este pago.
    """
    siguiente = ComisionPeriodo.objects.filter(periodo=mes_siguiente(periodo.periodo)).first()
    if siguiente and siguiente.cerrado:
        raise NoSePuedeCerrar(f"El periodo {siguiente.periodo} está cerrado: reábrelo primero.")
    with transaction.atomic():
        periodo.ventas.all().delete()
        periodo.pagos.all().delete()
        periodo.estado = "borrador"
        periodo.condiciones = None
        periodo.resumen = None
        periodo.cerrado_por = None
        periodo.cerrado_en = None
        periodo.save()
