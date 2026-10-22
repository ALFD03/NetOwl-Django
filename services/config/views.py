"""Autenticacion y administracion de usuarios, grupos y permisos.

Son las unicas vistas sin dominio de negocio: entrar, salir y mantener la
matriz de permisos de las demas cuentas.

El alta del primer administrador ya no vive aqui: era una vista publica
guardada solo por `User.objects.count() == 0`, con la carrera que eso implica
y con la posibilidad de reabrirse si la tabla de usuarios quedaba vacia. Ahora
es `manage.py crear_admin`, igual que `preparar_sesiones` y `preparar_imports`
son comandos y no vistas.
"""

# NetOwl-Django/frontend/config/views.py

import json
import logging

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django_ratelimit.core import get_usage
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from netowl_web.ratelimit import ip_cliente, usuario_login
from services.auditoria.models import RegistroAuditoria
from services.auditoria.registro import registrar

from .decorators import permission_required, resolve_landing_url
from .models import PERMISSION_FIELDS, PermissionGroup, Profile

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
    """Lo que de verdad rige para una cuenta.

    Todo si es superusuario; la del grupo si pertenece a uno (el perfil le
    delega cada comprobacion); la suya si no.
    """
    if usuario.is_superuser:
        return {field: True for field in PERMISSION_FIELDS}
    profile = getattr(usuario, 'profile', None)
    if profile is None:
        return {field: False for field in PERMISSION_FIELDS}
    return {field: bool(profile.has_permission(field)) for field in PERMISSION_FIELDS}


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


def puede_actuar_sobre(actor, objetivo) -> bool:
    """Si `actor` tiene rango para tocar la cuenta `objetivo`.

    Dos reglas. Un superusuario solo lo toca otro superusuario: quien tuviera
    permiso de cambiar contrasenas podia cambiarle la suya y entrar como el, y
    el superusuario se salta toda la matriz (ver `decorators._authorize`). Y,
    por la misma razon, nadie toca una cuenta **con permisos que el no tiene**:
    cambiarle la contrasena, editarla o borrarla seria hacerse con ellos o
    quitarselos a alguien de mas rango.
    """
    if actor.is_superuser:
        return True
    if objetivo.is_superuser:
        return False
    propios = matriz_efectiva(actor)
    return all(propios[field] for field, valor in matriz_efectiva(objetivo).items() if valor)


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


# Los dos limites del formulario de entrada. Solo cuentan los intentos
# **fallidos**: con el decorador contaban todos, asi que entrar y salir unas
# cuantas veces seguidas bloqueaba a quien lo hacia.
LIMITES_LOGIN = (
    # Por cuenta: corta el ataque dirigido a un usuario concreto.
    {"group": "login-usuario", "key": usuario_login, "rate": "5/5m"},
    # Por IP: corta el rociado de una contrasena comun contra muchas cuentas.
    {"group": "login-ip", "key": "ip", "rate": "20/5m"},
)


def login_bloqueado(request) -> bool:
    """Si alguno de los dos limites ya esta agotado, sin contar este intento."""
    for limite in LIMITES_LOGIN:
        uso = get_usage(request, method="POST", increment=False, **limite)
        if uso is not None and (uso["should_limit"] or uso["count"] >= uso["limit"]):
            return True
    return False


def contar_fallo_login(request) -> None:
    """Suma el intento fallido a los dos limites."""
    for limite in LIMITES_LOGIN:
        get_usage(request, method="POST", increment=True, **limite)


def credenciales_del_cuerpo(request) -> tuple[str, str]:
    """Usuario y contrasena, vengan en JSON (Inertia) o en formulario.

    La contrasena **no** se recorta: un espacio al principio o al final es
    parte de ella. Antes se aplicaba `.strip()` y una contrasena con espacios
    se aceptaba tambien sin ellos.
    """
    if request.content_type == "application/json":
        try:
            body = json.loads(request.body)
        except (ValueError, UnicodeDecodeError):
            return "", ""
        if not isinstance(body, dict):
            return "", ""
        return str(body.get("username") or "").strip(), str(body.get("password") or "")
    return request.POST.get("username", "").strip(), request.POST.get("password", "")


@ensure_csrf_cookie
def login_view(request):
    """Formulario de entrada. Acepta tanto JSON (React) como formulario.

    Dos limites (ver `LIMITES_LOGIN`): por cuenta y por IP, y solo cuentan los
    fallos. No se usa el decorador `@ratelimit`: su `key='post:username'` leia
    `request.POST`, vacio en las peticiones JSON de Inertia, y todos los
    intentos de la empresa caian en el mismo cubo (ver `usuario_login`).

    El cuerpo de una peticion anonima no puede pasar de unos pocos KB: lo corta
    `LimiteCuerpoAnonimoMiddleware` antes de llegar aqui.
    """
    if request.user.is_authenticated:
        return redirect(resolve_landing_url(request) or 'subscriptions:dashboard')

    error_message = None
    if request.method == "POST":
        usr, pas = credenciales_del_cuerpo(request)

        if login_bloqueado(request):
            logger.warning(
                "Intentos de acceso bloqueados por limite: usuario=%r ip=%s",
                usr, ip_cliente(request),
            )
            registrar(
                request,
                modulo="config",
                accion="login_bloqueado",
                descripcion="Intento de acceso rechazado por exceso de intentos fallidos.",
                objeto=f"username={usr}"[:255] if usr else "",
                resultado=RegistroAuditoria.LIMITADO,
            )
            error_message = (
                "Demasiados intentos fallidos. Espere unos minutos antes de reintentar."
            )
        else:
            user = authenticate(request, username=usr, password=pas)
            if user is not None:
                logger.info("Acceso correcto: usuario=%r ip=%s", usr, ip_cliente(request))
                login(request, user)
                return redirect(resolve_landing_url(request) or 'subscriptions:dashboard')

            contar_fallo_login(request)
            # Sin esta linea un ataque de fuerza bruta no dejaba rastro en
            # ningun sitio: el limite lo corta, pero nadie se entera.
            logger.warning(
                "Credenciales incorrectas: usuario=%r ip=%s", usr, ip_cliente(request)
            )
            error_message = "Credenciales incorrectas. Por favor intente de nuevo."

    return render_inertia(request, "Config/Login", {"errorMessage": error_message})


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
    `puede_actuar_sobre`). La interfaz esconde las acciones de las que no; el
    servidor las rechaza igual.
    """
    users = User.objects.all().select_related('profile', 'profile__group').order_by('username')
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
            "editable": u.id != request.user.id and puede_actuar_sobre(request.user, u),
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
    })


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
        fuera = permisos_fuera_de_alcance(request.user, matriz)
        if fuera:
            return respuesta_fuera_de_alcance(fuera)

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
    if not puede_actuar_sobre(request.user, user):
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

        fuera = permisos_fuera_de_alcance(request.user, nueva, previa)
        if fuera:
            return respuesta_fuera_de_alcance(fuera)

        profile.role = rol
        profile.group = grp
        apply_permissions(profile, nueva)
        profile.save()
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
