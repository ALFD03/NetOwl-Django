"""Catalogos de referencia: la pantalla de configuracion y su CRUD.

Planes y zonas eran `data/Planes.json` y `data/Zonas.json`, y cambiarlos
exigia editar un fichero del repositorio y volver a desplegar. Aqui se
mantienen desde la propia aplicacion.

Es un solo par de endpoints para los siete catalogos y no catorce vistas casi
iguales: lo unico que cambia entre ellos es que campos se leen del cuerpo y
como se serializa la fila, y eso es lo que declara `CATALOGOS`.

Toda escritura llama a `fixtures.reset_cache()`: el catalogo se lee cacheado
—el worker de Celery es otro proceso— y sin esto una edicion tardaria hasta un
minuto en verse, o no se veria nunca en el proceso que ya la tenia leida.

Los catalogos se reparten entre dos permisos, porque los mantienen equipos
distintos: el **comercial** (zonas, sites, estados y coordinadores: como se
reparte la red entre los equipos de venta) y el **operacional** (planes, planes
reguladores, ignorados y la lista de productos por registrar). Cada entrada de `CATALOGOS` declara el suyo; la pantalla abre
con cualquiera de los dos y solo envia las pestanas del que se tiene, y cada
escritura comprueba el del catalogo que toca, no el de la pantalla.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from django.db.models import ProtectedError
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core import fixtures
from core.utils import clean_json_props
from services.config.decorators import permission_required
from services.subscriptions.analytics.imports import productos_fuera_de_catalogo
from services.subscriptions.models import (
    TECNOLOGIA_CHOICES,
    TIPO_PERSONA_CHOICES,
    Coordinador,
    Estado,
    Plan,
    PlanRegulador,
    ProductoIgnorado,
    Site,
    Zona,
)

logger = logging.getLogger(__name__)


class DatosInvalidos(ValueError):
    """Lo que mando el cliente no compone una fila valida."""


def _texto(data: dict, clave: str, *, obligatorio: bool = False, maximo: int = 255) -> str:
    """Lee un campo de texto del cuerpo, recortado y con longitud maxima."""
    valor = str(data.get(clave) or "").strip()
    if obligatorio and not valor:
        raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
    return valor[:maximo]


def _numero(data: dict, clave: str, por_defecto: float = 0.0) -> float:
    """Lee un campo numerico del cuerpo."""
    try:
        return float(data.get(clave) or por_defecto)
    except (TypeError, ValueError):
        raise DatosInvalidos(f"El campo «{clave}» debe ser un numero.") from None


def _opcion(data: dict, clave: str, opciones, por_defecto: str) -> str:
    """Lee un campo que solo admite unos valores concretos."""
    valor = str(data.get(clave) or por_defecto).strip()
    validas = [v for v, _ in opciones]
    if valor not in validas:
        raise DatosInvalidos(
            f"«{valor}» no es un valor valido para {clave}: {', '.join(validas)}."
        )
    return valor


def _relacion(modelo, data: dict, clave: str, *, obligatorio: bool):
    """Resuelve la clave ajena de un campo del cuerpo."""
    bruto = data.get(clave)
    if bruto in (None, "", 0):
        if obligatorio:
            raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
        return None
    fila = modelo.objects.filter(pk=bruto).first()
    if fila is None:
        raise DatosInvalidos(f"No existe el registro indicado en «{clave}».")
    return fila


# --- Serializacion ----------------------------------------------------------

def _plan(p: Plan) -> dict[str, Any]:
    """Un plan, tal y como lo consume la interfaz."""
    return {
        "id": p.id,
        "nombre": p.nombre,
        "tarifa": p.tarifa,
        "tecnologia": p.tecnologia,
        "tipo_persona": p.tipo_persona,
        "referencia": p.referencia,
        "tiene_tv": p.tiene_tv,
        "datas_mbps": float(p.datas_mbps),
        "precio": float(p.precio),
        "declarar_en_eta": p.declarar_en_eta,
        "plan_regulador_id": p.plan_regulador_id,
        "plan_regulador": p.plan_regulador.nombre if p.plan_regulador_id else "",
    }


def _plan_regulador(r: PlanRegulador) -> dict[str, Any]:
    """Un plan regulador, con cuantos planes comerciales se declaran con el."""
    return {
        "id": r.id,
        "nombre": r.nombre,
        "tecnologia": r.tecnologia,
        "tipo_persona": r.tipo_persona,
        "datas_mbps": float(r.datas_mbps),
        "precio": float(r.precio),
        "tiene_tv": r.tiene_tv,
        "es_transporte": r.es_transporte,
        "notas": r.notas,
        "planes": r.planes.count(),
    }


def _zona(z: Zona) -> dict[str, Any]:
    """Una zona, con los nombres de sus relaciones resueltos."""
    return {
        "id": z.id,
        "nombre": z.nombre,
        "site_id": z.site_id,
        "site": z.site.nombre,
        "estado_id": z.estado_id,
        "estado": z.estado.nombre,
        "tecnologia": z.tecnologia,
        "coordinador_id": z.coordinador_id,
        "coordinador": z.coordinador.nombre if z.coordinador else "",
    }


def _site(s: Site) -> dict[str, Any]:
    """Un site, con cuantas zonas lo referencian."""
    return {"id": s.id, "nombre": s.nombre, "orden": s.orden, "zonas": s.zonas.count()}


def _estado(e: Estado) -> dict[str, Any]:
    """Un estado, con cuantas zonas lo referencian."""
    return {"id": e.id, "nombre": e.nombre, "zonas": e.zonas.count()}


def _coordinador(c: Coordinador) -> dict[str, Any]:
    """Un coordinador, con cuantas zonas lo referencian."""
    return {"id": c.id, "nombre": c.nombre, "zonas": c.zonas.count()}


def _ignorado(i: ProductoIgnorado) -> dict[str, Any]:
    """Un producto ignorado, con quien y cuando lo declaro."""
    return {
        "id": i.id,
        "nombre": i.nombre,
        "nota": i.nota,
        "creado_por": i.creado_por.username if i.creado_por else "",
        "creado_en": i.creado_en.strftime("%Y-%m-%d %H:%M"),
    }


# --- Aplicacion del cuerpo a la fila ----------------------------------------

def _aplicar_plan(fila: Plan, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=150)
    fila.tarifa = _texto(data, "tarifa", maximo=150)
    fila.tecnologia = _opcion(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.tipo_persona = _opcion(data, "tipo_persona", TIPO_PERSONA_CHOICES, "nat")
    fila.referencia = _texto(data, "referencia", maximo=200)
    fila.tiene_tv = bool(data.get("tiene_tv", False))
    fila.datas_mbps = _numero(data, "datas_mbps")
    fila.precio = _numero(data, "precio")
    fila.declarar_en_eta = bool(data.get("declarar_en_eta", True))
    # Opcional: un plan recien creado todavia no esta agrupado, y hasta que lo
    # este no aparece en los formularios de la reguladora.
    fila.plan_regulador = _relacion(PlanRegulador, data, "plan_regulador_id", obligatorio=False)


def _aplicar_plan_regulador(fila: PlanRegulador, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un plan regulador."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=200)
    fila.tecnologia = _opcion(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.tipo_persona = _opcion(data, "tipo_persona", TIPO_PERSONA_CHOICES, "nat")
    fila.datas_mbps = _numero(data, "datas_mbps")
    fila.precio = _numero(data, "precio")
    fila.tiene_tv = bool(data.get("tiene_tv", False))
    fila.es_transporte = bool(data.get("es_transporte", False))
    fila.notas = _texto(data, "notas")


def _aplicar_zona(fila: Zona, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre una zona."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)
    fila.site = _relacion(Site, data, "site_id", obligatorio=True)
    fila.estado = _relacion(Estado, data, "estado_id", obligatorio=True)
    fila.tecnologia = _opcion(data, "tecnologia", TECNOLOGIA_CHOICES, "FTTH")
    fila.coordinador = _relacion(Coordinador, data, "coordinador_id", obligatorio=False)


def _aplicar_site(fila: Site, data: dict, request) -> None:
    """Vuelca el cuerpo de la peticion sobre un site."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=80)
    fila.orden = int(_numero(data, "orden", 999))


