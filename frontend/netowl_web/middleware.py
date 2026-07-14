# frontend/netowl_web/middleware.py
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