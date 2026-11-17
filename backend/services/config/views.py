"""Administración de usuarios, grupos y permisos, y el cierre de sesión.

El primer administrador se crea con `manage.py crear_admin`.
"""

import json
import logging

from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from services.subscriptions.models import Coordinador

from .auth import can_act_on, effective_permissions
from .decorators import permission_required
from .models import PERMISSION_FIELDS, PermissionGroup, Profile
from .unidades import AlcanceUnidades, alcance_de, lista_de

logger = logging.getLogger(__name__)

ERROR_GENERICO = "Error interno del servidor. Consulte el registro de la aplicación."


def error_interno(contexto: str, status: int = 500) -> JsonResponse:
    """Registra la excepcion en curso y devuelve un mensaje sin interioridades.

    El cuerpo de la respuesta no puede llevar `str(e)`: una excepcion de
    psycopg2 trae el nombre del esquema, de la tabla y de las restricciones,
    y eso llegaba a cualquier usuario autenticado con `DEBUG` apagado.
    """
    logger.exception(contexto)
    return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=status)


def validar_clave(clave: str, usuario=None) -> str | None:
    """Devuelve el motivo por el que la contrasena no vale, o None si vale.

    Usa `AUTH_PASSWORD_VALIDATORS` (ver netowl_web/settings.py) en lugar de los
    `len(clave) < 8` sueltos que habia en tres sitios distintos —y que en
    `api_create_user` faltaban por completo, de modo que se podia crear una
    cuenta con una contrasena de un solo caracter.
    """
    try:
        validate_password(clave, user=usuario)
    except ValidationError as e:
        return " ".join(e.messages)
    return None


def matriz_de(objetivo) -> dict[str, bool]:
    """La matriz guardada en un Profile o PermissionGroup, campo a campo."""
    return {field: bool(getattr(objetivo, field, False)) for field in PERMISSION_FIELDS}


def matriz_efectiva(usuario) -> dict[str, bool]:
    """Lo que de verdad rige para una cuenta (ver `auth.effective_permissions`)."""
    return effective_permissions(usuario)


def permisos_fuera_de_alcance(actor, nueva: dict[str, bool], previa: dict[str, bool] | None = None) -> list[str]:
    """Los permisos que `nueva` concede, que `previa` no tenia y que `actor` no tiene.

    Es el techo de la administracion de cuentas: nadie concede lo que no tiene.
    Sin el, quien solo podia crear cuentas se creaba una con la matriz completa,
    entraba con ella y tenia todo; y quien podia editar grupos marcaba todo en el
    suyo. Quitar si se puede siempre: reducir permisos nunca escala.
    """
    if actor.is_superuser:
        return []
    propios = matriz_efectiva(actor)
    previa = previa or {}
    return [
        field for field in PERMISSION_FIELDS
        if nueva.get(field) and not previa.get(field) and not propios[field]
    ]


def respuesta_fuera_de_alcance(campos: list[str]) -> JsonResponse:
    """403 que nombra los permisos que se intentaron conceder sin tenerlos."""
    return JsonResponse(
        {
            "status": "error",
            "message": "No puedes conceder permisos que tú no tienes: " + ", ".join(campos) + ".",
            "permisos": campos,
        },
        status=403,
    )


def respuesta_sin_rango() -> JsonResponse:
    return JsonResponse(
        {
            "status": "error",
            "message": (
                "No puedes modificar una cuenta con permisos que tú no tienes "
                "(ni la de un superusuario)."
            ),
        },
        status=403,
    )


def leer_unidades(data) -> AlcanceUnidades:
    """La lista de unidades de negocio del usuario que viene en el payload.

    Llegan en `unidades: {ids, rf}`. Como la matriz, lo ausente vale vacio, y
    un id que no esta en el catalogo se descarta. Se lee tambien con grupo o
    con el interruptor de todas: la lista es del usuario y se conserva aunque
    no rija.
    """
    crudo = data.get("unidades") or {}
    if not isinstance(crudo, dict):
        crudo = {}
    pedidos = {i for i in (leer_id(v) for v in crudo.get("ids") or []) if i is not None}
    ids = frozenset(Coordinador.objects.filter(id__in=pedidos).values_list('id', flat=True))
    return AlcanceUnidades(ids=ids, rf=bool(crudo.get("rf")))


