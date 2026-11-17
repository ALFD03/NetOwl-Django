"""`/api/auth/users/` y `/api/auth/groups/`: cuentas, grupos y su matriz de permisos.

Techo de toda la administración: nadie concede permisos ni unidades de negocio
que no tiene, ni toca una cuenta con más rango que la suya (`auth.can_act_on`).
"""

from __future__ import annotations

import logging

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from pydantic import BaseModel, Field

from services.config.auth import can_act_on, effective_permissions
from services.config.models import PERMISSION_FIELDS, PermissionGroup, Profile
from services.config.units import EMPTY_SCOPE, UnitScope, saved_units, unit_scope
from services.subscriptions.models import Coordinador

from .endpoint import ApiError, endpoint

logger = logging.getLogger(__name__)

ROLES = dict(Profile.ROLE_CHOICES)


class UnitsBody(BaseModel):
    ids: list[int] = []
    rf: bool = False


class UserBody(BaseModel):
    role: str = "viewer"
    group_id: int | None = None
    permissions: dict[str, bool] = {}
    unidades: UnitsBody = UnitsBody()


class CreateUserBody(UserBody):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=256)


class PasswordBody(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class GroupBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=255)
    permissions: dict[str, bool] = {}


# --- Lectura y escritura de la matriz ---

def matrix_of(target) -> dict[str, bool]:
    """La matriz guardada en un Profile o PermissionGroup."""
    return {field: bool(getattr(target, field, False)) for field in PERMISSION_FIELDS}


def read_matrix(permissions: dict[str, bool]) -> dict[str, bool]:
    """La matriz del cuerpo. **Un campo ausente vale False**."""
    return {field: bool(permissions.get(field, False)) for field in PERMISSION_FIELDS}


def apply_matrix(target, matrix: dict[str, bool]) -> None:
    for field, value in matrix.items():
        setattr(target, field, value)


def check_grant(actor, new: dict[str, bool], previous: dict[str, bool] | None = None) -> None:
    """403 si `new` concede algo que `previous` no tenía y `actor` tampoco tiene."""
    if actor.is_superuser:
        return
    own = effective_permissions(actor)
    previous = previous or {}
    outside = [f for f in PERMISSION_FIELDS if new.get(f) and not previous.get(f) and not own[f]]
    if outside:
        raise ApiError(
            "No puedes conceder permisos que tú no tienes: " + ", ".join(outside) + ".", 403, outside,
        )


def read_units(body: UnitsBody) -> UnitScope:
    """La lista de unidades del cuerpo; un id fuera del catálogo se descarta."""
    ids = frozenset(Coordinador.objects.filter(id__in=set(body.ids)).values_list("id", flat=True))
    return UnitScope(ids=ids, rf=body.rf)


def check_units(actor, new: UnitScope, previous: UnitScope) -> None:
    """403 si la lista `new` añade unidades que `actor` no ve."""
    own = unit_scope(actor)
    if own is None:
        return
    outside = sorted(
        Coordinador.objects.filter(id__in=new.ids - previous.ids - own.ids).values_list("nombre", flat=True)
    )
    if new.rf and not previous.rf and not own.rf:
        outside.append("RF")
    if outside:
        raise ApiError("No puedes conceder unidades de negocio que tú no ves: " + ", ".join(outside) + ".", 403)


def save_units(profile: Profile, units: UnitScope) -> None:
    profile.unidad_rf = units.rf
    profile.save(update_fields=["unidad_rf"])
    profile.unidades_negocio.set(units.ids)


def check_password(password: str, user: User) -> None:
    """400 con el motivo si la contraseña no pasa `AUTH_PASSWORD_VALIDATORS`."""
    try:
        validate_password(password, user=user)
    except ValidationError as exc:
        raise ApiError(" ".join(exc.messages)) from exc


def get_group(group_id: int) -> PermissionGroup:
    group = PermissionGroup.objects.filter(pk=group_id).first()
    if group is None:
        raise ApiError("Grupo no encontrado.", 404)
    return group


