"""Middlewares propios del proyecto.

Uno corta las peticiones anonimas que intentan enviar algo mas que el
formulario de entrada; otro traduce el corte por exceso de peticiones a una
respuesta que el cliente sabe leer; el ultimo publica en React el usuario y sus
permisos.
"""

import inertia
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from django_ratelimit.exceptions import Ratelimited

from services.config.models import PERMISSION_FIELDS


class LimiteCuerpoAnonimoMiddleware:
    """Una peticion sin sesion no puede subir nada: solo el formulario de entrada.

    `DATA_UPLOAD_MAX_MEMORY_SIZE` es de 1 GB porque las importaciones lo
    necesitan, y Django lo aplica a cualquier peticion, autenticada o no. El
    login lee `request.body` antes de saber quien llama, asi que unos pocos
    POST anonimos de casi 1 GB -con el token CSRF que la propia pagina de
    entrada entrega- bastaban para llenar la memoria de los workers.

    Aqui se decide **antes de leer un solo byte del cuerpo** (solo se mira la
    cabecera `Content-Length`), y antes de que corran el CSRF y la vista:

    * Un anonimo solo puede escribir (POST, PUT, PATCH, DELETE) en el login y
      en el logout (una sesion caducada que pulsa "salir"). Cualquier otra
      escritura se rechaza sin mas -401, o la pantalla de entrada si era una
      visita de Inertia-: no hay ninguna que deba aceptar, y asi un token CSRF
      obtenido sin sesion no sirve para nada mas.
    * Incluso en el login, el cuerpo no puede pasar de
      `ANON_MAX_BODY_SIZE` (por defecto 16 KB, que sobra para usuario y
      contrasena).

    Una peticion sin `Content-Length` (chunked) no es un riesgo: Django trata su
    cuerpo como vacio.

    Va despues de `AuthenticationMiddleware`, que es quien resuelve
    `request.user`.
    """

    METODOS_DE_ESCRITURA = frozenset({"POST", "PUT", "PATCH", "DELETE"})

    def __init__(self, get_response):
        self.get_response = get_response
        self.limite = getattr(settings, "ANON_MAX_BODY_SIZE", 16 * 1024)
        self._rutas_abiertas = None

    @property
    def rutas_abiertas(self) -> frozenset[str]:
        # Perezoso: en __init__ el URLconf todavia puede no estar cargado.
        if self._rutas_abiertas is None:
            self._rutas_abiertas = frozenset({reverse("config:login"), reverse("config:logout")})
        return self._rutas_abiertas

    def __call__(self, request):
        if request.method in self.METODOS_DE_ESCRITURA and not request.user.is_authenticated:
            if request.path not in self.rutas_abiertas:
                # Una visita de Inertia con la sesion caducada vuelve a la
                # pantalla de entrada, como hacen los decoradores de permisos.
                if request.headers.get("x-inertia") == "true":
                    return redirect("config:login")
                return JsonResponse(
                    {"status": "error", "message": "Autenticación requerida."}, status=401
                )
            try:
                largo = int(request.META.get("CONTENT_LENGTH") or 0)
            except ValueError:
                largo = 0
            if largo > self.limite:
                return JsonResponse(
                    {"status": "error", "message": "Petición demasiado grande."}, status=413
                )
        return self.get_response(request)



class RateLimitMiddleware:
    """Convierte el corte de `django_ratelimit` en un JSON 429 legible.

    Sin el, un endpoint limitado devuelve la pagina de error de Django y el
    cliente no tiene ningun mensaje que ensenar.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        """Responde 429 a `Ratelimited`; deja pasar cualquier otra excepcion."""
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