def unidades_fuera_de_alcance(actor, nueva: AlcanceUnidades, previa: AlcanceUnidades) -> list[str]:
    """Las unidades que la lista `nueva` anade a `previa` y que `actor` no ve.

    El mismo techo que `permisos_fuera_de_alcance`, para la lista de unidades.
    Se comparan las listas guardadas, rijan o no: una unidad escrita en la
    lista de alguien con el interruptor de todas volveria a regir el dia que se
    lo quitaran. Abrirlas todas es el permiso `can_view_all_business_units`, y
    lo comprueba aquella.
    """
    propio = alcance_de(actor)
    if propio is None:
        return []
    nuevas = nueva.ids - previa.ids - propio.ids
    fuera = sorted(Coordinador.objects.filter(id__in=nuevas).values_list('nombre', flat=True))
    if nueva.rf and not previa.rf and not propio.rf:
        fuera.append("RF")
    return fuera


def respuesta_unidades_fuera(nombres: list[str]) -> JsonResponse:
    """403 que nombra las unidades que se intentaron conceder sin verlas."""
    return JsonResponse(
        {
            "status": "error",
            "message": "No puedes conceder unidades de negocio que tú no ves: " + ", ".join(nombres) + ".",
        },
        status=403,
    )


def guardar_unidades(profile: Profile, lista: AlcanceUnidades) -> None:
    """Escribe la lista de unidades de un perfil ya guardado."""
    profile.unidad_rf = lista.rf
    profile.save(update_fields=['unidad_rf'])
    profile.unidades_negocio.set(lista.ids)


def serialize_unidades(profile: Profile | None) -> dict:
    """La lista de unidades de un perfil, lista para React."""
    if profile is None:
        return {"ids": [], "rf": False}
    return {"ids": [c.id for c in profile.unidades_negocio.all()], "rf": profile.unidad_rf}


def serialize_permissions(target):
    """Matriz de permisos de un Profile/PermissionGroup lista para React.

    Cuando la cuenta no tiene perfil se devuelven los valores por defecto del
    modelo, para que la UI no invente permisos que el backend no concede.
    """
    if target is None:
        return {field: Profile._meta.get_field(field).default for field in PERMISSION_FIELDS}
    return {field: getattr(target, field) for field in PERMISSION_FIELDS}


def leer_matriz(data) -> dict[str, bool]:
    """La matriz que viene en el payload.

    El cliente React los envia anidados en la clave "permissions"; se admiten
    tambien en la raiz del payload por compatibilidad con llamadas antiguas.

    **Un campo ausente vale False.** Antes se dejaba con su valor previo, asi
    que un payload incompleto no podia quitar un permiso y, con los `default`
    abiertos que tenia el modelo, un grupo recien creado nacia con toda la
    lectura concedida.
    """
    nested = data.get("permissions") or {}
    if not isinstance(nested, dict):
        nested = {}
    return {
        field: bool(nested[field]) if field in nested else bool(data.get(field, False))
        for field in PERMISSION_FIELDS
    }


def apply_permissions(target, matriz: dict[str, bool]):
    """Escribe la matriz sobre un Profile o PermissionGroup (sin guardar)."""
    for field, valor in matriz.items():
        setattr(target, field, valor)


def leer_id(valor) -> int | None:
    """Un id entero del payload, o None si no lo es."""
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


@require_POST
def logout_view(request):
    """Cierra la sesion y vuelve al formulario de entrada.

    Solo por POST: por GET, cualquier `<img src="/auth/logout/">` en una pagina
    ajena cerraba la sesion del visitante.
    """
    logout(request)
    return redirect('config:login')

