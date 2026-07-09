"""Enrutamiento principal público del proyecto netowl_web."""
from django.urls import include, path
from django.shortcuts import redirect

urlpatterns = [
    # Redirección automática de la raíz al Dashboard público
    path("", lambda r: redirect("subscriptions:dashboard")),
    
    # Módulos del sistema
    path("subscriptions/", include("frontend.subscriptions.urls")),
    path("crm/", include("frontend.crm.urls")),
]