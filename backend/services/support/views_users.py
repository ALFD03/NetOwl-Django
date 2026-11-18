"""`/api/support/users/`: el directorio de usuarios de soporte y sus departamentos.

Un único par guardar/eliminar para los dos catálogos (`tipo`: usuarios o
departamentos); los movimientos con fecha (cambio de departamento, baja,
reactivación) van aparte.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import ProtectedError

from core.odoo_names import USERS_SUFFIX, normalize_odoo_name
from services.config.api import ApiError, endpoint, json_body
from services.support.analytics.users import tickets_after_churn, users_outside_directory
from services.support.api_keys import SUPPORT_KEYS
from services.support.models import Departamento, MovimientoInvalido, UsuarioSoporte

logger = logging.getLogger(__name__)

PERM = ["can_manage_support_users"]


def _text(data: dict, key: str, *, required: bool = False, max_length: int = 255) -> str:
    value = str(data.get(key) or "").strip()
    if required and not value:
        raise ApiError(f"El campo «{key}» es obligatorio.")
    return value[:max_length]


def _date(data: dict, key: str, *, required: bool = False) -> date | None:
    raw = str(data.get(key) or "").strip()
    if not raw:
        if required:
            raise ApiError(f"El campo «{key}» es obligatorio.")
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ApiError(f"«{raw}» no es una fecha válida.") from None


def _related(model, data: dict, key: str):
    raw = data.get(key)
    if raw in (None, "", 0):
        raise ApiError(f"El campo «{key}» es obligatorio.")
    row = model.objects.filter(pk=raw).first()
    if row is None:
        raise ApiError(f"No existe el registro indicado en «{key}».")
    return row


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _user(u: UsuarioSoporte) -> dict[str, Any]:
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
            {"id": step.id, "departamento_id": step.departamento_id,
             "departamento": step.departamento.nombre, "desde": _iso(step.desde)}
            for step in u.historial.all()
        ],
    }


def _department(d: Departamento) -> dict[str, Any]:
    return {"id": d.id, "nombre": d.nombre, "usuarios": d.usuarios.count()}


def _apply_user(row: UsuarioSoporte, data: dict) -> None:
    odoo_name = normalize_odoo_name(_text(data, "nombre_odoo", required=True, max_length=200))
    if not odoo_name:
        raise ApiError(f"«{USERS_SUFFIX}» no es un nombre de usuario.")
    row.nombre_odoo = odoo_name
    row.nombre = _text(data, "nombre", required=True, max_length=120)
    row.apellido = _text(data, "apellido", max_length=120)

    # Obligatoria en el alta; puede seguir vacía en quien se registró antes del campo.
    joined = _date(data, "fecha_ingreso", required=row.pk is None)
    steps = list(row.historial.all()) if row.pk else []
    if joined:
        first_change = next((s.desde for s in steps if s.desde), None)
        if first_change and joined >= first_change:
            raise ApiError("La fecha de ingreso tiene que ser anterior al primer cambio de departamento.")
        if row.fecha_egreso and joined > row.fecha_egreso:
            raise ApiError("La fecha de ingreso no puede ser posterior a la de egreso.")
    row.fecha_ingreso = joined

    # Con cambios encima, el departamento solo se toca con un movimiento.
    department = _related(Departamento, data, "departamento_id")
    if len(steps) > 1 and department.pk != row.departamento_id:
        raise ApiError(
            "Este usuario ya tiene cambios de departamento: usa «Cambiar departamento» "
            "o deshaz el último cambio."
        )
    row.departamento = department


def _sync_history(row: UsuarioSoporte) -> None:
    """Crea el tramo inicial en el alta o lo corrige si aún no hubo cambios."""
    steps = list(row.historial.all())
    if not steps:
        row.historial.create(departamento=row.departamento, desde=None)
    elif len(steps) == 1 and steps[0].departamento_id != row.departamento_id:
        steps[0].departamento = row.departamento
        steps[0].save(update_fields=["departamento"])


def _apply_department(row: Departamento, data: dict) -> None:
    row.nombre = _text(data, "nombre", required=True, max_length=120)


CATALOGS: dict[str, dict[str, Any]] = {
    "usuarios": {
        "model": UsuarioSoporte, "serialize": _user, "apply": _apply_user,
        "after": _sync_history, "label": "usuario",
    },
    "departamentos": {
        "model": Departamento, "serialize": _department, "apply": _apply_department, "label": "departamento",
    },
}


def _listing(name: str) -> list[dict[str, Any]]:
    catalog = CATALOGS[name]
    rows = catalog["model"].objects.all()
    if name == "usuarios":
        rows = rows.select_related("departamento").prefetch_related("historial__departamento")
    return [catalog["serialize"](row) for row in rows]


def _catalog(data: dict) -> dict[str, Any]:
    catalog = CATALOGS.get(str(data.get("tipo") or ""))
    if catalog is None:
        raise ApiError("Catálogo desconocido.")
    return catalog


@endpoint(perms=PERM, keys=SUPPORT_KEYS)
def users(request):
    """El directorio, los nombres de los tickets que no reconoce y los tickets tras una baja.

    `?new_user=` abre el alta ya rellena con ese nombre.
    """
    data = {
        "usuarios": _listing("usuarios"),
        "departamentos": _listing("departamentos"),
        "sufijo": USERS_SUFFIX,
        "nuevoUsuario": (request.GET.get("new_user") or "").strip(),
    }
    # Sin tickets cargados todavía la pantalla sigue sirviendo para dar de alta.
    try:
        data["pendientes"] = users_outside_directory()
    except Exception:
        logger.exception("No se pudieron calcular los usuarios fuera del directorio")
        data["pendientes"] = []
    try:
        data["trasBaja"] = tickets_after_churn()
    except Exception:
        logger.exception("No se pudieron calcular los tickets posteriores a las bajas")
        data["trasBaja"] = []
    return data


@endpoint(methods=["POST"], perms=PERM, rate="60/m", keys=SUPPORT_KEYS)
def user_save(request):
    """Alta o edición de un usuario o un departamento."""
    data = SUPPORT_KEYS.back(json_body(request))
    catalog = _catalog(data)
    if data.get("id"):
        row = catalog["model"].objects.filter(pk=data.get("id")).first()
        if row is None:
            raise ApiError("El registro ya no existe.", 404)
    else:
        row = catalog["model"]()
    try:
        with transaction.atomic():
            catalog["apply"](row, data)
            row.save()
            if after := catalog.get("after"):
                after(row)
    except IntegrityError as exc:
        raise ApiError(f"Ya existe un {catalog['label']} con ese nombre.", 409) from exc
    return {
        "status": "success",
        "message": f"{catalog['label'].capitalize()} guardado.",
        "registro": catalog["serialize"](row),
    }


@endpoint(methods=["POST"], perms=PERM, rate="60/m", keys=SUPPORT_KEYS)
def user_delete(request):
    """Baja de una fila. Un departamento referenciado no se borra (409)."""
    data = SUPPORT_KEYS.back(json_body(request))
    catalog = _catalog(data)
    row = catalog["model"].objects.filter(pk=data.get("id")).first()
    if row is None:
        return {"status": "success", "message": "El registro ya no existía."}
    try:
        row.delete()
    except ProtectedError as exc:
        raise ApiError(
            "No se puede eliminar este departamento: tiene usuarios asignados o alguien pasó por él. "
            "Reasígnalos primero; si solo aparece en la historia, se conserva para no dejar "
            "meses pasados sin departamento.",
            409,
        ) from exc
    return {"status": "success", "message": f"{catalog['label'].capitalize()} eliminado."}


def _change_department(user: UsuarioSoporte, data: dict) -> str:
    department = _related(Departamento, data, "departamento_id")
    user.cambiar_departamento(department, _date(data, "fecha", required=True))
    return f"{user.nombre_completo} pasa a {department.nombre}."


def _undo_change(user: UsuarioSoporte, data: dict) -> str:
    user.undo_last_change()
    return f"{user.nombre_completo} vuelve a {user.departamento.nombre}."


def _deactivate(user: UsuarioSoporte, data: dict) -> str:
    user.deactivate(_date(data, "fecha", required=True))
    return f"{user.nombre_completo} queda dado de baja."


def _reactivate(user: UsuarioSoporte, data: dict) -> str:
    user.reactivar()
    return f"{user.nombre_completo} vuelve a estar activo."


MOVES = {
    "cambiar_departamento": _change_department,
    "deshacer_cambio": _undo_change,
    "baja": _deactivate,
    "reactivar": _reactivate,
}


@endpoint(methods=["POST"], perms=PERM, rate="60/m", keys=SUPPORT_KEYS)
def user_move(request):
    """Cambio de departamento, baja o reactivación; las reglas viven en el modelo."""
    data = SUPPORT_KEYS.back(json_body(request))
    move = MOVES.get(str(data.get("accion") or ""))
    if move is None:
        raise ApiError("Acción desconocida.")
    user = UsuarioSoporte.objects.select_related("departamento").filter(pk=data.get("id")).first()
    if user is None:
        raise ApiError("El usuario ya no existe.", 404)
    try:
        message = move(user, data)
    except MovimientoInvalido as exc:
        raise ApiError(str(exc)) from exc
    return {"status": "success", "message": message, "registro": _user(user)}