def editable_user(request, user_id: int) -> User:
    """La cuenta `user_id` si quien pide tiene rango para tocarla."""
    user = User.objects.select_related("profile").filter(pk=user_id).first()
    if user is None:
        raise ApiError("Usuario no encontrado.", 404)
    if not can_act_on(request.user, user):
        raise ApiError(
            "No puedes modificar una cuenta con permisos que tú no tienes (ni la de un superusuario).", 403,
        )
    return user


def check_role(role: str) -> None:
    if role not in ROLES:
        raise ApiError("Rol inválido.")


# --- Serialización ---

def serialize_permissions(target) -> dict[str, bool]:
    """Matriz lista para React; sin perfil, los valores por defecto del modelo."""
    if target is None:
        return {field: Profile._meta.get_field(field).default for field in PERMISSION_FIELDS}
    return {field: getattr(target, field) for field in PERMISSION_FIELDS}


def serialize_units(profile: Profile | None) -> dict:
    if profile is None:
        return {"ids": [], "rf": False}
    return {"ids": [c.id for c in profile.unidades_negocio.all()], "rf": profile.unidad_rf}


def management_payload(request) -> dict:
    """Todo lo que pinta la pantalla de usuarios y grupos."""
    users = (
        User.objects.select_related("profile", "profile__group")
        .prefetch_related("profile__unidades_negocio")
        .order_by("username")
    )
    own_group = getattr(getattr(request.user, "profile", None), "group_id", None)
    scope = unit_scope(request.user)
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "is_superuser": u.is_superuser,
                "role": u.profile.role if hasattr(u, "profile") else "viewer",
                "role_display": u.profile.get_role_display() if hasattr(u, "profile") else ROLES["viewer"],
                "group_id": u.profile.group_id if hasattr(u, "profile") else None,
                "group_name": u.profile.group.name if hasattr(u, "profile") and u.profile.group else None,
                "permissions": serialize_permissions(getattr(u, "profile", None)),
                "unidades": serialize_units(getattr(u, "profile", None)),
                "editable": u.id != request.user.id and can_act_on(request.user, u),
            }
            for u in users
        ],
        "groups": [
            {
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "members_count": g.members.count(),
                "permissions": serialize_permissions(g),
                # El grupo propio solo lo edita un superusuario: sería concederse permisos.
                "editable": request.user.is_superuser or g.id != own_group,
            }
            for g in PermissionGroup.objects.order_by("name")
        ],
        "roles": Profile.ROLE_CHOICES,
        "concedibles": effective_permissions(request.user),
        "unidadesNegocio": list(Coordinador.objects.order_by("nombre").values("id", "nombre")),
        "unidadesConcedibles": None if scope is None else {"ids": sorted(scope.ids), "rf": scope.rf},
    }


# --- Endpoints ---

@endpoint(
    methods=["GET", "POST"], perms={"GET": ["can_view_users"], "POST": ["can_create_users"]},
    rate={"POST": "10/m"}, body=CreateUserBody,
)
def users(request, body: CreateUserBody | None = None):
    """GET: la pantalla de administración. POST: crea una cuenta."""
    if request.method == "GET":
        return management_payload(request)
    username = body.username.strip()
    check_role(body.role)
    if User.objects.filter(username=username).exists():
        raise ApiError("El nombre de usuario ya existe.")

    group = get_group(body.group_id) if body.group_id else None
    matrix = matrix_of(group) if group else read_matrix(body.permissions)
    units = read_units(body.unidades)
    check_grant(request.user, matrix)
    check_units(request.user, units, EMPTY_SCOPE)
    check_password(body.password, User(username=username))

    with transaction.atomic():
        user = User.objects.create_user(username=username, password=body.password)
        profile = user.profile
        profile.role = body.role
        profile.group = group
        apply_matrix(profile, matrix)
        profile.save()
        save_units(profile, units)
    logger.info("Cuenta creada: %r por %r", username, request.user.username)
    return {"message": f"Usuario '{username}' creado con éxito.", "id": user.id}, 201