def _aplicar_nombre(fila, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un catalogo que solo tiene nombre."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)


def _aplicar_ignorado(fila: ProductoIgnorado, data: dict, request) -> None:
    """Vuelca el cuerpo sobre un producto ignorado, anotando quien lo creo."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=200)
    fila.nota = _texto(data, "nota")
    if fila.creado_por_id is None:
        fila.creado_por = request.user


PERMISO_COMERCIAL = "can_manage_catalogo_comercial"
PERMISO_OPERACIONAL = "can_manage_catalogo_operacional"

# Un catalogo = un modelo, como se sirve, como se lee del cuerpo y que permiso
# lo administra. Anadir uno nuevo es anadir una entrada aqui y una pestana en
# la interfaz.
CATALOGOS: dict[str, dict[str, Any]] = {
    "planes": {"modelo": Plan, "serializar": _plan, "aplicar": _aplicar_plan, "etiqueta": "plan", "permiso": PERMISO_OPERACIONAL},
    "reguladores": {"modelo": PlanRegulador, "serializar": _plan_regulador, "aplicar": _aplicar_plan_regulador, "etiqueta": "plan regulador", "permiso": PERMISO_OPERACIONAL},
    "ignorados": {"modelo": ProductoIgnorado, "serializar": _ignorado, "aplicar": _aplicar_ignorado, "etiqueta": "producto ignorado", "permiso": PERMISO_OPERACIONAL},
    "zonas": {"modelo": Zona, "serializar": _zona, "aplicar": _aplicar_zona, "etiqueta": "zona", "permiso": PERMISO_COMERCIAL},
    "sites": {"modelo": Site, "serializar": _site, "aplicar": _aplicar_site, "etiqueta": "site", "permiso": PERMISO_COMERCIAL},
    "estados": {"modelo": Estado, "serializar": _estado, "aplicar": _aplicar_nombre, "etiqueta": "estado", "permiso": PERMISO_COMERCIAL},
    "coordinadores": {"modelo": Coordinador, "serializar": _coordinador, "aplicar": _aplicar_nombre, "etiqueta": "coordinador", "permiso": PERMISO_COMERCIAL},
}


def _puede(request, permiso: str) -> bool:
    """Si el usuario de la peticion tiene `permiso` (superusuario incluido)."""
    if request.user.is_superuser:
        return True
    perfil = getattr(request.user, "profile", None)
    return bool(perfil and perfil.has_permission(permiso))


def _catalogo_permitido(request, data: dict) -> tuple[dict[str, Any] | None, JsonResponse | None]:
    """El catalogo que pide el cuerpo, o la respuesta de error si no se puede tocar.

    Los endpoints de escritura dejan pasar a quien tenga cualquiera de los dos
    permisos; aqui se exige el del catalogo concreto, que es lo que impide que
    el grupo comercial edite un plan mandando `tipo: "planes"` a mano.
    """
    catalogo = CATALOGOS.get(str(data.get("tipo") or ""))
    if catalogo is None:
        return None, JsonResponse({"status": "error", "message": "Catálogo desconocido."}, status=400)
    if not _puede(request, catalogo["permiso"]):
        return None, JsonResponse(
            {
                "status": "error",
                "message": f"Acceso denegado. Se requiere el privilegio: {catalogo['permiso']}.",
            },
            status=403,
        )
    return catalogo, None


def _listado(nombre: str) -> list[dict[str, Any]]:
    """Todas las filas de un catalogo, ya serializadas."""
    catalogo = CATALOGOS[nombre]
    consulta = catalogo["modelo"].objects.all()
    if nombre == "zonas":
        consulta = consulta.select_related("site", "estado", "coordinador")
    elif nombre == "planes":
        consulta = consulta.select_related("plan_regulador")
    elif nombre == "ignorados":
        consulta = consulta.select_related("creado_por")
    return [catalogo["serializar"](fila) for fila in consulta]


# --- Vistas -----------------------------------------------------------------

@login_required
@permission_required(PERMISO_COMERCIAL, PERMISO_OPERACIONAL)
def catalogos_view(request):
    """Pantalla de configuracion de los catalogos.

    Solo se envian los catalogos del permiso que se tiene: los del otro llegan
    como listas vacias y la interfaz oculta sus pestanas. `comercial` y
    `operacional` le dicen cuales mostrar sin que tenga que deducirlo de que
    una lista venga vacia, que tambien puede ser un catalogo sin filas.

    `?nuevo_plan=<nombre>` abre el formulario de plan ya relleno con ese
    nombre: es a donde lleva el aviso de la importacion cuando encuentra un
    producto sin catalogar, para no obligar a copiarlo a mano.
    """
    comercial = _puede(request, PERMISO_COMERCIAL)
    operacional = _puede(request, PERMISO_OPERACIONAL)

    props = {
        nombre: _listado(nombre) if _puede(request, catalogo["permiso"]) else []
        for nombre, catalogo in CATALOGOS.items()
    }
    props.update({
        "comercial": comercial,
        "operacional": operacional,
        "tecnologias": [{"value": v, "label": t} for v, t in TECNOLOGIA_CHOICES],
        "tiposPersona": [{"value": v, "label": t} for v, t in TIPO_PERSONA_CHOICES],
        "nuevoPlan": (request.GET.get("nuevo_plan") or "").strip() if operacional else "",
        "section": "catalogos",
    })

    # Lo que ya esta importado y hoy no esta en el catalogo. Es la razon de ser
    # de la mitad operacional: enterarse de que falta algo sin esperar al proximo
    # analisis. Si la consulta falla (entorno sin datos aun) no se rompe la
    # pagina por ello.
    props["pendientes"] = []
    if operacional:
        try:
            props["pendientes"] = productos_fuera_de_catalogo()
        except Exception:
            logger.exception("No se pudieron calcular los productos fuera de catalogo")

    return render_inertia(request, "Subscriptions/Catalogos", clean_json_props(props))


@login_required
@permission_required(PERMISO_COMERCIAL, PERMISO_OPERACIONAL)
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_catalogo_guardar(request):
    """Alta o edicion de una fila de cualquiera de los catalogos."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    catalogo, rechazo = _catalogo_permitido(request, data)
    if rechazo is not None:
        return rechazo

    fila_id = data.get("id")
    if fila_id:
        fila = catalogo["modelo"].objects.filter(pk=fila_id).first()
        if fila is None:
            return JsonResponse({"status": "error", "message": "El registro ya no existe."}, status=404)
    else:
        fila = catalogo["modelo"]()

    try:
        catalogo["aplicar"](fila, data, request)
        fila.save()
    except DatosInvalidos as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    except IntegrityError:
        return JsonResponse(
            {"status": "error", "message": f"Ya existe un {catalogo['etiqueta']} con ese nombre."},
            status=409,
        )

    fixtures.reset_cache()
    return JsonResponse({
        "status": "success",
        "message": f"{catalogo['etiqueta'].capitalize()} guardado.",
        "registro": catalogo["serializar"](fila),
    })


@login_required
@permission_required(PERMISO_COMERCIAL, PERMISO_OPERACIONAL)
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_catalogo_eliminar(request):
    """Baja de una fila.

    Un site, un estado o un coordinador con zonas colgando no se borra: la zona
    los referencia con `PROTECT` y borrarlos dejaria el catalogo incoherente.
    Se responde 409 explicando cual es el estorbo en vez de un 500.
    """
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    catalogo, rechazo = _catalogo_permitido(request, data)
    if rechazo is not None:
        return rechazo

    fila = catalogo["modelo"].objects.filter(pk=data.get("id")).first()
    if fila is None:
        return JsonResponse({"status": "success", "message": "El registro ya no existía."})

    try:
        fila.delete()
    except ProtectedError:
        return JsonResponse(
            {
                "status": "error",
                "message": (
                    f"No se puede eliminar este {catalogo['etiqueta']}: tiene zonas "
                    "asociadas. Reasígnalas primero."
                ),
            },
            status=409,
        )

    fixtures.reset_cache()
    return JsonResponse({"status": "success", "message": f"{catalogo['etiqueta'].capitalize()} eliminado."})
