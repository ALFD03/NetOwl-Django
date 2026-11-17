"""Rutas del registro de auditoria, bajo `/auditoria/`."""

from django.urls import path

from . import views

app_name = "auditoria"

urlpatterns = [
    path("", views.registro_view, name="registro"),
    path("api/registro/<int:registro_id>/", views.api_registro_detalle, name="api_registro_detalle"),
]
