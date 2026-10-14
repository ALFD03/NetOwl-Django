"""El modulo de Comisiones: el informe y la configuracion de pago.

- `/comisiones/` — el informe de un periodo. Lo ve `can_view_comisiones`;
  crear el periodo, decidir las revisiones, escribir cumplimientos y cerrar es
  `can_manage_comisiones`.
- `/comisiones/jerarquia/` y `/comisiones/condiciones/` — la configuracion de
  pago, con `can_manage_comisiones`.

El informe de un borrador se calcula en la peticion: es un mes de
instalaciones, no el historico, y no necesita el worker.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core.utils import clean_json_nullable, clean_json_props
from services.catalogos.models import CARGO_CHOICES, PersonaVentas
from services.comisiones.analytics.calculo import (
    FaltanColumnas,
    condiciones_vigentes,
    mes_anterior,
    mes_siguiente,
)
from services.comisiones.analytics.cierre import NoSePuedeCerrar, cerrar_periodo, reabrir_periodo
from services.comisiones.analytics.queries import informe, periodo_por_defecto, periodos, propuesta
from services.comisiones.analytics.reglas import validar_tramos_asesor, validar_tramos_un
from services.comisiones.models import (
    SUPERIOR_DE,
    ComisionPeriodo,
    CondicionesComision,
    IndicadorComision,
    PosicionJerarquia,
    RevisionComision,
)
from services.config.decorators import permission_required
from services.subscriptions.models import Plan

logger = logging.getLogger(__name__)

PERMISO_VER = "can_view_comisiones"
PERMISO_GESTION = "can_manage_comisiones"

_MES = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class DatosInvalidos(ValueError):
    """Lo que mando el cliente no se puede guardar (se responde 400)."""


def _puede(request, permiso: str) -> bool:
    """Si el usuario de la peticion tiene `permiso` (superusuario incluido)."""
    if request.user.is_superuser:
        return True
    perfil = getattr(request.user, "profile", None)
    return bool(perfil and perfil.has_permission(permiso))


def _cuerpo(request) -> dict:
    """El cuerpo JSON de una escritura. Levanta `DatosInvalidos` si no lo es."""
    try:
        data = json.loads(request.body)
    except ValueError:
        raise DatosInvalidos("JSON invalido.") from None
    if not isinstance(data, dict):
        raise DatosInvalidos("JSON invalido.")
    return data


def _mes(valor: Any, campo: str = "periodo") -> str:
    """Un `YYYY-MM` valido."""
    texto = str(valor or "").strip()
    if not _MES.match(texto):
        raise DatosInvalidos(f"«{campo}» tiene que ser un mes YYYY-MM.")
    return texto


def _fecha(valor: Any, campo: str) -> date:
    """Una fecha ISO valida."""
    try:
        return date.fromisoformat(str(valor or "").strip())
    except ValueError:
        raise DatosInvalidos(f"«{campo}» tiene que ser una fecha YYYY-MM-DD.") from None


def _decimal(valor: Any, campo: str, *, nulo: bool = True) -> Decimal | None:
    """Un numero, o None si viene vacio y se admite."""
    if valor in (None, ""):
        if nulo:
            return None
        raise DatosInvalidos(f"«{campo}» es obligatorio.")
    try:
        return Decimal(str(valor))
    except (InvalidOperation, ValueError):
        raise DatosInvalidos(f"«{campo}» tiene que ser un número.") from None


def _escritura(funcion):
    """Convierte las excepciones de una escritura en su respuesta JSON."""
    def envoltura(request, *args, **kwargs):
        try:
            return funcion(request, *args, **kwargs)
        except DatosInvalidos as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
        except NoSePuedeCerrar as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=409)
        except FaltanColumnas as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=409)
    envoltura.__name__ = funcion.__name__
    envoltura.__doc__ = funcion.__doc__
    return envoltura


def _periodo_abierto(clave: str) -> ComisionPeriodo:
    """El periodo indicado, que tiene que existir y estar en borrador."""
    periodo = ComisionPeriodo.objects.filter(periodo=clave).first()
    if periodo is None:
        raise DatosInvalidos(f"El periodo {clave} no existe.")
    if periodo.cerrado:
        raise NoSePuedeCerrar(f"El periodo {clave} está cerrado: reábrelo para cambiarlo.")
    return periodo


# --- El informe ---------------------------------------------------------------------

@login_required
@permission_required(PERMISO_VER)
def informe_view(request):
    """El informe de comisiones de un periodo (`?periodo=YYYY-MM`).

    Sin periodo abre el mas reciente que exista, o propone crear el que toca
    hoy. El detalle venta a venta no viaja en los props —un mes son miles de
    filas—: lo pide la pagina a `api/ventas/`.
    """
    condiciones = CondicionesComision.actual()
    existentes = periodos()
    pedido = request.GET.get("periodo") or ""
    clave = pedido if _MES.match(pedido) else (existentes[0]["periodo"] if existentes else periodo_por_defecto(condiciones.dias_espera))

    periodo = ComisionPeriodo.objects.filter(periodo=clave).first()
    datos, error = None, None
    if periodo is not None:
        try:
            datos, _ = informe(periodo)
        except FaltanColumnas as e:
            error = str(e)
        except Exception:
            logger.exception("No se pudo calcular el informe de comisiones de %s", clave)
            error = "No se pudo calcular el informe. Consulte el registro de la aplicación."

    return render_inertia(request, "Comisiones/Informe", clean_json_nullable({
        "periodo": clave,
        "periodos": existentes,
        "informe": datos,
        "error": error,
        "propuesta": propuesta(clave, condiciones.dia_promocional),
        "cargos": [{"value": v, "label": t} for v, t in CARGO_CHOICES],
        "puedeGestionar": _puede(request, PERMISO_GESTION),
        "section": "informe",
    }))


@login_required
@permission_required(PERMISO_VER)
def api_ventas(request):
    """El detalle venta a venta de un periodo: para el desglose y la exportacion."""
    clave = request.GET.get("periodo") or ""
    if not _MES.match(clave):
        return JsonResponse({"status": "error", "message": "Periodo invalido."}, status=400)
    periodo = ComisionPeriodo.objects.filter(periodo=clave).first()
    if periodo is None:
        return JsonResponse({"status": "error", "message": "El periodo no existe."}, status=404)
    try:
        _, ventas = informe(periodo)
    except FaltanColumnas as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=409)
    return JsonResponse(clean_json_nullable({"status": "success", "ventas": ventas}))


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="30/m", block=True)
@require_POST
@_escritura
def api_periodo_guardar(request):
    """Crea un periodo en borrador, o cambia sus dias promocionales.

    `inicio_promo` es el inicio de los dias promocionales del mes; el periodo
    termina el dia antes. `inicio` solo se acepta si el mes anterior no tiene
    periodo: si lo tiene, el inicio es su `inicio_promo` y no se pregunta.

    Cambiar el `inicio_promo` de un mes mueve el inicio del siguiente, asi que
    no se permite si el siguiente esta cerrado.
    """
    data = _cuerpo(request)
    clave = _mes(data.get("periodo"))
    inicio_promo = _fecha(data.get("inicio_promo"), "inicio_promo")
    if inicio_promo.strftime("%Y-%m") != clave:
        raise DatosInvalidos("Los días promocionales del periodo tienen que empezar dentro de su mes.")

    anterior = ComisionPeriodo.objects.filter(periodo=mes_anterior(clave)).first()
    if anterior:
        inicio = anterior.inicio_promo
    else:
        inicio = _fecha(data.get("inicio"), "inicio")
        if inicio.strftime("%Y-%m") != mes_anterior(clave):
            raise DatosInvalidos("El inicio tiene que caer en el mes anterior: es donde empezaron sus días promocionales.")
    if inicio_promo <= inicio:
        raise DatosInvalidos("El periodo tiene que terminar después de empezar.")

    siguiente = ComisionPeriodo.objects.filter(periodo=mes_siguiente(clave)).first()
    existente = ComisionPeriodo.objects.filter(periodo=clave).first()
    if existente and existente.cerrado:
        raise NoSePuedeCerrar(f"El periodo {clave} está cerrado: reábrelo para cambiarlo.")
    if siguiente and siguiente.cerrado and (not existente or existente.inicio_promo != inicio_promo):
        raise NoSePuedeCerrar(f"El periodo {siguiente.periodo} está cerrado y empieza donde termina este.")

    with transaction.atomic():
        periodo = existente or ComisionPeriodo(periodo=clave, creado_por=request.user)
        periodo.inicio = inicio
        periodo.inicio_promo = inicio_promo
        periodo.save()
        if siguiente and not siguiente.cerrado:
            siguiente.inicio = inicio_promo
            siguiente.save(update_fields=["inicio"])
    return JsonResponse({"status": "success", "message": f"Periodo {clave} guardado."})


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="60/m", block=True)
@require_POST
@_escritura
def api_revision_guardar(request):
    """Decide ventas por facturar: `contar` aqui o `diferir` a `periodo_destino`.

    `orden` decide una venta; `ordenes`, varias de una vez —un mes puede traer
    cientos, y decidirlas una a una choca con el limite de peticiones—.
    `decision` vacia borra la decision y la venta vuelve a Revisión.
    """
    data = _cuerpo(request)
    periodo = _periodo_abierto(_mes(data.get("periodo")))
    bruto = data.get("ordenes") if isinstance(data.get("ordenes"), list) else [data.get("orden")]
    ordenes = sorted({str(o or "").strip()[:80] for o in bruto} - {""})
    if not ordenes:
        raise DatosInvalidos("Falta la orden.")
    if len(ordenes) > 5000:
        raise DatosInvalidos("Demasiadas órdenes en una sola decisión.")
    decision = str(data.get("decision") or "").strip()

    if not decision:
        RevisionComision.objects.filter(orden__in=ordenes, periodo_origen=periodo.periodo).delete()
        return JsonResponse({"status": "success", "message": "Decisión deshecha."})
    if decision not in ("contar", "diferir"):
        raise DatosInvalidos("La decisión es «contar» o «diferir».")

    destino = ""
    if decision == "diferir":
        destino = _mes(data.get("periodo_destino"), "periodo_destino")
        if destino <= periodo.periodo:
            raise DatosInvalidos("Una venta solo se difiere a un periodo posterior.")
        cerrado = ComisionPeriodo.objects.filter(periodo=destino, estado="cerrado").exists()
        if cerrado:
            raise NoSePuedeCerrar(f"El periodo {destino} ya está cerrado.")

    nota = str(data.get("nota") or "").strip()[:255]
    with transaction.atomic():
        for orden in ordenes:
            RevisionComision.objects.update_or_create(
                orden=orden,
                periodo_origen=periodo.periodo,
                defaults={
                    "decision": decision,
                    "periodo_destino": destino,
                    "nota": nota,
                    "decidido_por": request.user,
                },
            )
    return JsonResponse({
        "status": "success",
        "message": "Decisión guardada." if len(ordenes) == 1 else f"Decisión guardada en {len(ordenes)} ventas.",
    })


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="60/m", block=True)
@require_POST
@_escritura
def api_indicador_guardar(request):
    """El % de cumplimiento (o el crecimiento a mano) de una persona en un periodo.

    Vacio borra el valor: el cumplimiento vuelve a "sin definir" y el
    crecimiento al que da Unidades de negocio.
    """
    data = _cuerpo(request)
    periodo = _periodo_abierto(_mes(data.get("periodo")))
    persona = PersonaVentas.objects.filter(pk=data.get("persona_id")).first()
    if persona is None:
        raise DatosInvalidos("La persona no existe.")

    fila, _ = IndicadorComision.objects.get_or_create(periodo=periodo.periodo, persona=persona)
    if "cumplimiento_pct" in data:
        if persona.cargo not in ("supervisor", "coord_oficina"):
            raise DatosInvalidos("Solo supervisores y coordinadores de oficina tienen cumplimiento.")
        valor = _decimal(data.get("cumplimiento_pct"), "cumplimiento_pct")
        if valor is not None and valor < 0:
            raise DatosInvalidos("El cumplimiento no puede ser negativo.")
        fila.cumplimiento_pct = valor
    if "crecimiento_pct" in data:
        if persona.cargo != "coord_un":
            raise DatosInvalidos("Solo los coordinadores de UN cobran por crecimiento.")
        fila.crecimiento_pct = _decimal(data.get("crecimiento_pct"), "crecimiento_pct")
    fila.actualizado_por = request.user

    if fila.cumplimiento_pct is None and fila.crecimiento_pct is None:
        fila.delete()
    else:
        fila.save()
    return JsonResponse({"status": "success", "message": "Guardado."})


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="10/m", block=True)
@require_POST
@_escritura
def api_periodo_cerrar(request):
    """Cierra el periodo: congela ventas, pagos y condiciones. **409** si queda algo pendiente."""
    data = _cuerpo(request)
    periodo = _periodo_abierto(_mes(data.get("periodo")))
    cerrar_periodo(periodo, request.user)
    return JsonResponse({"status": "success", "message": f"Periodo {periodo.periodo} cerrado."})


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="10/m", block=True)
@require_POST
@_escritura
def api_periodo_reabrir(request):
    """Devuelve un periodo cerrado a borrador. **409** si el siguiente esta cerrado."""
    data = _cuerpo(request)
    clave = _mes(data.get("periodo"))
    periodo = ComisionPeriodo.objects.filter(periodo=clave).first()
    if periodo is None:
        raise DatosInvalidos(f"El periodo {clave} no existe.")
    if not periodo.cerrado:
        return JsonResponse({"status": "success", "message": "El periodo ya estaba en borrador."})
    reabrir_periodo(periodo)
    return JsonResponse({"status": "success", "message": f"Periodo {clave} reabierto."})


# --- Configuracion: la jerarquia ----------------------------------------------------------

def _persona_jerarquia(p: PersonaVentas, superiores: dict[int, int]) -> dict[str, Any]:
    return {
        "id": p.id,
        "nombre": p.nombre,
        "apellido": p.apellido,
        "cargo": p.cargo,
        "medio": p.medio,
        "superior_id": superiores.get(p.id),
    }


@login_required
@permission_required(PERMISO_GESTION)
def jerarquia_view(request):
    """La estructura jerarquica: a que equipo pertenece cada persona de ventas."""
    superiores = dict(PosicionJerarquia.objects.values_list("persona_id", "superior_id"))
    return render_inertia(request, "Comisiones/Jerarquia", clean_json_props({
        "personas": [_persona_jerarquia(p, superiores) for p in PersonaVentas.objects.all()],
        "cargos": [{"value": v, "label": t} for v, t in CARGO_CHOICES],
        "superiorDe": SUPERIOR_DE,
        "section": "jerarquia",
    }))


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="60/m", block=True)
@require_POST
@_escritura
def api_jerarquia_guardar(request):
    """Fija (o quita, con `superior_id` vacio) el superior de una persona.

    El superior tiene que tener el cargo inmediatamente superior: asesor →
    supervisor → coordinador de oficina → coordinador de UN.
    """
    data = _cuerpo(request)
    persona = PersonaVentas.objects.filter(pk=data.get("persona_id")).first()
    if persona is None:
        raise DatosInvalidos("La persona no existe.")
    if not data.get("superior_id"):
        PosicionJerarquia.objects.filter(persona=persona).delete()
        return JsonResponse({"status": "success", "message": "Superior quitado."})

    esperado = SUPERIOR_DE.get(persona.cargo)
    if esperado is None:
        raise DatosInvalidos("El coordinador de unidad de negocio no responde a nadie.")
    superior = PersonaVentas.objects.filter(pk=data.get("superior_id")).first()
    if superior is None:
        raise DatosInvalidos("El superior no existe.")
    if superior.cargo != esperado:
        etiqueta = dict(CARGO_CHOICES)[esperado].lower()
        raise DatosInvalidos(f"El superior de {persona.nombre_completo} tiene que ser un {etiqueta}.")

    PosicionJerarquia.objects.update_or_create(
        persona=persona, defaults={"superior": superior, "actualizado_por": request.user}
    )
    return JsonResponse({"status": "success", "message": "Superior guardado."})


# --- Configuracion: las condiciones ---------------------------------------------------------

def _planes_pyme() -> list[dict[str, Any]]:
    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "tarifa": p.tarifa,
            "precio": float(p.precio),
            "comision_pyme_pct": float(p.comision_pyme_pct) if p.comision_pyme_pct is not None else None,
        }
        for p in Plan.objects.filter(tipo_persona="PYME")
    ]


@login_required
@permission_required(PERMISO_GESTION)
def condiciones_view(request):
    """Las condiciones de pago: tramos, tarifas, dias promocionales y los % PYME."""
    return render_inertia(request, "Comisiones/Condiciones", clean_json_nullable({
        "condiciones": condiciones_vigentes(),
        "planesPyme": _planes_pyme(),
        "puedeEditarPlanes": _puede(request, "can_manage_catalogo_operacional"),
        "section": "condiciones",
    }))


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="30/m", block=True)
@require_POST
@_escritura
def api_condiciones_guardar(request):
    """Guarda las condiciones enteras. Solo afectan a lo que se calcule despues."""
    data = _cuerpo(request)
    c = CondicionesComision.actual()
    for campo in ("monto_equipo", "monto_directa", "monto_directa_un"):
        valor = _decimal(data.get(campo), campo, nulo=False)
        if valor < 0:
            raise DatosInvalidos(f"«{campo}» no puede ser negativo.")
        setattr(c, campo, valor)
    try:
        c.tramos_asesor = validar_tramos_asesor(data.get("tramos_asesor"))
        c.tramos_un = validar_tramos_un(data.get("tramos_un"))
    except ValueError as e:
        raise DatosInvalidos(str(e)) from None
    dia = _decimal(data.get("dia_promocional"), "dia_promocional", nulo=False)
    espera = _decimal(data.get("dias_espera"), "dias_espera", nulo=False)
    if not 1 <= dia <= 31 or dia != int(dia):
        raise DatosInvalidos("El día promocional es un día del mes, de 1 a 31.")
    if not 0 <= espera <= 60 or espera != int(espera):
        raise DatosInvalidos("Los días de espera van de 0 a 60.")
    c.dia_promocional = int(dia)
    c.dias_espera = int(espera)
    c.actualizado_por = request.user
    c.save()
    return JsonResponse({"status": "success", "message": "Condiciones guardadas."})

