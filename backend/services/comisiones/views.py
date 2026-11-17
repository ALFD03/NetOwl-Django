"""El modulo de Comisiones: el informe y la configuracion de pago.

- `/comisiones/` — el informe de un periodo. Lo ve `can_view_comisiones`;
  crear el periodo, decidir las revisiones, agregar ventas a mano, escribir
  cumplimientos y cerrar es `can_manage_comisiones`.
- `/comisiones/condiciones/` — la ventana de pago (dias promocionales, espera y
  corte) y los % PYME, con `can_manage_comisiones`. Quien cobra y cuanto no se
  configura aqui: son los equipos y las condiciones de cada rol, en Catalogos ›
  Ventas.

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
from django.utils import timezone
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core.utils import clean_json_nullable
from services.catalogos.equipos import ROLES, ROLES_POR_EQUIPO
from services.catalogos.models import EquipoVentas, PersonaVentas
from services.comisiones.analytics.calculo import (
    FaltanColumnas,
    condiciones_vigentes,
    leer_ordenes,
    mes_anterior,
    mes_siguiente,
)
from services.comisiones.analytics.cierre import NoSePuedeCerrar, cerrar_periodo, reabrir_periodo
from services.comisiones.analytics.queries import informe, periodo_por_defecto, periodos, propuesta
from services.comisiones.analytics.reglas import (
    CONTAR,
    NO_CONTAR,
    NORMAL,
    VALIDA,
    YA_PAGADA,
)
from services.comisiones.models import (
    ComisionCierreArchivado,
    ComisionPeriodo,
    ComisionVenta,
    CondicionesComision,
    IndicadorComision,
    RevisionComision,
    VentaManual,
)
from services.config.decorators import permission_required
from services.subscriptions.analytics.bcv import TasaNoDisponible, consultar_tasa_actual
from services.subscriptions.models import Plan

logger = logging.getLogger(__name__)

PERMISO_VER = "can_view_comisiones"
PERMISO_GESTION = "can_manage_comisiones"
# Reabrir deshace una nomina cerrada: va aparte de la gestion (ver config/models.py).
PERMISO_REABRIR = "can_reopen_comisiones"
# Borrar un periodo entero, con lo decidido en el: tambien aparte.
PERMISO_BORRAR = "can_delete_comisiones"

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
    existentes = periodos(condiciones.dia_corte)
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
        "propuesta": propuesta(clave, condiciones.dia_promocional, condiciones.dia_corte),
        # Las del cierre si esta cerrado; si no, con las que se acaba de calcular.
        "condiciones": (periodo.condiciones if periodo is not None and periodo.cerrado and periodo.condiciones
                        else condiciones_vigentes()),
        "equipos": [
            {
                "slug": e.slug,
                "nombre": e.nombre,
                "roles": [{"rol": r, "etiqueta": ROLES[r]["etiqueta"]} for r in ROLES_POR_EQUIPO.get(e.slug, [])],
            }
            for e in EquipoVentas.objects.all()
        ],
        "puedeGestionar": _puede(request, PERMISO_GESTION),
        "puedeReabrir": _puede(request, PERMISO_REABRIR),
        "puedeBorrar": _puede(request, PERMISO_BORRAR),
        # Las versiones archivadas de sus cierres anteriores, sin la copia.
        "archivos": [_archivo(a) for a in periodo.archivos.all()] if periodo is not None else [],
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

    `inicio_promo` es el inicio de los dias promocionales del mes: desde ahi lo
    instalado solo cuenta si adelanto el pago hasta `corte_adelantos` (un dia
    del mes siguiente; vacio, el habitual). `inicio` solo se acepta si el mes
    anterior no tiene periodo: si lo tiene, el inicio es su `inicio_promo` y no
    se pregunta.

    Cambiar el `inicio_promo` de un mes mueve el inicio del siguiente, asi que
    no se permite si el siguiente esta cerrado.
    """
    data = _cuerpo(request)
    clave = _mes(data.get("periodo"))
    inicio_promo = _fecha(data.get("inicio_promo"), "inicio_promo")
    if inicio_promo.strftime("%Y-%m") != clave:
        raise DatosInvalidos("Los días promocionales del periodo tienen que empezar dentro de su mes.")
    corte = _fecha(data["corte_adelantos"], "corte_adelantos") if data.get("corte_adelantos") else None
    if corte and corte.strftime("%Y-%m") != mes_siguiente(clave):
        raise DatosInvalidos("El corte de los pagos adelantados tiene que caer en el mes siguiente: es cuando se saca el informe.")

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
        if "corte_adelantos" in data:
            periodo.corte_adelantos = corte
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
    """Decide ventas por facturar: `contar` o `no_contar` en el periodo.

    En el primer periodo (sin periodo el mes anterior) tambien `ya_pagada` o
    `normal`: si lo instalado en los dias promocionales del mes anterior ya se
    cobro alli. Despues eso lo dice el cierre del anterior.

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
    if decision not in (CONTAR, NO_CONTAR, YA_PAGADA, NORMAL):
        raise DatosInvalidos("La decisión es «contar», «no contar», «ya cobrada» o «toca aquí».")
    if decision in (YA_PAGADA, NORMAL) and ComisionPeriodo.objects.filter(periodo=mes_anterior(periodo.periodo)).exists():
        raise DatosInvalidos("El periodo anterior existe: lo que ya se cobró en él lo dice su cierre.")

    nota = str(data.get("nota") or "").strip()[:255]
    with transaction.atomic():
        for orden in ordenes:
            RevisionComision.objects.update_or_create(
                orden=orden,
                periodo_origen=periodo.periodo,
                defaults={
                    "decision": decision,
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
@ratelimit(key="ip", rate="30/m", block=True)
@require_POST
@_escritura
def api_manual_agregar(request):
    """Agrega ventas a mano al periodo: cuentan en el, se instalaran cuando se instalaran.

    `{periodo, ordenes: [...], nota}`, nota obligatoria. Todo o nada: se
    rechaza si alguna orden no esta en suscripciones (de ahi sale quien
    cobra), ya esta agregada o ya se pago en otro periodo cerrado.
    """
    data = _cuerpo(request)
    periodo = _periodo_abierto(_mes(data.get("periodo")))
    bruto = data.get("ordenes") if isinstance(data.get("ordenes"), list) else [data.get("orden")]
    ordenes = sorted({str(o or "").strip()[:80] for o in bruto} - {""})
    if not ordenes:
        raise DatosInvalidos("Falta la orden.")
    if len(ordenes) > 200:
        raise DatosInvalidos("Demasiadas órdenes de una vez.")
    nota = str(data.get("nota") or "").strip()[:255]
    if not nota:
        raise DatosInvalidos("Escribe por qué se agrega: queda con la venta.")

    encontradas = leer_ordenes(ordenes)
    existen = set(encontradas["orden_producto"].astype(str)) if not encontradas.empty else set()
    faltan = [o for o in ordenes if o not in existen]
    if faltan:
        raise DatosInvalidos("No están en suscripciones: " + ", ".join(faltan) + ".")
    pagadas = dict(
        ComisionVenta.objects.filter(orden__in=ordenes, clasificacion=VALIDA, periodo__estado="cerrado")
        .exclude(periodo=periodo).values_list("orden", "periodo__periodo")
    )
    if pagadas:
        raise DatosInvalidos("Ya se pagaron: " + ", ".join(f"{o} en {p}" for o, p in sorted(pagadas.items())) + ".")
    repetidas = set(VentaManual.objects.filter(periodo=periodo.periodo, orden__in=ordenes).values_list("orden", flat=True))
    if repetidas:
        raise DatosInvalidos("Ya estaban agregadas: " + ", ".join(sorted(repetidas)) + ".")

    VentaManual.objects.bulk_create(
        VentaManual(orden=o, periodo=periodo.periodo, nota=nota, agregado_por=request.user) for o in ordenes
    )
    n = len(ordenes)
    return JsonResponse({"status": "success", "message": f"{n} venta{'s' if n != 1 else ''} agregada{'s' if n != 1 else ''}."})


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="30/m", block=True)
@require_POST
@_escritura
def api_manual_quitar(request):
    """Quita una venta agregada a mano: vuelve a contar solo si sus reglas lo dicen."""
    data = _cuerpo(request)
    periodo = _periodo_abierto(_mes(data.get("periodo")))
    orden = str(data.get("orden") or "").strip()
    borradas, _ = VentaManual.objects.filter(periodo=periodo.periodo, orden=orden).delete()
    if not borradas:
        raise DatosInvalidos(f"La orden {orden} no estaba agregada a mano.")
    return JsonResponse({"status": "success", "message": f"{orden} quitada."})


@login_required
@permission_required(PERMISO_GESTION)
@ratelimit(key="ip", rate="60/m", block=True)
@require_POST
@_escritura
def api_indicador_guardar(request):
    """El % de cumplimiento (o el crecimiento a mano) de una persona en un periodo.

    Vacio borra el valor: el cumplimiento vuelve al calculado (el % Ventas de su
    site o de sus unidades) y el crecimiento al que da Unidades de negocio. Solo
    lo admite quien tiene en sus condiciones un factor de cumplimiento o el
    escalon de crecimiento; el resto de indicadores es solo calculado.
    """
    data = _cuerpo(request)
    periodo = _periodo_abierto(_mes(data.get("periodo")))
    persona = PersonaVentas.objects.filter(pk=data.get("persona_id")).first()
    if persona is None:
        raise DatosInvalidos("La persona no existe.")

    piezas = [
        condiciones_vigentes()["equipos"].get(m.equipo.slug, {}).get(m.rol, {})
        for m in persona.membresias.select_related("equipo")
    ]
    fila, _ = IndicadorComision.objects.get_or_create(periodo=periodo.periodo, persona=persona)
    if "cumplimiento_pct" in data:
        if not any(p.get("factor") not in (None, "ninguno") for p in piezas):
            raise DatosInvalidos("Su rol no cobra con un % de cumplimiento.")
        valor = _decimal(data.get("cumplimiento_pct"), "cumplimiento_pct")
        if valor is not None and valor < 0:
            raise DatosInvalidos("El cumplimiento no puede ser negativo.")
        fila.cumplimiento_pct = valor
    if "crecimiento_pct" in data:
        if not any("escalon_crecimiento" in p for p in piezas):
            raise DatosInvalidos("Su rol no cobra por el crecimiento de su unidad.")
        fila.crecimiento_pct = _decimal(data.get("crecimiento_pct"), "crecimiento_pct")
    fila.actualizado_por = request.user

    if fila.cumplimiento_pct is None and fila.crecimiento_pct is None:
        fila.delete()
    else:
        fila.save()
    return JsonResponse({"status": "success", "message": "Guardado."})


@login_required
@permission_required(PERMISO_VER)
@ratelimit(key="ip", rate="30/m", block=True)
def api_tasa_actual(request):
    """La tasa oficial del BCV de hoy, para ver el pago a precio del dia.

    No es la tasa con que se paga (la de CONATEL del mes siguiente, que viaja
    en el informe): es una referencia, asi que no se guarda. Se pide aparte
    para que un tercero lento no frene la pagina. Un fallo responde 502.
    """
    try:
        tasa, fuente = consultar_tasa_actual()
    except TasaNoDisponible as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=502)
    return JsonResponse({"status": "success", "tasa": tasa, "fuente": fuente})


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
@permission_required(PERMISO_REABRIR)
@ratelimit(key="ip", rate="10/m", block=True)
@require_POST
@_escritura
def api_periodo_reabrir(request):
    """Devuelve un periodo cerrado a borrador, archivando antes su cierre.

    Exige el `motivo` (queda en el archivo y en la auditoria) y la
    `confirmacion`: el periodo escrito a mano, que tiene que coincidir. **409**
    si el siguiente esta cerrado o falta el motivo.
    """
    data = _cuerpo(request)
    clave = _mes(data.get("periodo"))
    if str(data.get("confirmacion") or "").strip() != clave:
        raise DatosInvalidos(f"Para reabrir, escribe el periodo exacto ({clave}) en la confirmación.")
    periodo = ComisionPeriodo.objects.filter(periodo=clave).first()
    if periodo is None:
        raise DatosInvalidos(f"El periodo {clave} no existe.")
    if not periodo.cerrado:
        return JsonResponse({"status": "success", "message": "El periodo ya estaba en borrador."})
    archivo = reabrir_periodo(periodo, request.user, str(data.get("motivo") or ""))
    return JsonResponse({
        "status": "success",
        "message": f"Periodo {clave} reabierto. El cierre anterior quedó archivado como versión {archivo.version}.",
        "archivo": _archivo(archivo),
    })


@login_required
@permission_required(PERMISO_BORRAR)
@ratelimit(key="ip", rate="10/m", block=True)
@require_POST
@_escritura
def api_periodo_borrar(request):
    """Borra un informe de comisiones en borrador, con todo lo decidido en el.

    Se lleva el periodo y lo que solo existe para el: las revisiones decididas,
    las ventas agregadas a mano y los indicadores escritos. Exige la
    `confirmacion` (el periodo escrito a mano), como reabrir.

    **409** si el periodo esta cerrado (es una nomina pagada: se reabre antes,
    y el cierre queda archivado) o si alguna vez se cerro: sus cierres
    archivados son el historial de lo que se pago, y no se borran.
    """
    data = _cuerpo(request)
    clave = _mes(data.get("periodo"))
    if str(data.get("confirmacion") or "").strip() != clave:
        raise DatosInvalidos(f"Para borrar, escribe el periodo exacto ({clave}) en la confirmación.")
    periodo = ComisionPeriodo.objects.filter(periodo=clave).first()
    if periodo is None:
        raise DatosInvalidos(f"El periodo {clave} no existe.")
    if periodo.cerrado:
        raise NoSePuedeCerrar(f"El periodo {clave} está cerrado: es una nómina pagada. Reábrelo antes de borrarlo.")
    archivados = periodo.archivos.count()
    if archivados:
        raise NoSePuedeCerrar(
            f"El periodo {clave} se cerró {archivados} vez/veces: sus cierres archivados son el historial de lo"
            " que se pagó y no se borran."
        )

    with transaction.atomic():
        borrado = {
            "revisiones": RevisionComision.objects.filter(periodo_origen=clave).delete()[0],
            "ventas_manuales": VentaManual.objects.filter(periodo=clave).delete()[0],
            "indicadores": IndicadorComision.objects.filter(periodo=clave).delete()[0],
        }
        periodo.delete()
    # La auditoria la anota el middleware, con este mensaje: lo que se llevo.
    return JsonResponse({
        "status": "success",
        "message": (
            f"Informe {clave} borrado, con {borrado['revisiones']} revisión(es), "
            f"{borrado['ventas_manuales']} venta(s) a mano y {borrado['indicadores']} indicador(es)."
        ),
        "borrado": borrado,
    })


def _archivo(a: ComisionCierreArchivado) -> dict[str, Any]:
    """Un cierre archivado para la lista, sin la copia."""
    return {
        "id": a.id,
        "version": a.version,
        "cerrado_por": a.cerrado_por,
        "cerrado_en": timezone.localtime(a.cerrado_en).strftime("%Y-%m-%d %H:%M") if a.cerrado_en else None,
        "reabierto_por": a.reabierto_por_nombre,
        "reabierto_en": timezone.localtime(a.reabierto_en).strftime("%Y-%m-%d %H:%M"),
        "motivo": a.motivo,
        "total_neto": float(a.total_neto),
        "pagos": a.pagos,
        "ventas": a.ventas,
    }


@login_required
@permission_required(PERMISO_VER)
def api_archivo(request, archivo_id: int):
    """La copia completa de un cierre archivado, para descargarla."""
    archivo = ComisionCierreArchivado.objects.select_related("periodo").filter(pk=archivo_id).first()
    if archivo is None:
        return JsonResponse({"status": "error", "message": "Cierre archivado no encontrado."}, status=404)
    return JsonResponse(clean_json_nullable({**_archivo(archivo), "periodo": archivo.periodo.periodo, "copia": archivo.copia}))


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


def _actualizacion() -> dict[str, Any]:
    """Cuando se cambiaron las condiciones por ultima vez, y quien."""
    c = CondicionesComision.actual()
    por = c.actualizado_por
    return {
        "en": c.actualizado_en.isoformat() if c.actualizado_en else None,
        "por": (por.get_full_name() or por.get_username()) if por else None,
    }


@login_required
@permission_required(PERMISO_GESTION)
def condiciones_view(request):
    """La ventana de pago (dias promocionales, espera y corte) y los % PYME de cada plan."""
    c = CondicionesComision.actual()
    return render_inertia(request, "Comisiones/Condiciones", clean_json_nullable({
        "condiciones": {"dia_promocional": c.dia_promocional, "dias_espera": c.dias_espera, "dia_corte": c.dia_corte},
        "actualizacion": _actualizacion(),
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
    """Guarda la ventana de pago. Solo afecta a lo que se calcule despues."""
    data = _cuerpo(request)
    c = CondicionesComision.actual()
    dia = _decimal(data.get("dia_promocional"), "dia_promocional", nulo=False)
    espera = _decimal(data.get("dias_espera"), "dias_espera", nulo=False)
    corte = _decimal(data.get("dia_corte"), "dia_corte", nulo=False)
    if not 1 <= dia <= 31 or dia != int(dia):
        raise DatosInvalidos("El día promocional es un día del mes, de 1 a 31.")
    if not 1 <= corte <= 31 or corte != int(corte):
        raise DatosInvalidos("El día de corte de los adelantos es un día del mes, de 1 a 31.")
    if not 0 <= espera <= 60 or espera != int(espera):
        raise DatosInvalidos("Los días de espera van de 0 a 60.")
    c.dia_promocional = int(dia)
    c.dias_espera = int(espera)
    c.dia_corte = int(corte)
    c.actualizado_por = request.user
    c.save()
    return JsonResponse({"status": "success", "message": "Condiciones guardadas."})

