"""Rutas del proyecto: páginas por módulo y la API bajo `/api/<módulo>/<servicio>/`."""

from django.urls import include, path, re_path

from services.config.api import ApiError, endpoint
from services.config.pages import root


@endpoint(login=False, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(request):
    raise ApiError("Ruta de API no encontrada.", 404)


api_patterns = [
    path("auth/", include("services.config.api.urls")),
    path("audit/", include("services.audit.api_urls")),
    path("subscriptions/", include("services.subscriptions.api_urls")),
    path("crm/", include("services.crm.api_urls")),
    path("support/", include("services.support.api_urls")),
    path("imports/", include("services.imports.api_urls")),
    path("catalogs/", include("services.catalogs.api_urls")),
    path("commissions/", include("services.commissions.api_urls")),
    re_path(r"^.*$", api_not_found, name="not_found"),
]

urlpatterns = [
    path("", root),
    path("api/", include((api_patterns, "api"))),
    path("subscriptions/", include("services.subscriptions.urls")),
    path("crm/", include("services.crm.urls")),
    path("auth/", include("services.config.urls")),
    path("imports/", include("services.imports.urls")),
    path("support/", include("services.support.urls")),
    path("catalogos/", include("services.catalogs.urls")),
    path("comisiones/", include("services.commissions.urls")),
    path("auditoria/", include("services.audit.urls")),
]