@login_required
@permission_required('can_view_users')
def user_management_view(request):
    """Pantalla de administracion: usuarios, grupos y roles.

    Cada cuenta lleva `editable`: si quien mira tiene rango para tocarla (ver
    `auth.can_act_on`). La interfaz esconde las acciones de las que no; el
    servidor las rechaza igual.
    """
    users = (
        User.objects.all()
        .select_related('profile', 'profile__group')
        .prefetch_related('profile__unidades_negocio')
        .order_by('username')
    )
    groups = PermissionGroup.objects.all().order_by('name')

    users_data = []
    for u in users:
        prof = getattr(u, 'profile', None)
        users_data.append({
            "id": u.id,
            "username": u.username,
            "is_superuser": u.is_superuser,
            "role": prof.role if prof else 'viewer',
            "role_display": prof.get_role_display() if prof else 'Visualizador',
            "group_id": prof.group_id if prof else None,
            "group_name": prof.group.name if (prof and prof.group) else None,
            "permissions": serialize_permissions(prof),
            "unidades": serialize_unidades(prof),
            "editable": u.id != request.user.id and can_act_on(request.user, u),
        })

    mi_grupo = getattr(getattr(request.user, 'profile', None), 'group_id', None)
    groups_data = []
    for g in groups:
        groups_data.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "members_count": g.members.count(),
            "permissions": serialize_permissions(g),
            # El grupo propio no se edita salvo siendo superusuario: seria
            # concederse permisos a uno mismo.
            "editable": request.user.is_superuser or g.id != mi_grupo,
        })

    return render_inertia(request, "Config/Management", {
        "users": users_data,
        "groups": groups_data,
        "roles": Profile.ROLE_CHOICES,
        "section": "management",
        # Lo que puede conceder quien mira: el editor apaga el resto.
        "concedibles": matriz_efectiva(request.user),
        # El catalogo de unidades de negocio, y cuales puede conceder quien
        # mira (null: todas).
        "unidadesNegocio": list(Coordinador.objects.order_by('nombre').values('id', 'nombre')),
        "unidadesConcedibles": _alcance_para_react(alcance_de(request.user)),
    })


def _alcance_para_react(alcance: AlcanceUnidades | None) -> dict | None:
    return None if alcance is None else {"ids": sorted(alcance.ids), "rf": alcance.rf}


@login_required
@permission_required('can_create_users')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_create_user(request):
    """Crea una cuenta.

    Con `group_id` hereda la matriz del grupo; sin el, la que venga en el cuerpo.
    En los dos casos, solo con permisos que quien la crea ya tiene.
    """
    try:
        data = json.loads(request.body)
        usr = str(data.get("username") or "").strip()
        pas = str(data.get("password") or "")
        rol = str(data.get("role") or "viewer").strip()
        group_id = data.get("group_id")

        if not usr or not pas:
            return JsonResponse({"status": "error", "message": "Usuario y contraseña son requeridos."}, status=400)
        if rol not in dict(Profile.ROLE_CHOICES):
            return JsonResponse({"status": "error", "message": "Rol inválido."}, status=400)
        if User.objects.filter(username=usr).exists():
            return JsonResponse({"status": "error", "message": "El nombre de usuario ya existe."}, status=400)

        grp = None
        if group_id:
            grp = PermissionGroup.objects.filter(pk=leer_id(group_id)).first()
            if grp is None:
                return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
            matriz = matriz_de(grp)
        else:
            matriz = leer_matriz(data)
        # La lista de unidades es del usuario: se lee tambien con grupo.
        unidades = leer_unidades(data)
        fuera = permisos_fuera_de_alcance(request.user, matriz)
        if fuera:
            return respuesta_fuera_de_alcance(fuera)
        fuera = unidades_fuera_de_alcance(request.user, unidades, AlcanceUnidades(frozenset(), False))
        if fuera:
            return respuesta_unidades_fuera(fuera)

        motivo = validar_clave(pas, User(username=usr))
        if motivo:
            return JsonResponse({"status": "error", "message": motivo}, status=400)

        with transaction.atomic():
            user = User.objects.create_user(username=usr, password=pas)
            profile = user.profile
            profile.role = rol
            profile.group = grp
            apply_permissions(profile, matriz)
            profile.save()
            guardar_unidades(profile, unidades)
        logger.info("Cuenta creada: %r por %r", usr, request.user.username)
        return JsonResponse({"status": "success", "message": f"Usuario '{usr}' creado con éxito."})
    except Exception:
        return error_interno("Error al crear la cuenta")


def _cuenta_editable(request, uid) -> tuple[User | None, JsonResponse | None]:
    """La cuenta `uid` si quien pide puede tocarla, o la respuesta de error.

    Reune las tres comprobaciones que comparten todas las acciones sobre una
    cuenta ajena: que el id sea valido, que exista y que haya rango.
    """
    uid = leer_id(uid)
    if uid is None:
        return None, JsonResponse({"status": "error", "message": "ID de usuario inválido."}, status=400)
    user = User.objects.select_related('profile').filter(pk=uid).first()
    if user is None:
        return None, JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    if not can_act_on(request.user, user):
        return None, respuesta_sin_rango()
    return user, None


