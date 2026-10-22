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

from services.comisiones.models import (
    ComisionCierreArchivado,
    ComisionPago,
    ComisionPeriodo,
    ComisionVenta,
)

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


# Lo minimo que tiene que explicar quien reabre: un "x" no es un motivo.
MOTIVO_MINIMO = 10


def _fecha_iso(valor):
    return valor.isoformat() if valor else None


def copia_del_cierre(periodo: ComisionPeriodo) -> dict:
    """El cierre entero en JSON: el periodo, lo congelado y cada venta y pago."""
    return {
        "periodo": {
            "periodo": periodo.periodo,
            "inicio": _fecha_iso(periodo.inicio),
            "inicio_promo": _fecha_iso(periodo.inicio_promo),
            "corte_adelantos": _fecha_iso(periodo.corte_adelantos),
            "cumplimiento_general_pct": str(periodo.cumplimiento_general_pct)
            if periodo.cumplimiento_general_pct is not None else None,
            "tasa_conatel": str(periodo.tasa_conatel) if periodo.tasa_conatel is not None else None,
            "tasa_conatel_publicada": _fecha_iso(periodo.tasa_conatel_publicada),
            "cerrado_por": periodo.cerrado_por.username if periodo.cerrado_por else None,
            "cerrado_en": _fecha_iso(periodo.cerrado_en),
        },
        "condiciones": periodo.condiciones,
        "resumen": periodo.resumen,
        "ventas": [
            {"orden": v.orden, "clasificacion": v.clasificacion, "datos": v.datos}
            for v in periodo.ventas.all().order_by("orden")
        ],
        "pagos": [
            {
                "persona_id": p.persona_id,
                "nombre": p.nombre,
                "cargo": p.cargo,
                "neto": str(p.neto),
                "datos": p.datos,
            }
            for p in periodo.pagos.all().order_by("cargo", "nombre")
        ],
    }


def reabrir_periodo(periodo: ComisionPeriodo, usuario, motivo: str) -> ComisionCierreArchivado:
    """Devuelve el periodo a borrador, archivando antes el cierre.

    No se reabre si el siguiente esta cerrado: su ventana empieza donde termina
    esta, y sus ventas ya excluyeron las que este pago. Tampoco sin un motivo de
    al menos `MOTIVO_MINIMO` caracteres. La copia y el borrado van en la misma
    transaccion: o queda archivado y reabierto, o nada.
    """
    motivo = (motivo or "").strip()
    if len(motivo) < MOTIVO_MINIMO:
        raise NoSePuedeCerrar(
            f"Escribe el motivo de la reapertura (al menos {MOTIVO_MINIMO} caracteres)."
        )
    siguiente = ComisionPeriodo.objects.filter(periodo=mes_siguiente(periodo.periodo)).first()
    if siguiente and siguiente.cerrado:
        raise NoSePuedeCerrar(f"El periodo {siguiente.periodo} está cerrado: reábrelo primero.")
    with transaction.atomic():
        # Bloquea la fila: dos reaperturas a la vez archivarian la misma version.
        periodo = ComisionPeriodo.objects.select_for_update().get(pk=periodo.pk)
        if not periodo.cerrado:
            raise NoSePuedeCerrar(f"El periodo {periodo.periodo} ya está en borrador.")
        copia = copia_del_cierre(periodo)
        ultima = periodo.archivos.order_by("-version").values_list("version", flat=True).first() or 0
        archivo = ComisionCierreArchivado.objects.create(
            periodo=periodo,
            version=ultima + 1,
            cerrado_por=copia["periodo"]["cerrado_por"] or "",
            cerrado_en=periodo.cerrado_en,
            reabierto_por=usuario,
            reabierto_por_nombre=usuario.username,
            motivo=motivo,
            total_neto=sum((Decimal(p["neto"]) for p in copia["pagos"]), Decimal("0")),
            pagos=len(copia["pagos"]),
            ventas=len(copia["ventas"]),
            copia=copia,
        )
        periodo.ventas.all().delete()
        periodo.pagos.all().delete()
        periodo.estado = "borrador"
        periodo.condiciones = None
        periodo.resumen = None
        periodo.cerrado_por = None
        periodo.cerrado_en = None
        periodo.save()
    return archivo
