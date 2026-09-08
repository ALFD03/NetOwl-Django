import inertia
from django.http import JsonResponse
from django_ratelimit.exceptions import Ratelimited

from services.config.models import PERMISSION_FIELDS


class RateLimitMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        if isinstance(exception, Ratelimited):
            return JsonResponse({
                "status": "error",
                "message": "Demasiadas peticiones. Por favor, espera un momento antes de reintentar."
            }, status=429)
        return None


class InertiaShareMiddleware:
    """Comparte el usuario autenticado y su matriz de permisos con React/Inertia"""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            profile = getattr(request.user, 'profile', None)
            inertia.share(
                request,
                auth={
                    'user': {
                        'id': request.user.id,
                        'username': request.user.username,
                        'is_superuser': request.user.is_superuser,
                        # La matriz se recorre desde el catalogo unico de
                        # services/config/models.py: agregar un permiso alli lo
                        # publica automaticamente en React.
                        'profile': {
                            'role': profile.role,
                            **{field: getattr(profile, field) for field in PERMISSION_FIELDS},
                        } if profile else {}
                    }
                }
            )
        return self.get_response(request)