@login_required
@permission_required('can_edit_user_permissions')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_update_user_permissions(request):
    """Actualiza rol, grupo y permisos de una cuenta.

    Una cuenta no puede modificar sus propios permisos salvo que sea
    superusuario, ni alcanzar una con mas permisos que los suyos, ni conceder
    lo que no tiene. Asignar un grupo descarta los permisos individuales;
    quitarlo vuelve a aceptarlos del cuerpo.
    """
    try:
        data = json.loads(request.body)
        if leer_id(data.get("user_id")) == request.user.id and not request.user.is_superuser:
            return JsonResponse({"status": "error", "message": "No puedes modificar tus propios permisos."}, status=400)

        user, error = _cuenta_editable(request, data.get("user_id"))
        if error:
            return error
        profile = user.profile
        previa = matriz_efectiva(user)
        previas_unidades = lista_de(profile)

        rol = data.get("role", profile.role)
        if rol not in dict(Profile.ROLE_CHOICES):
            return JsonResponse({"status": "error", "message": "Rol inválido."}, status=400)

        group_id = data.get("group_id")
        grp = None
        if group_id:
            grp = PermissionGroup.objects.filter(pk=leer_id(group_id)).first()
            if grp is None:
                return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
            nueva = matriz_de(grp)
        else:
            nueva = leer_matriz(data)
        # La lista de unidades es del usuario: se lee tambien con grupo.
        unidades = leer_unidades(data)

        fuera = permisos_fuera_de_alcance(request.user, nueva, previa)
        if fuera:
            return respuesta_fuera_de_alcance(fuera)
        fuera = unidades_fuera_de_alcance(request.user, unidades, previas_unidades)
        if fuera:
            return respuesta_unidades_fuera(fuera)

        profile.role = rol
        profile.group = grp
        apply_permissions(profile, nueva)
        with transaction.atomic():
            profile.save()
            guardar_unidades(profile, unidades)
        logger.info("Permisos actualizados de %r por %r", user.username, request.user.username)
        return JsonResponse({"status": "success", "message": f"Permisos de '{user.username}' actualizados."})
    except Exception:
        return error_interno("Error al actualizar los permisos de la cuenta")


@login_required
@permission_required('can_manage_groups')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_save_permission_group(request):
    """Crea o actualiza un grupo y **resincroniza a todos sus miembros**.

    Nadie que no sea superusuario edita el grupo al que pertenece -seria
    concederse permisos a si mismo, la via que quedaba abierta despues de
    prohibir la auto-edicion de la cuenta-, ni concede en un grupo lo que el no
    tiene.
    """
    try:
        data = json.loads(request.body)
        group_id = data.get("group_id")
        name = str(data.get("name") or "").strip()
        description = str(data.get("description") or "").strip()

        if not name:
            return JsonResponse({"status": "error", "message": "El nombre del grupo es obligatorio."}, status=400)

        if group_id:
            group = PermissionGroup.objects.filter(pk=leer_id(group_id)).first()
            if group is None:
                return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
            mi_grupo = getattr(getattr(request.user, 'profile', None), 'group_id', None)
            if group.id == mi_grupo and not request.user.is_superuser:
                return JsonResponse(
                    {"status": "error", "message": "No puedes editar el grupo al que perteneces."},
                    status=403,
                )
            previa = matriz_de(group)
        else:
            group = PermissionGroup()
            previa = {}

        nueva = leer_matriz(data)
        fuera = permisos_fuera_de_alcance(request.user, nueva, previa)
        if fuera:
            return respuesta_fuera_de_alcance(fuera)

        group.name = name
        group.description = description
        apply_permissions(group, nueva)

        with transaction.atomic():
            group.save()
            # Sincronizar todos los miembros del grupo
            for member in group.members.all():
                member.sync_permissions_from_group()

        logger.info("Grupo de permisos guardado: %r por %r", group.name, request.user.username)
        return JsonResponse({"status": "success", "message": f"Grupo '{group.name}' guardado correctamente."})
    except Exception:
        return error_interno("Error al guardar el grupo de permisos")

@login_required
@permission_required('can_manage_groups')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_delete_permission_group(request):
    """Elimina un grupo. Sus miembros conservan la matriz que tenian copiada."""
    try:
        data = json.loads(request.body)
        group = PermissionGroup.objects.filter(pk=leer_id(data.get("group_id"))).first()
        if group is None:
            return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
        nombre = group.name
        group.delete()
        logger.info("Grupo de permisos eliminado: %r por %r", nombre, request.user.username)
        return JsonResponse({"status": "success", "message": f"Grupo '{nombre}' eliminado."})
    except Exception:
        return error_interno("Error al eliminar el grupo de permisos")

