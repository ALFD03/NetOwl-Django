# --- START OF FILE NetOwl-Django/frontend/config/decorators.py ---
from django.http import JsonResponse
from django.shortcuts import redirect
from functools import wraps

def is_ajax_or_api(request):
    return (
        request.headers.get('x-requested-with') == 'XMLHttpRequest' or
        request.path.startswith('/api/') or
        '/api/' in request.path
    )

def permission_required(perm_name):
    """
    Exige que el usuario esté autenticado y posea el permiso requerido
    evaluado a través de su perfil o su Grupo de Permisos asignado.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(request, *args, **kwargs):
            if not request.user.is_authenticated:
                if is_ajax_or_api(request):
                    return JsonResponse({"status": "error", "message": "Autenticación requerida."}, status=401)
                return redirect('config:login')
            
            # Superusuarios de Django siempre tienen acceso total
            if request.user.is_superuser:
                return view_func(request, *args, **kwargs)

            profile = getattr(request.user, 'profile', None)
            if profile and profile.has_permission(perm_name):
                return view_func(request, *args, **kwargs)
            
            # Acceso denegado
            if is_ajax_or_api(request):
                return JsonResponse({
                    "status": "error", 
                    "message": f"Acceso denegado. Se requiere el privilegio: {perm_name}."
                }, status=403)
            return redirect('subscriptions:dashboard')
        return _wrapped_view
    return decorator

# --- DECORADORES DE COMPATIBILIDAD QUE DELEGAN A PERMISOS DINÁMICOS ---
def admin_required(view_func):
    return permission_required('can_manage_users')(view_func)

def analyst_or_admin_required(view_func):
    return permission_required('can_import_data')(view_func)
# --- END OF FILE NetOwl-Django/frontend/config/decorators.py ---