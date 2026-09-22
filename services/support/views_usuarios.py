"""Directorio de usuarios de soporte: la pantalla y su CRUD.

Mismo patron que `services/subscriptions/views_catalogos.py`: un unico par de
endpoints para los dos catalogos —usuarios y departamentos—, porque entre ellos
solo cambia que campos se leen del cuerpo y como se serializa la fila.

La primera pestana no es un catalogo sino la diferencia: nombres que ya
aparecen en los tickets importados y que el directorio no reconoce.
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

from core.utils import clean_json_props
from services.config.decorators import permission_required
from services.support.analytics.usuarios import usuarios_fuera_del_directorio
from services.support.models import (
    SUFIJO_USUARIOS,
    Departamento,
    UsuarioSoporte,
    normalizar_nombre_odoo,
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


def _relacion(modelo, data: dict, clave: str):
    """Resuelve la clave ajena de un campo del cuerpo."""
    bruto = data.get(clave)
    if bruto in (None, "", 0):
        raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
    fila = modelo.objects.filter(pk=bruto).first()
    if fila is None:
        raise DatosInvalidos(f"No existe el registro indicado en «{clave}».")
    return fila


# --- Serializacion ----------------------------------------------------------

def _usuario(u: UsuarioSoporte) -> dict[str, Any]:
    """Un usuario del directorio, con su departamento resuelto."""
    return {
        "id": u.id,
        "nombre_odoo": u.nombre_odoo,
        "nombre": u.nombre,
        "apellido": u.apellido,
        "nombre_completo": u.nombre_completo,
        "departamento_id": u.departamento_id,
        "departamento": u.departamento.nombre,
    }


def _departamento(d: Departamento) -> dict[str, Any]:
    """Un departamento, con cuanta gente lo referencia."""
    return {"id": d.id, "nombre": d.nombre, "usuarios": d.usuarios.count()}


# --- Aplicacion del cuerpo a la fila ----------------------------------------

def _aplicar_usuario(fila: UsuarioSoporte, data: dict) -> None:
    """Vuelca el cuerpo de la peticion sobre un usuario del directorio."""
    # El sufijo se pone aqui ademas de en `save()` para poder rechazar un
    # nombre que se queda vacio una vez quitado: `(User)` a secas no es nadie.
    nombre_odoo = normalizar_nombre_odoo(_texto(data, "nombre_odoo", obligatorio=True, maximo=200))
    if not nombre_odoo:
        raise DatosInvalidos(f"«{SUFIJO_USUARIOS}» no es un nombre de usuario.")
    fila.nombre_odoo = nombre_odoo
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)
    fila.apellido = _texto(data, "apellido", maximo=120)
    fila.departamento = _relacion(Departamento, data, "departamento_id")


def _aplicar_departamento(fila: Departamento, data: dict) -> None:
    """Vuelca el cuerpo de la peticion sobre un departamento."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)


# Un catalogo = un modelo, como se sirve y como se lee del cuerpo.
CATALOGOS: dict[str, dict[str, Any]] = {
    "usuarios": {
        "modelo": UsuarioSoporte,
        "serializar": _usuario,
        "aplicar": _aplicar_usuario,
        "etiqueta": "usuario",
    },
    "departamentos": {
        "modelo": Departamento,
        "serializar": _departamento,
        "aplicar": _aplicar_departamento,
        "etiqueta": "departamento",
    },
}


def _listado(nombre: str) -> list[dict[str, Any]]:
    """Todas las filas de un catalogo, ya serializadas."""
    catalogo = CATALOGOS[nombre]
    consulta = catalogo["modelo"].objects.all()
    if nombre == "usuarios":
        consulta = consulta.select_related("departamento")
    return [catalogo["serializar"](fila) for fila in consulta]


# --- Vistas -----------------------------------------------------------------

@login_required
@permission_required('can_manage_support_users')
def usuarios_view(request):
    """Pantalla del directorio de usuarios de soporte.

    `?nuevo_usuario=<nombre>` abre el formulario de alta ya relleno con ese
    nombre: es a donde lleva la pestana de pendientes, para no obligar a copiar
    a mano un literal que tiene que coincidir caracter por caracter.
    """
    props = {
        "usuarios": _listado("usuarios"),
        "departamentos": _listado("departamentos"),
        "sufijo": SUFIJO_USUARIOS,
        "nuevoUsuario": (request.GET.get("nuevo_usuario") or "").strip(),
        "section": "usuarios",
    }

    # La razon de ser de la pantalla: enterarse de quien falta sin repasar el
    # export a mano. Si la consulta falla —entorno sin tickets todavia— la
    # pagina sigue sirviendo para dar de alta.
    try:
        props["pendientes"] = usuarios_fuera_del_directorio()
    except Exception:
        logger.exception("No se pudieron calcular los usuarios fuera del directorio")
        props["pendientes"] = []

    return render_inertia(request, "Support/Users", clean_json_props(props))


@login_required
@permission_required('can_manage_support_users')
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_usuario_guardar(request):
    """Alta o edicion de una fila del directorio o de sus departamentos."""
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    catalogo = CATALOGOS.get(str(data.get("tipo") or ""))
    if catalogo is None:
        return JsonResponse({"status": "error", "message": "Catálogo desconocido."}, status=400)

    fila_id = data.get("id")
    if fila_id:
        fila = catalogo["modelo"].objects.filter(pk=fila_id).first()
        if fila is None:
            return JsonResponse({"status": "error", "message": "El registro ya no existe."}, status=404)
    else:
        fila = catalogo["modelo"]()

    try:
        catalogo["aplicar"](fila, data)
        fila.save()
    except DatosInvalidos as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    except IntegrityError:
        return JsonResponse(
            {"status": "error", "message": f"Ya existe un {catalogo['etiqueta']} con ese nombre."},
            status=409,
        )

    return JsonResponse({
        "status": "success",
        "message": f"{catalogo['etiqueta'].capitalize()} guardado.",
        "registro": catalogo["serializar"](fila),
    })


@login_required
@permission_required('can_manage_support_users')
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_usuario_eliminar(request):
    """Baja de una fila.

    Un departamento con usuarios dentro no se borra: el usuario lo referencia
    con `PROTECT`. Se responde 409 explicando cual es el estorbo en vez de un
    500.
    """
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    catalogo = CATALOGOS.get(str(data.get("tipo") or ""))
    if catalogo is None:
        return JsonResponse({"status": "error", "message": "Catálogo desconocido."}, status=400)

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
                    "No se puede eliminar este departamento: tiene usuarios "
                    "asignados. Reasígnalos primero."
                ),
            },
            status=409,
        )

    return JsonResponse({"status": "success", "message": f"{catalogo['etiqueta'].capitalize()} eliminado."})
