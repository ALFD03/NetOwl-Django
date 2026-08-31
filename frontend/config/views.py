# NetOwl-Django/frontend/config/views.py

import json
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import ensure_csrf_cookie
from .decorators import permission_required
from .models import Profile, PermissionGroup
from inertia import render as render_inertia

# Campos booleanos de permisos compartidos por Profile y PermissionGroup.
PERMISSION_FIELDS = [
    'can_view_subscriptions', 'can_view_crm', 'can_view_imports', 'can_view_support',
    'can_view_subs_analytics', 'can_view_subs_results', 'can_view_subs_lifetime',
    'can_view_subs_sales', 'can_view_eta', 'can_view_crm_analytics',
    'can_view_crm_results', 'can_view_support_analytics', 'can_view_support_results',
    'can_import_data', 'can_run_calculations', 'can_run_lifetime',
    'can_manage_eta', 'can_manage_users'
]


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
    if request.user.is_authenticated:
        return redirect('subscriptions:dashboard')
    
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
            return redirect('subscriptions:dashboard')
        else:
            error_message = "Credenciales incorrectas. Por favor intente de nuevo."
            
    if User.objects.count() == 0:
        return redirect('config:setup')
        
    return render_inertia(request, "Config/Login", {"errorMessage": error_message})

def logout_view(request):
    logout(request)
    return redirect('config:login')

def setup_view(request):
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
            profile.can_view_subscriptions = True
            profile.can_view_crm = True
            profile.can_view_imports = True
            profile.can_view_support = True
            profile.can_view_subs_analytics = True
            profile.can_view_subs_results = True
            profile.can_view_subs_lifetime = True
            profile.can_view_subs_sales = True
            profile.can_view_eta = True
            profile.can_view_crm_analytics = True
            profile.can_view_crm_results = True
            profile.can_view_support_analytics = True
            profile.can_view_support_results = True
            profile.can_import_data = True
            profile.can_run_calculations = True
            profile.can_run_lifetime = True
            profile.can_manage_eta = True
            profile.can_manage_users = True
            profile.save()
            return redirect('config:login')
            
    return render_inertia(request, "Config/Setup", {"errorMessage": error_message})

@login_required
@permission_required('can_manage_users')
def user_management_view(request):
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
            "permissions": {
                "can_view_subscriptions": prof.can_view_subscriptions if prof else True,
                "can_view_crm": prof.can_view_crm if prof else True,
                "can_view_imports": prof.can_view_imports if prof else True,
                "can_view_support": prof.can_view_support if prof else True,
                "can_view_subs_analytics": prof.can_view_subs_analytics if prof else True,
                "can_view_subs_results": prof.can_view_subs_results if prof else True,
                "can_view_subs_lifetime": prof.can_view_subs_lifetime if prof else True,
                "can_view_subs_sales": prof.can_view_subs_sales if prof else True,
                "can_view_eta": prof.can_view_eta if prof else True,
                "can_view_crm_analytics": prof.can_view_crm_analytics if prof else True,
                "can_view_crm_results": prof.can_view_crm_results if prof else True,
                "can_view_support_analytics": prof.can_view_support_analytics if prof else True,
                "can_view_support_results": prof.can_view_support_results if prof else True,
                "can_import_data": prof.can_import_data if prof else False,
                "can_run_calculations": prof.can_run_calculations if prof else False,
                "can_run_lifetime": prof.can_run_lifetime if prof else False,
                "can_manage_eta": prof.can_manage_eta if prof else False,
                "can_manage_users": prof.can_manage_users if prof else False,
            }
        })

    groups_data = []
    for g in groups:
        groups_data.append({
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "members_count": g.members.count(),
            "permissions": {
                "can_view_subscriptions": g.can_view_subscriptions,
                "can_view_crm": g.can_view_crm,
                "can_view_imports": g.can_view_imports,
                "can_view_support": g.can_view_support,
                "can_view_subs_analytics": g.can_view_subs_analytics,
                "can_view_subs_results": g.can_view_subs_results,
                "can_view_subs_lifetime": g.can_view_subs_lifetime,
                "can_view_subs_sales": g.can_view_subs_sales,
                "can_view_eta": g.can_view_eta,
                "can_view_crm_analytics": g.can_view_crm_analytics,
                "can_view_crm_results": g.can_view_crm_results,
                "can_view_support_analytics": g.can_view_support_analytics,
                "can_view_support_results": g.can_view_support_results,
                "can_import_data": g.can_import_data,
                "can_run_calculations": g.can_run_calculations,
                "can_run_lifetime": g.can_run_lifetime,
                "can_manage_eta": g.can_manage_eta,
                "can_manage_users": g.can_manage_users,
            }
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