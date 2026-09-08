"""Enrutamiento principal público del proyecto netowl_web."""
from django.urls import include, path
from django.shortcuts import redirect

from services.config.decorators import resolve_landing_url


def root_redirect(request):
    """Envia la portada al primer modulo que el usuario si pueda abrir."""
    if not request.user.is_authenticated:
        return redirect("config:login")
    return redirect(resolve_landing_url(request) or "subscriptions:dashboard")

urlpatterns = [
    # Redirección automática de la raíz al Dashboard público
    path("", root_redirect),
    
    # Módulos del sistema
    path("subscriptions/", include("services.subscriptions.urls")),
    path("crm/", include("services.crm.urls")),
    path("auth/", include("services.config.urls")),
    path("imports/", include("services.imports.urls")),
    path("support/", include("services.support.urls")),
]