@endpoint(methods=["POST"], perms=["can_edit_user_permissions"], rate="20/m", body=UserBody)
def user_permissions(request, user_id: int, body: UserBody):
    """Rol, grupo, matriz y unidades de una cuenta. Asignar un grupo descarta la matriz individual."""
    if user_id == request.user.id and not request.user.is_superuser:
        raise ApiError("No puedes modificar tus propios permisos.")
    user = editable_user(request, user_id)
    profile = user.profile
    check_role(body.role)

    group = get_group(body.group_id) if body.group_id else None
    matrix = matrix_of(group) if group else read_matrix(body.permissions)
    units = read_units(body.unidades)
    check_grant(request.user, matrix, effective_permissions(user))
    check_units(request.user, units, saved_units(profile))

    profile.role = body.role
    profile.group = group
    apply_matrix(profile, matrix)
    with transaction.atomic():
        profile.save()
        save_units(profile, units)
    logger.info("Permisos actualizados de %r por %r", user.username, request.user.username)
    return {"message": f"Permisos de '{user.username}' actualizados."}


@endpoint(methods=["POST"], perms=["can_change_passwords"], rate="10/m", body=PasswordBody)
def user_password(request, user_id: int, body: PasswordBody):
    """Fija la contraseña de otra cuenta: es poder entrar como ella, por eso exige rango."""
    user = editable_user(request, user_id)
    check_password(body.password, user)
    user.set_password(body.password)
    user.save()
    logger.info("Contraseña de %r cambiada por %r", user.username, request.user.username)
    return {"message": f"Contraseña de '{user.username}' actualizada."}


@endpoint(methods=["DELETE"], perms=["can_delete_users"], rate="10/m")
def user_detail(request, user_id: int):
    """Elimina una cuenta; nunca la propia ni una de más rango."""
    if user_id == request.user.id:
        raise ApiError("No puedes eliminar tu propia cuenta.")
    user = editable_user(request, user_id)
    name = user.username
    user.delete()
    logger.info("Cuenta eliminada: %r por %r", name, request.user.username)
    return {"message": f"Usuario '{name}' eliminado del sistema."}


@endpoint(methods=["POST"], perms=["can_manage_groups"], rate="20/m", body=GroupBody)
def groups(request, body: GroupBody):
    """Crea un grupo."""
    return _save_group(request, PermissionGroup(), body), 201


@endpoint(methods=["POST", "DELETE"], perms=["can_manage_groups"], rate="20/m", body=GroupBody)
def group_detail(request, group_id: int, body: GroupBody | None = None):
    """POST: actualiza el grupo y resincroniza a sus miembros. DELETE: lo elimina."""
    group = get_group(group_id)
    if request.method == "DELETE":
        name = group.name
        group.delete()
        logger.info("Grupo de permisos eliminado: %r por %r", name, request.user.username)
        return {"message": f"Grupo '{name}' eliminado."}
    own_group = getattr(getattr(request.user, "profile", None), "group_id", None)
    if group.id == own_group and not request.user.is_superuser:
        raise ApiError("No puedes editar el grupo al que perteneces.", 403)
    return _save_group(request, group, body)


def _save_group(request, group: PermissionGroup, body: GroupBody) -> dict:
    matrix = read_matrix(body.permissions)
    check_grant(request.user, matrix, matrix_of(group) if group.pk else {})
    group.name = body.name.strip()
    group.description = body.description.strip()
    apply_matrix(group, matrix)
    with transaction.atomic():
        group.save()
        for member in group.members.all():
            member.sync_permissions_from_group()
    logger.info("Grupo de permisos guardado: %r por %r", group.name, request.user.username)
    return {"message": f"Grupo '{group.name}' guardado correctamente."}
