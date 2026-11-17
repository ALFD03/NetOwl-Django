"""Rutas del proyecto: páginas por módulo y la API bajo `/api/<módulo>/<servicio>/`."""

from django.shortcuts import redirect
from django.urls import include, path, re_path

from services.config.api import ApiError, endpoint
from services.config.decorators import resolve_landing_url


def root_redirect(request):
    """Envía la portada a la primera página que el usuario puede abrir."""
    if not request.user.is_authenticated:
        return redirect("config:login")
    return redirect(resolve_landing_url(request) or "subscriptions:dashboard")


@endpoint(login=False, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(request):
    raise ApiError("Ruta de API no encontrada.", 404)


api_patterns = [
    path("auth/", include("services.config.api.urls")),
    re_path(r"^.*$", api_not_found, name="not_found"),
]

urlpatterns = [
    path("", root_redirect),
    path("api/", include((api_patterns, "api"))),
    path("subscriptions/", include("services.subscriptions.urls")),
    path("crm/", include("services.crm.urls")),
    path("auth/", include("services.config.urls")),
    path("imports/", include("services.imports.urls")),
    path("support/", include("services.support.urls")),
    path("catalogos/", include("services.catalogos.urls")),
    path("comisiones/", include("services.comisiones.urls")),
    path("auditoria/", include("services.audit.urls")),
]