@login_required
@permission_required('can_edit_user_permissions')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_assign_user_group(request):
    """Vincula una cuenta a un grupo, o la desvincula con `group_id` vacio.

    Lleva las mismas comprobaciones que `api_update_user_permissions`: sin
    ellas, se podia meter a uno mismo -o a otro- en un grupo con mas permisos
    de los que uno tiene.
    """
    try:
        data = json.loads(request.body)
        if leer_id(data.get("user_id")) == request.user.id and not request.user.is_superuser:
            return JsonResponse(
                {"status": "error", "message": "No puedes cambiar tu propio grupo de permisos."},
                status=400,
            )

        user, error = _cuenta_editable(request, data.get("user_id"))
        if error:
            return error
        profile = user.profile

        group_id = data.get("group_id")
        if group_id:
            group = PermissionGroup.objects.filter(pk=leer_id(group_id)).first()
            if group is None:
                return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
            fuera = permisos_fuera_de_alcance(request.user, matriz_de(group), matriz_efectiva(user))
            if fuera:
                return respuesta_fuera_de_alcance(fuera)
            profile.group = group
            profile.sync_permissions_from_group()
            msg = f"Usuario '{user.username}' asignado al grupo '{group.name}'."
        else:
            profile.group = None
            profile.save()
            msg = f"Usuario '{user.username}' desvinculado del grupo."

        logger.info("Grupo de %r cambiado por %r", user.username, request.user.username)
        return JsonResponse({"status": "success", "message": msg})
    except Exception:
        return error_interno("Error al asignar el grupo de la cuenta")

@login_required
@permission_required('can_edit_user_permissions')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_update_user_role(request):
    """Cambia el rol descriptivo de una cuenta, sin tocar sus permisos."""
    try:
        data = json.loads(request.body)
        nuevo_rol = data.get("role")
        if nuevo_rol not in dict(Profile.ROLE_CHOICES):
            return JsonResponse({"status": "error", "message": "Rol inválido."}, status=400)

        user, error = _cuenta_editable(request, data.get("user_id"))
        if error:
            return error
        user.profile.role = nuevo_rol
        user.profile.save()
        return JsonResponse({"status": "success", "message": f"Rol de '{user.username}' actualizado."})
    except Exception:
        return error_interno("Error al actualizar el rol de la cuenta")

@login_required
@permission_required('can_delete_users')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_delete_user(request):
    """Elimina una cuenta. **No se puede borrar la propia ni una de mas rango.**"""
    try:
        data = json.loads(request.body)
        if leer_id(data.get("user_id")) == request.user.id:
            return JsonResponse({"status": "error", "message": "No puedes eliminar tu propia cuenta."}, status=400)

        user, error = _cuenta_editable(request, data.get("user_id"))
        if error:
            return error

        nombre = user.username
        user.delete()
        logger.info("Cuenta eliminada: %r por %r", nombre, request.user.username)
        return JsonResponse({"status": "success", "message": f"Usuario '{nombre}' eliminado del sistema."})
    except Exception:
        return error_interno("Error al eliminar la cuenta")

@login_required
@permission_required('can_change_passwords')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_admin_change_password(request):
    """Fija la contrasena de otra cuenta.

    La contrasena pasa por `AUTH_PASSWORD_VALIDATORS`, y el objetivo no puede
    tener permisos que quien la cambia no tiene: fijar la contrasena de otro es
    poder entrar como el.
    """
    try:
        data = json.loads(request.body)
        nueva_clave = str(data.get("password") or "")
        if not data.get("user_id") or not nueva_clave:
            return JsonResponse({"status": "error", "message": "ID y contraseña obligatorios."}, status=400)

        user, error = _cuenta_editable(request, data.get("user_id"))
        if error:
            return error

        motivo = validar_clave(nueva_clave, user)
        if motivo:
            return JsonResponse({"status": "error", "message": motivo}, status=400)

        user.set_password(nueva_clave)
        user.save()

        logger.info("Contraseña de %r cambiada por %r", user.username, request.user.username)
        return JsonResponse({"status": "success", "message": f"Contraseña de '{user.username}' actualizada."})
    except Exception:
        return error_interno("Error al cambiar la contraseña")
