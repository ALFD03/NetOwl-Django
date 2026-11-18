"""Middlewares propios: límite del cuerpo anónimo y Content-Security-Policy."""

import secrets

from django.conf import settings
from django.http import JsonResponse
from django.urls import reverse

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class AnonymousBodyLimitMiddleware:
    """Un anónimo solo escribe en el login y el logout, y con un cuerpo pequeño.

    `DATA_UPLOAD_MAX_MEMORY_SIZE` es de 1 GB por las importaciones; sin esto,
    unos pocos POST anónimos enormes llenaban la memoria de los workers. Se
    decide por `Content-Length`, antes de leer el cuerpo y antes del CSRF.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.limit = getattr(settings, "ANON_MAX_BODY_SIZE", 16 * 1024)
        self._open_paths = None

    @property
    def open_paths(self) -> frozenset[str]:
        # Perezoso: en __init__ el URLconf puede no estar cargado.
        if self._open_paths is None:
            self._open_paths = frozenset({reverse("api:auth:login"), reverse("api:auth:logout")})
        return self._open_paths

    def __call__(self, request):
        if request.method in WRITE_METHODS and not request.user.is_authenticated:
            if request.path not in self.open_paths:
                return JsonResponse({"error": {"message": "Autenticación requerida."}}, status=401)
            try:
                length = int(request.META.get("CONTENT_LENGTH") or 0)
            except ValueError:
                length = 0
            if length > self.limit:
                return JsonResponse({"error": {"message": "Petición demasiado grande."}}, status=413)
        return self.get_response(request)


class CSPMiddleware:
    """Cabecera Content-Security-Policy de `settings.CSP_POLICY` con un nonce por petición."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.policy = "; ".join(
            f"{directive} {' '.join(sources)}" for directive, sources in settings.CSP_POLICY.items()
        )

    def __call__(self, request):
        request.csp_nonce = secrets.token_urlsafe(16)
        response = self.get_response(request)
        if "Content-Security-Policy" not in response.headers:
            response.headers["Content-Security-Policy"] = self.policy.replace("{nonce}", request.csp_nonce)
        return response
