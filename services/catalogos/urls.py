"""Enrutamiento URL para el modulo Catalogos."""
from django.urls import path

from services.catalogos import views

app_name = "catalogos"

urlpatterns = [
    path("", views.inicio, name="inicio"),
    path("notificaciones/", views.notificaciones_view, name="notificaciones"),
    path("productos/", views.productos_view, name="productos"),
    path("estructura/", views.estructura_view, name="estructura"),
    path("ventas/", views.ventas_view, name="ventas"),

    path("api/guardar/", views.api_catalogo_guardar, name="api_guardar"),
    path("api/guardar-lote/", views.api_catalogo_guardar_lote, name="api_guardar_lote"),
    path("api/eliminar/", views.api_catalogo_eliminar, name="api_eliminar"),
]
