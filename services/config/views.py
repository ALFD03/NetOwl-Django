"""Autenticacion y administracion de usuarios, grupos y permisos.

Son las unicas vistas sin dominio de negocio: entrar, salir, crear la primera
cuenta y mantener la matriz de permisos de las demas.
"""

# NetOwl-Django/frontend/config/views.py

import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from inertia import render as render_inertia

from .decorators import permission_required, resolve_landing_url
from .models import PERMISSION_FIELDS, PermissionGroup, Profile, default_permissions


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
    """
    nested = data.get("permissions") or {}
    if not isinstance(nested, dict):
        nested = {}
    for field in PERMISSION_FIELDS:
        if field in nested:
            setattr(target, field, bool(nested[field]))
        elif field in data:
            setattr(target, field, bool(data[field]))


@ensure_csrf_cookie
def login_view(request):
    """Formulario de entrada. Acepta tanto JSON (React) como formulario.

    Si no existe ningun usuario redirige al alta inicial; si ya hay sesion, a la
    primera pagina que esa cuenta pueda abrir.
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

        user = authenticate(request, username=usr, password=pas)
        if user is not None:
            login(request, user)
            return redirect(resolve_landing_url(request) or 'subscriptions:dashboard')
        else:
            error_message = "Credenciales incorrectas. Por favor intente de nuevo."
            
    if User.objects.count() == 0:
        return redirect('config:setup')
        
    return render_inertia(request, "Config/Login", {"errorMessage": error_message})

def logout_view(request):
    """Cierra la sesion y vuelve al formulario de entrada."""
    logout(request)
    return redirect('config:login')

def setup_view(request):
    """Alta del primer administrador. Se cierra en cuanto existe un usuario.

    La cuenta se crea como superusuario y recibe la matriz completa.
    """
    if User.objects.count() > 0:
        return redirect('config:login')
        
    error_message = None
    if request.method == "POST":
        usr = request.POST.get("username", "").strip()
        pas = request.POST.get("password", "").strip()
        pas_conf = request.POST.get("password_confirm", "").strip()
        
        if len(pas) < 8:
            error_message = "La contraseña debe tener al menos 8 caracteres."
        elif pas != pas_conf:
            error_message = "Las contraseñas no coinciden."
        else:
            user = User.objects.create_superuser(username=usr, password=pas)
            profile = user.profile
            profile.role = 'admin'
            # El primer administrador recibe la matriz completa.
            for field, value in default_permissions(full_access=True).items():
                setattr(profile, field, value)
            profile.save()
            return redirect('config:login')
            
    return render_inertia(request, "Config/Setup", {"errorMessage": error_message})

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
        return JsonResponse({"status": "success", "message": f"Usuario '{usr}' creado con éxito."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@login_required
@permission_required('can_manage_users')
@require_POST
def api_update_user_permissions(request):
    """Actualiza rol, grupo y permisos de una cuenta.

    Una cuenta no puede modificar sus propios permisos salvo que sea
    superusuario. Asignar un grupo descarta los permisos individuales; quitarlo
    vuelve a aceptarlos del cuerpo.
    """
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        
        if not uid:
            return JsonResponse({"status": "error", "message": "ID de usuario no enviado."}, status=400)

        if request.user.id == int(uid) and not request.user.is_superuser:
            return JsonResponse({"status": "error", "message": "No puedes modificar tus propios permisos."}, status=400)
            
        user = User.objects.get(pk=uid)
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
        return JsonResponse({"status": "success", "message": f"Permisos de '{user.username}' actualizados."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@login_required
@permission_required('can_manage_users')
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
            group = PermissionGroup.objects.get(pk=group_id)
            group.name = name
            group.description = description
        else:
            group = PermissionGroup(name=name, description=description)

        apply_permissions(group, data)

        group.save()

        # Sincronizar todos los miembros del grupo
        for member in group.members.all():
            member.sync_permissions_from_group()

        return JsonResponse({"status": "success", "message": f"Grupo '{group.name}' guardado correctamente."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_users')
@require_POST
def api_delete_permission_group(request):
    """Elimina un grupo. Sus miembros conservan la matriz que tenian copiada."""
    try:
        data = json.loads(request.body)
        group_id = data.get("group_id")
        PermissionGroup.objects.filter(pk=group_id).delete()
        return JsonResponse({"status": "success", "message": "Grupo de permisos eliminado."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_users')
@require_POST
def api_assign_user_group(request):
    """Vincula una cuenta a un grupo, o la desvincula con `group_id` vacio."""
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        group_id = data.get("group_id")

        user = User.objects.get(pk=uid)
        profile = user.profile

        if group_id:
            group = PermissionGroup.objects.get(pk=group_id)
            profile.group = group
            profile.sync_permissions_from_group()
            msg = f"Usuario '{user.username}' asignado al grupo '{group.name}'."
        else:
            profile.group = None
            profile.save()
            msg = f"Usuario '{user.username}' desvinculado del grupo."

        return JsonResponse({"status": "success", "message": msg})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_users')
@require_POST
def api_update_user_role(request):
    """Cambia el rol descriptivo de una cuenta, sin tocar sus permisos."""
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        nuevo_rol = data.get("role")
        
        user = User.objects.get(pk=uid)
        user.profile.role = nuevo_rol
        user.profile.save()
        return JsonResponse({"status": "success", "message": "Rol actualizado."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_users')
@require_POST
def api_delete_user(request):
    """Elimina una cuenta. **No se puede borrar la propia.**"""
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        
        if request.user.id == int(uid):
            return JsonResponse({"status": "error", "message": "No puedes eliminar tu propia cuenta."}, status=400)
            
        User.objects.filter(pk=uid).delete()
        return JsonResponse({"status": "success", "message": "Usuario eliminado del sistema."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_users')
@require_POST
def api_admin_change_password(request):
    """Fija la contrasena de otra cuenta. Minimo ocho caracteres."""
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        nueva_clave = data.get("password", "").strip()
        
        if not uid or not nueva_clave:
            return JsonResponse({"status": "error", "message": "ID y contraseña obligatorios."}, status=400)
            
        if len(nueva_clave) < 8:
            return JsonResponse({"status": "error", "message": "La contraseña debe tener al menos 8 caracteres."}, status=400)
            
        user = User.objects.get(pk=uid)
        user.set_password(nueva_clave)
        user.save()
        
        return JsonResponse({"status": "success", "message": f"Contraseña de '{user.username}' actualizada."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)