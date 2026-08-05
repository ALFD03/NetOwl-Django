"""Enrutamiento principal público del proyecto netowl_web."""
from django.urls import include, path
from django.shortcuts import redirect

urlpatterns = [
    # Redirección automática de la raíz al Dashboard público
    path("", lambda r: redirect("subscriptions:dashboard")),
    
    # Módulos del sistema
    path("subscriptions/", include("frontend.subscriptions.urls")),
    path("crm/", include("frontend.crm.urls")),
    path("auth/", include("frontend.config.urls")),
    path("imports/", include("frontend.imports.urls")),
    path("support/", include("frontend.support.urls")),
]