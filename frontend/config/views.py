# --- START OF FILE NetOwl-Django/frontend/config/views.py ---
import json
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from .decorators import permission_required
from .models import Profile, PermissionGroup

def login_view(request):
    if request.user.is_authenticated:
        return redirect('subscriptions:dashboard')
    
    error_message = None
    if request.method == "POST":
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
        
    return render(request, "config/login.html", {"error_message": error_message})

def logout_view(request):
    logout(request)
    return redirect('config:login')

def setup_view(request):
    """Crea la primera cuenta Administradora únicamente si la BD está vacía."""
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
            profile.can_view_subs_analytics = True
            profile.can_view_subs_results = True
            profile.can_view_subs_lifetime = True
            profile.can_view_subs_sales = True
            profile.can_view_eta = True
            profile.can_view_crm_analytics = True
            profile.can_view_crm_results = True
            profile.can_import_data = True
            profile.can_run_calculations = True
            profile.can_run_lifetime = True
            profile.can_manage_eta = True
            profile.can_manage_users = True
            profile.save()
            return redirect('config:login')
            
    return render(request, "config/setup.html", {"error_message": error_message})

@login_required
@permission_required('can_manage_users')
def user_management_view(request):
    """Pantalla para administrar usuarios, sus permisos y sus grupos."""
    users = User.objects.all().select_related('profile', 'profile__group').order_by('username')
    groups = PermissionGroup.objects.all().order_by('name')
    roles = Profile.ROLE_CHOICES
    return render(request, "config/management.html", {
        "users": users,
        "groups": groups,
        "roles": roles,
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
                pass
        else:
            profile.can_view_subscriptions = bool(data.get("can_view_subscriptions", True))
            profile.can_view_crm = bool(data.get("can_view_crm", True))
            profile.can_view_imports = bool(data.get("can_view_imports", True)) # <-- NUEVO
            profile.can_view_subs_analytics = bool(data.get("can_view_subs_analytics", True))
            profile.can_view_subs_results = bool(data.get("can_view_subs_results", True))
            profile.can_view_subs_lifetime = bool(data.get("can_view_subs_lifetime", True))
            profile.can_view_subs_sales = bool(data.get("can_view_subs_sales", True))
            profile.can_view_eta = bool(data.get("can_view_eta", True))
            profile.can_view_crm_analytics = bool(data.get("can_view_crm_analytics", True))
            profile.can_view_crm_results = bool(data.get("can_view_crm_results", True))
            profile.can_import_data = bool(data.get("can_import_data", False))
            profile.can_run_calculations = bool(data.get("can_run_calculations", False))
            profile.can_run_lifetime = bool(data.get("can_run_lifetime", False))
            profile.can_manage_eta = bool(data.get("can_manage_eta", False))
            profile.can_manage_users = bool(data.get("can_manage_users", False))
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
        
        if request.user.id == int(uid) and not request.user.is_superuser:
            return JsonResponse({"status": "error", "message": "No puedes modificar tus propios permisos."}, status=400)
            
        user = User.objects.get(pk=uid)
        profile = user.profile
        profile.group = None # Desvincula de grupo al personalizar
        
        profile.can_view_subscriptions = bool(data.get("can_view_subscriptions", True))
        profile.can_view_crm = bool(data.get("can_view_crm", True))
        profile.can_view_imports = bool(data.get("can_view_imports", True)) # <-- NUEVO
        profile.can_view_subs_analytics = bool(data.get("can_view_subs_analytics", True))
        profile.can_view_subs_results = bool(data.get("can_view_subs_results", True))
        profile.can_view_subs_lifetime = bool(data.get("can_view_subs_lifetime", True))
        profile.can_view_subs_sales = bool(data.get("can_view_subs_sales", True))
        profile.can_view_eta = bool(data.get("can_view_eta", True))
        profile.can_view_crm_analytics = bool(data.get("can_view_crm_analytics", True))
        profile.can_view_crm_results = bool(data.get("can_view_crm_results", True))
        profile.can_import_data = bool(data.get("can_import_data", False))
        profile.can_run_calculations = bool(data.get("can_run_calculations", False))
        profile.can_run_lifetime = bool(data.get("can_run_lifetime", False))
        profile.can_manage_eta = bool(data.get("can_manage_eta", False))
        profile.can_manage_users = bool(data.get("can_manage_users", False))
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

        group.can_view_subscriptions = bool(data.get("can_view_subscriptions", True))
        group.can_view_crm = bool(data.get("can_view_crm", True))
        group.can_view_imports = bool(data.get("can_view_imports", True)) # <-- NUEVO
        group.can_view_subs_analytics = bool(data.get("can_view_subs_analytics", True))
        group.can_view_subs_results = bool(data.get("can_view_subs_results", True))
        group.can_view_subs_lifetime = bool(data.get("can_view_subs_lifetime", True))
        group.can_view_subs_sales = bool(data.get("can_view_subs_sales", True))
        group.can_view_eta = bool(data.get("can_view_eta", True))
        group.can_view_crm_analytics = bool(data.get("can_view_crm_analytics", True))
        group.can_view_crm_results = bool(data.get("can_view_crm_results", True))
        group.can_import_data = bool(data.get("can_import_data", False))
        group.can_run_calculations = bool(data.get("can_run_calculations", False))
        group.can_run_lifetime = bool(data.get("can_run_lifetime", False))
        group.can_manage_eta = bool(data.get("can_manage_eta", False))
        group.can_manage_users = bool(data.get("can_manage_users", False))
        group.save()

        for member in group.members.all():
            member.sync_permissions_from_group()

        return JsonResponse({"status": "success", "message": f"Grupo '{group.name}' guardado correctamente."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_users')
@require_POST
def api_delete_permission_group(request):
    """Elimina un Grupo de Permisos."""
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
    """Asigna un usuario a un Grupo de Permisos o lo desvincula para personalizarlo."""
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

# --- APIS EXISTENTES ---

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
# --- END OF FILE NetOwl-Django/frontend/config/views.py ---