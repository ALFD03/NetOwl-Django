# frontend/config/decorators.py
from django.http import JsonResponse
from django.shortcuts import redirect
from functools import wraps

def is_ajax_or_api(request):
    return (
        request.headers.get('x-requested-with') == 'XMLHttpRequest' or
        request.path.startswith('/api/') or
        '/api/' in request.path
    )

def admin_required(view_func):
    """Exige que el usuario esté autenticado y tenga rol de Administrador."""
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            if is_ajax_or_api(request):
                return JsonResponse({"status": "error", "message": "Autenticación requerida."}, status=401)
            return redirect('config:login')
        
        # Validación defensiva del perfil y rol
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role != 'admin':
            if is_ajax_or_api(request):
                return JsonResponse({"status": "error", "message": "Permiso denegado. Se requiere rol de Administrador."}, status=403)
            return redirect('subscriptions:dashboard')
        
        return view_func(request, *args, **kwargs)
    return _wrapped_view

def analyst_or_admin_required(view_func):
    """Exige que el usuario sea Administrador o Analista."""
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            if is_ajax_or_api(request):
                return JsonResponse({"status": "error", "message": "Autenticación requerida."}, status=401)
            return redirect('config:login')
        
        # Validación defensiva del perfil y rol
        profile = getattr(request.user, 'profile', None)
        if not profile or profile.role not in ['admin', 'analyst']:
            if is_ajax_or_api(request):
                return JsonResponse({"status": "error", "message": "Permiso denegado. Se requiere nivel de acceso Analista o superior."}, status=403)
            return redirect('subscriptions:dashboard')
        
        return view_func(request, *args, **kwargs)
    return _wrapped_view