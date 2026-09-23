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
from datetime import date
from typing import Any

from django.contrib.auth.decorators import login_required
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core.utils import clean_json_props
from services.config.decorators import permission_required
from services.support.analytics.usuarios import (
    tickets_tras_la_baja,
    usuarios_fuera_del_directorio,
)
from services.support.models import (
    SUFIJO_USUARIOS,
    Departamento,
    MovimientoInvalido,
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


def _fecha(data: dict, clave: str, *, obligatorio: bool = False) -> date | None:
    """Lee una fecha `YYYY-MM-DD` del cuerpo."""
    bruto = str(data.get(clave) or "").strip()
    if not bruto:
        if obligatorio:
            raise DatosInvalidos(f"El campo «{clave}» es obligatorio.")
        return None
    try:
        return date.fromisoformat(bruto)
    except ValueError:
        raise DatosInvalidos(f"«{bruto}» no es una fecha válida.") from None


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

def _iso(valor: date | None) -> str | None:
    return valor.isoformat() if valor else None


def _usuario(u: UsuarioSoporte) -> dict[str, Any]:
    """Un usuario del directorio, con su departamento y su historia resueltos."""
    return {
        "id": u.id,
        "nombre_odoo": u.nombre_odoo,
        "nombre": u.nombre,
        "apellido": u.apellido,
        "nombre_completo": u.nombre_completo,
        "departamento_id": u.departamento_id,
        "departamento": u.departamento.nombre,
        "fecha_ingreso": _iso(u.fecha_ingreso),
        "fecha_egreso": _iso(u.fecha_egreso),
        "activo": u.activo,
        "historial": [
            {
                "id": paso.id,
                "departamento_id": paso.departamento_id,
                "departamento": paso.departamento.nombre,
                "desde": _iso(paso.desde),
            }
            for paso in u.historial.all()
        ],
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

    # Obligatoria en el alta; en la edicion puede seguir vacia para quien se
    # registro antes de que existiera el campo.
    fecha_ingreso = _fecha(data, "fecha_ingreso", obligatorio=fila.pk is None)
    pasos = list(fila.historial.all()) if fila.pk else []
    if fecha_ingreso:
        primer_cambio = next((p.desde for p in pasos if p.desde), None)
        if primer_cambio and fecha_ingreso >= primer_cambio:
            raise DatosInvalidos("La fecha de ingreso tiene que ser anterior al primer cambio de departamento.")
        if fila.fecha_egreso and fecha_ingreso > fila.fecha_egreso:
            raise DatosInvalidos("La fecha de ingreso no puede ser posterior a la de egreso.")
    fila.fecha_ingreso = fecha_ingreso

    # El departamento solo se elige aqui en el alta, o para corregir el de
    # alguien que todavia no ha cambiado nunca. Con cambios encima, tocarlo
    # desde aqui reescribiria la historia: para eso esta «Cambiar departamento».
    departamento = _relacion(Departamento, data, "departamento_id")
    if len(pasos) > 1 and departamento.pk != fila.departamento_id:
        raise DatosInvalidos(
            "Este usuario ya tiene cambios de departamento: usa «Cambiar departamento» "
            "o deshaz el último cambio."
        )
    fila.departamento = departamento


def _sincronizar_historial(fila: UsuarioSoporte) -> None:
    """Deja el tramo inicial de la historia de acuerdo con el alta.

    En el alta lo crea; en una edicion sin cambios encima, lo corrige si se
    eligio otro departamento. Con cambios encima `_aplicar_usuario` ya impidio
    tocarlo.
    """
    pasos = list(fila.historial.all())
    if not pasos:
        fila.historial.create(departamento=fila.departamento, desde=None)
    elif len(pasos) == 1 and pasos[0].departamento_id != fila.departamento_id:
        pasos[0].departamento = fila.departamento
        pasos[0].save(update_fields=["departamento"])


def _aplicar_departamento(fila: Departamento, data: dict) -> None:
    """Vuelca el cuerpo de la peticion sobre un departamento."""
    fila.nombre = _texto(data, "nombre", obligatorio=True, maximo=120)


# Un catalogo = un modelo, como se sirve y como se lee del cuerpo.
CATALOGOS: dict[str, dict[str, Any]] = {
    "usuarios": {
        "modelo": UsuarioSoporte,
        "serializar": _usuario,
        "aplicar": _aplicar_usuario,
        "despues": _sincronizar_historial,
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
        consulta = consulta.select_related("departamento").prefetch_related("historial__departamento")
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

    try:
        props["trasBaja"] = tickets_tras_la_baja()
    except Exception:
        logger.exception("No se pudieron calcular los tickets posteriores a las bajas")
        props["trasBaja"] = []

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
        with transaction.atomic():
            catalogo["aplicar"](fila, data)
            fila.save()
            if despues := catalogo.get("despues"):
                despues(fila)
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
                    "asignados o alguien pasó por él. Reasígnalos primero; si "
                    "solo aparece en la historia, se conserva para no dejar "
                    "meses pasados sin departamento."
                ),
            },
            status=409,
        )

    return JsonResponse({"status": "success", "message": f"{catalogo['etiqueta'].capitalize()} eliminado."})


# --- Movimientos de un usuario ----------------------------------------------

def _cambiar_departamento(usuario: UsuarioSoporte, data: dict) -> str:
    departamento = _relacion(Departamento, data, "departamento_id")
    usuario.cambiar_departamento(departamento, _fecha(data, "fecha", obligatorio=True))
    return f"{usuario.nombre_completo} pasa a {departamento.nombre}."


def _deshacer_cambio(usuario: UsuarioSoporte, data: dict) -> str:
    usuario.deshacer_ultimo_cambio()
    return f"{usuario.nombre_completo} vuelve a {usuario.departamento.nombre}."


def _dar_de_baja(usuario: UsuarioSoporte, data: dict) -> str:
    usuario.dar_de_baja(_fecha(data, "fecha", obligatorio=True))
    return f"{usuario.nombre_completo} queda dado de baja."


def _reactivar(usuario: UsuarioSoporte, data: dict) -> str:
    usuario.reactivar()
    return f"{usuario.nombre_completo} vuelve a estar activo."


MOVIMIENTOS = {
    "cambiar_departamento": _cambiar_departamento,
    "deshacer_cambio": _deshacer_cambio,
    "baja": _dar_de_baja,
    "reactivar": _reactivar,
}


@login_required
@permission_required('can_manage_support_users')
@ratelimit(key='ip', rate='60/m', block=True)
@require_POST
def api_usuario_movimiento(request):
    """Cambio de departamento, baja o reactivacion de un usuario.

    Van aparte del guardado porque no son una edicion de la ficha sino un
    hecho con fecha: las reglas que los validan —cada cambio despues del
    anterior, la baja despues del ultimo cambio— viven en el modelo.
    """
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"status": "error", "message": "JSON invalido."}, status=400)

    accion = MOVIMIENTOS.get(str(data.get("accion") or ""))
    if accion is None:
        return JsonResponse({"status": "error", "message": "Acción desconocida."}, status=400)

    usuario = UsuarioSoporte.objects.select_related("departamento").filter(pk=data.get("id")).first()
    if usuario is None:
        return JsonResponse({"status": "error", "message": "El usuario ya no existe."}, status=404)

    try:
        mensaje = accion(usuario, data)
    except (DatosInvalidos, MovimientoInvalido) as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

    return JsonResponse({"status": "success", "message": mensaje, "registro": _usuario(usuario)})
