import inertia
from django.http import JsonResponse
from django_ratelimit.exceptions import Ratelimited

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
                        'profile': {
                            'role': profile.role if profile else 'admin',
                            'can_view_subscriptions': profile.can_view_subscriptions if profile else True,
                            'can_view_crm': profile.can_view_crm if profile else True,
                            'can_view_imports': profile.can_view_imports if profile else True,
                            'can_view_support': profile.can_view_support if profile else True,
                            'can_view_subs_analytics': profile.can_view_subs_analytics if profile else True,
                            'can_view_subs_results': profile.can_view_subs_results if profile else True,
                            'can_view_subs_lifetime': profile.can_view_subs_lifetime if profile else True,
                            'can_view_subs_sales': profile.can_view_subs_sales if profile else True,
                            'can_view_eta': profile.can_view_eta if profile else True,
                            'can_view_crm_analytics': profile.can_view_crm_analytics if profile else True,
                            'can_view_crm_results': profile.can_view_crm_results if profile else True,
                            'can_view_support_analytics': profile.can_view_support_analytics if profile else True,
                            'can_view_support_results': profile.can_view_support_results if profile else True,
                            'can_import_data': profile.can_import_data if profile else True,
                            'can_run_calculations': profile.can_run_calculations if profile else True,
                            'can_run_lifetime': profile.can_run_lifetime if profile else True,
                            'can_manage_eta': profile.can_manage_eta if profile else True,
                            'can_manage_users': profile.can_manage_users if profile else True,
                        } if profile else {}
                    }
                }
            )
        return self.get_response(request)