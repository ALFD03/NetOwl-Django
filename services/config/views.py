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
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from netowl_web.ratelimit import ip_cliente

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


def puede_actuar_sobre(actor, objetivo) -> bool:
    """Si `actor` tiene rango para modificar la cuenta `objetivo`.

    `can_manage_users` no puede alcanzar a un superusuario: quien lo tuviera
    podia cambiarle la contrasena y entrar como el, y el superusuario se salta
    toda la matriz de permisos (ver `decorators._authorize`). Es la escalada
    de privilegios mas directa que tenia la aplicacion.
    """
    return actor.is_superuser or not objetivo.is_superuser


def serialize_permissions(target):
    """Matriz de permisos de un Profile/PermissionGroup lista para React.

    Cuando la cuenta no tiene perfil se devuelven los valores por defecto del
    modelo, para que la UI no invente permisos que el backend no concede.
    """
    if target is None:
        return {field: Profile._meta.get_field(field).default for field in PERMISSION_FIELDS}
    return {field: getattr(target, field) for field in PERMISSION_FIELDS}


def apply_permissions(target, data):
    """Aplica los permisos del payload sobre un Profile o PermissionGroup.

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
    for field in PERMISSION_FIELDS:
        if field in nested:
            setattr(target, field, bool(nested[field]))
        else:
            setattr(target, field, bool(data.get(field, False)))


@ensure_csrf_cookie
@ratelimit(key='post:username', rate='5/5m', method='POST', block=False)
@ratelimit(key='ip', rate='20/5m', method='POST', block=False)
def login_view(request):
    """Formulario de entrada. Acepta tanto JSON (React) como formulario.

    Dos limites en vez de uno: por usuario, que es lo que corta el ataque
    dirigido a una cuenta concreta, y por IP, que corta el rociado de una
    contrasena comun contra muchos usuarios.

    `block=False` es explicito y deliberado: el valor por defecto del decorador
    es True, que lanza `Ratelimited` y el middleware lo convierte en un JSON
    429 (ver netowl_web/middleware.py). Eso sirve para las APIs, pero aqui hay
    una pagina que renderizar y el usuario se quedaria sin formulario y sin
    explicacion. Con False el limite se consulta en `request.limited` y se
    responde con el mismo formulario y un mensaje.
    """
    if request.user.is_authenticated:
        return redirect(resolve_landing_url(request) or 'subscriptions:dashboard')

    error_message = None
    if request.method == "POST":
        # Soporta tanto payload JSON de Inertia/React como Form URL-Encoded
        if request.content_type == "application/json":
            try:
                body = json.loads(request.body)
                usr = body.get("username", "").strip()
                pas = body.get("password", "").strip()
            except json.JSONDecodeError:
                usr, pas = "", ""
        else:
            usr = request.POST.get("username", "").strip()
            pas = request.POST.get("password", "").strip()

        if getattr(request, 'limited', False):
            logger.warning(
                "Intentos de acceso bloqueados por limite: usuario=%r ip=%s",
                usr, ip_cliente(request),
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
@permission_required('can_manage_users')
def user_management_view(request):
    """Pantalla de administracion: usuarios, grupos y roles."""
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
        })

    groups_data = []
    for g in groups:
        groups_data.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "members_count": g.members.count(),
            "permissions": serialize_permissions(g),
        })

    return render_inertia(request, "Config/Management", {
        "users": users_data,
        "groups": groups_data,
        "roles": Profile.ROLE_CHOICES,
        "section": "management"
    })

@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_create_user(request):
    """Crea una cuenta.

    Con `group_id` hereda la matriz del grupo; sin el, la que venga en el cuerpo.
    """
    try:
        data = json.loads(request.body)
        usr = data.get("username", "").strip()
        pas = data.get("password", "").strip()
        rol = data.get("role", "viewer").strip()
        group_id = data.get("group_id")
        
        if not usr or not pas:
            return JsonResponse({"status": "error", "message": "Usuario y contraseña son requeridos."}, status=400)
        if User.objects.filter(username=usr).exists():
            return JsonResponse({"status": "error", "message": "El nombre de usuario ya existe."}, status=400)

        motivo = validar_clave(pas, User(username=usr))
        if motivo:
            return JsonResponse({"status": "error", "message": motivo}, status=400)

        user = User.objects.create_user(username=usr, password=pas)
        profile = user.profile
        profile.role = rol
        
        if group_id:
            try:
                grp = PermissionGroup.objects.get(pk=group_id)
                profile.group = grp
                profile.sync_permissions_from_group()
            except PermissionGroup.DoesNotExist:
                profile.group = None
        else:
            profile.group = None
            apply_permissions(profile, data)

        profile.save()
        logger.info("Cuenta creada: %r por %r", usr, request.user.username)
        return JsonResponse({"status": "success", "message": f"Usuario '{usr}' creado con éxito."})
    except Exception:
        return error_interno("Error al crear la cuenta")


@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_update_user_permissions(request):
    """Actualiza rol, grupo y permisos de una cuenta.

    Una cuenta no puede modificar sus propios permisos salvo que sea
    superusuario, ni alcanzar la de un superusuario si no lo es. Asignar un
    grupo descarta los permisos individuales; quitarlo vuelve a aceptarlos del
    cuerpo.
    """
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        
        if not uid:
            return JsonResponse({"status": "error", "message": "ID de usuario no enviado."}, status=400)

        try:
            uid = int(uid)
        except (TypeError, ValueError):
            return JsonResponse({"status": "error", "message": "ID de usuario inválido."}, status=400)

        if request.user.id == uid and not request.user.is_superuser:
            return JsonResponse({"status": "error", "message": "No puedes modificar tus propios permisos."}, status=400)
            
        user = User.objects.get(pk=uid)
        if not puede_actuar_sobre(request.user, user):
            return JsonResponse(
                {"status": "error", "message": "No puedes modificar la cuenta de un superusuario."},
                status=403,
            )
        profile = user.profile
        
        # 1. Actualizar Rol Descriptivo
        if "role" in data:
            profile.role = data.get("role", profile.role)

        # 2. Manejo de Grupo de Permisos vs Permisos Individuales
        group_id = data.get("group_id")
        if group_id:
            try:
                grp = PermissionGroup.objects.get(pk=group_id)
                profile.group = grp
                profile.sync_permissions_from_group()
            except PermissionGroup.DoesNotExist:
                profile.group = None
        else:
            profile.group = None
            # Guardar permisos individuales explícitos
            apply_permissions(profile, data)

        profile.save()
        logger.info("Permisos actualizados de %r por %r", user.username, request.user.username)
        return JsonResponse({"status": "success", "message": f"Permisos de '{user.username}' actualizados."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception:
        return error_interno("Error al actualizar los permisos de la cuenta")


@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_save_permission_group(request):
    """Crea o actualiza un grupo y **resincroniza a todos sus miembros**."""
    try:
        data = json.loads(request.body)
        group_id = data.get("group_id")
        name = data.get("name", "").strip()
        description = data.get("description", "").strip()

        if not name:
            return JsonResponse({"status": "error", "message": "El nombre del grupo es obligatorio."}, status=400)

        if group_id:
            try:
                group = PermissionGroup.objects.get(pk=group_id)
            except PermissionGroup.DoesNotExist:
                return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
            group.name = name
            group.description = description
        else:
            group = PermissionGroup(name=name, description=description)

        apply_permissions(group, data)

        group.save()

        # Sincronizar todos los miembros del grupo
        for member in group.members.all():
            member.sync_permissions_from_group()

        logger.info("Grupo de permisos guardado: %r por %r", group.name, request.user.username)
        return JsonResponse({"status": "success", "message": f"Grupo '{group.name}' guardado correctamente."})
    except Exception:
        return error_interno("Error al guardar el grupo de permisos")

@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_delete_permission_group(request):
    """Elimina un grupo. Sus miembros conservan la matriz que tenian copiada."""
    try:
        data = json.loads(request.body)
        group_id = data.get("group_id")
        PermissionGroup.objects.filter(pk=group_id).delete()
        logger.info("Grupo de permisos eliminado: %r por %r", group_id, request.user.username)
        return JsonResponse({"status": "success", "message": "Grupo de permisos eliminado."})
    except Exception:
        return error_interno("Error al eliminar el grupo de permisos")

@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_assign_user_group(request):
    """Vincula una cuenta a un grupo, o la desvincula con `group_id` vacio.

    Lleva la misma comprobacion de auto-edicion que
    `api_update_user_permissions`: sin ella, un administrador sin superusuario
    se reasignaba a si mismo a un grupo con la matriz completa, que era la via
    para saltarse esa comprobacion.
    """
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        group_id = data.get("group_id")

        try:
            uid = int(uid)
        except (TypeError, ValueError):
            return JsonResponse({"status": "error", "message": "ID de usuario inválido."}, status=400)

        if request.user.id == uid and not request.user.is_superuser:
            return JsonResponse(
                {"status": "error", "message": "No puedes cambiar tu propio grupo de permisos."},
                status=400,
            )

        user = User.objects.get(pk=uid)
        if not puede_actuar_sobre(request.user, user):
            return JsonResponse(
                {"status": "error", "message": "No puedes modificar la cuenta de un superusuario."},
                status=403,
            )
        profile = user.profile

        if group_id:
            try:
                group = PermissionGroup.objects.get(pk=group_id)
            except PermissionGroup.DoesNotExist:
                return JsonResponse({"status": "error", "message": "Grupo no encontrado."}, status=404)
            profile.group = group
            profile.sync_permissions_from_group()
            msg = f"Usuario '{user.username}' asignado al grupo '{group.name}'."
        else:
            profile.group = None
            profile.save()
            msg = f"Usuario '{user.username}' desvinculado del grupo."

        logger.info("Grupo de %r cambiado por %r", user.username, request.user.username)
        return JsonResponse({"status": "success", "message": msg})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception:
        return error_interno("Error al asignar el grupo de la cuenta")

@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='20/m', block=True)
@require_POST
def api_update_user_role(request):
    """Cambia el rol descriptivo de una cuenta, sin tocar sus permisos."""
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        nuevo_rol = data.get("role")

        if nuevo_rol not in dict(Profile.ROLE_CHOICES):
            return JsonResponse({"status": "error", "message": "Rol inválido."}, status=400)

        user = User.objects.get(pk=uid)
        if not puede_actuar_sobre(request.user, user):
            return JsonResponse(
                {"status": "error", "message": "No puedes modificar la cuenta de un superusuario."},
                status=403,
            )
        user.profile.role = nuevo_rol
        user.profile.save()
        return JsonResponse({"status": "success", "message": "Rol actualizado."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception:
        return error_interno("Error al actualizar el rol de la cuenta")

@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_delete_user(request):
    """Elimina una cuenta. **No se puede borrar la propia ni la de un superusuario.**"""
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")

        try:
            uid = int(uid)
        except (TypeError, ValueError):
            return JsonResponse({"status": "error", "message": "ID de usuario inválido."}, status=400)

        if request.user.id == uid:
            return JsonResponse({"status": "error", "message": "No puedes eliminar tu propia cuenta."}, status=400)

        user = User.objects.filter(pk=uid).first()
        if user is None:
            return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
        if not puede_actuar_sobre(request.user, user):
            return JsonResponse(
                {"status": "error", "message": "No puedes eliminar la cuenta de un superusuario."},
                status=403,
            )

        nombre = user.username
        user.delete()
        logger.info("Cuenta eliminada: %r por %r", nombre, request.user.username)
        return JsonResponse({"status": "success", "message": "Usuario eliminado del sistema."})
    except Exception:
        return error_interno("Error al eliminar la cuenta")

@login_required
@permission_required('can_manage_users')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_admin_change_password(request):
    """Fija la contrasena de otra cuenta.

    La contrasena pasa por `AUTH_PASSWORD_VALIDATORS`, y el objetivo no puede
    ser un superusuario salvo que quien la cambia tambien lo sea: ese era el
    camino corto de `can_manage_users` a superusuario.
    """
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        nueva_clave = data.get("password", "").strip()
        
        if not uid or not nueva_clave:
            return JsonResponse({"status": "error", "message": "ID y contraseña obligatorios."}, status=400)

        user = User.objects.get(pk=uid)
        if not puede_actuar_sobre(request.user, user):
            return JsonResponse(
                {"status": "error", "message": "No puedes cambiar la contraseña de un superusuario."},
                status=403,
            )

        motivo = validar_clave(nueva_clave, user)
        if motivo:
            return JsonResponse({"status": "error", "message": motivo}, status=400)

        user.set_password(nueva_clave)
        user.save()

        logger.info("Contraseña de %r cambiada por %r", user.username, request.user.username)
        return JsonResponse({"status": "success", "message": f"Contraseña de '{user.username}' actualizada."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception:
        return error_interno("Error al cambiar la contraseña")
