# frontend/config/views.py
import json
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from .decorators import admin_required
from .models import Profile

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
            
    # Si la base de datos no tiene usuarios, redirige al setup inicial
    if User.objects.count() == 0:
        return redirect('config:setup')
        
    return render(request, "config/login.html", {"error_message": error_message})

def logout_view(request):
    logout(request)
    return redirect('config:login')

def setup_view(request):
    """Permite crear el primer usuario Administrador únicamente si la base de datos está vacía."""
    if User.objects.count() > 0:
        return redirect('config:login')
        
    error_message = None
    success_message = None
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
            user.profile.role = 'admin'
            user.profile.save()
            return redirect('config:login')
            
    return render(request, "config/setup.html", {"error_message": error_message})

@login_required
@admin_required
def user_management_view(request):
    """Módulo de configuración para gestionar usuarios y sus roles (Solo Administradores)."""
    users = User.objects.all().select_related('profile').order_by('username')
    roles = Profile.ROLE_CHOICES
    return render(request, "config/management.html", {
        "users": users,
        "roles": roles,
        "section": "management"
    })

@login_required
@admin_required
@require_POST
def api_create_user(request):
    try:
        data = json.loads(request.body)
        usr = data.get("username", "").strip()
        pas = data.get("password", "").strip()
        rol = data.get("role", "viewer").strip()
        
        if not usr or not pas:
            return JsonResponse({"status": "error", "message": "Usuario y contraseña son requeridos."}, status=400)
        if User.objects.filter(username=usr).exists():
            return JsonResponse({"status": "error", "message": "El nombre de usuario ya existe."}, status=400)
            
        user = User.objects.create_user(username=usr, password=pas)
        user.profile.role = rol
        user.profile.save()
        
        return JsonResponse({"status": "success", "message": f"Usuario {usr} creado con éxito."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@admin_required
@require_POST
def api_update_user_role(request):
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        nuevo_rol = data.get("role")
        
        if request.user.id == int(uid):
            return JsonResponse({"status": "error", "message": "No puedes cambiar tu propio rol administrador."}, status=400)
            
        user = User.objects.get(pk=uid)
        user.profile.role = nuevo_rol
        user.profile.save()
        return JsonResponse({"status": "success", "message": "Rol actualizado correctamente."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@admin_required
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
@admin_required
@require_POST
def api_admin_change_password(request):
    try:
        data = json.loads(request.body)
        uid = data.get("user_id")
        nueva_clave = data.get("password", "").strip()
        
        if not uid or not nueva_clave:
            return JsonResponse({"status": "error", "message": "ID de usuario y nueva contraseña obligatorios."}, status=400)
            
        if len(nueva_clave) < 8:
            return JsonResponse({"status": "error", "message": "La contraseña debe tener al menos 8 caracteres."}, status=400)
            
        user = User.objects.get(pk=uid)
        user.set_password(nueva_clave) # set_password() cifra la clave automáticamente
        user.save()
        
        return JsonResponse({"status": "success", "message": f"Contraseña de '{user.username}' actualizada con éxito."})
    except User.DoesNotExist:
        return JsonResponse({"status": "error", "message": "Usuario no encontrado."}, status=404)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
