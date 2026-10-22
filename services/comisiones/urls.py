"""Enrutamiento URL para el modulo Comisiones."""
from django.urls import path

from services.comisiones import views

app_name = "comisiones"

urlpatterns = [
    path("", views.informe_view, name="informe"),
    path("supervisores/", views.supervisores_view, name="supervisores"),
    path("condiciones/", views.condiciones_view, name="condiciones"),

    path("api/ventas/", views.api_ventas, name="api_ventas"),
    path("api/periodo/guardar/", views.api_periodo_guardar, name="api_periodo_guardar"),
    path("api/periodo/cerrar/", views.api_periodo_cerrar, name="api_periodo_cerrar"),
    path("api/periodo/reabrir/", views.api_periodo_reabrir, name="api_periodo_reabrir"),
    path("api/archivo/<int:archivo_id>/", views.api_archivo, name="api_archivo"),
    path("api/revision/guardar/", views.api_revision_guardar, name="api_revision_guardar"),
    path("api/manual/agregar/", views.api_manual_agregar, name="api_manual_agregar"),
    path("api/manual/quitar/", views.api_manual_quitar, name="api_manual_quitar"),
    path("api/indicador/guardar/", views.api_indicador_guardar, name="api_indicador_guardar"),
    path("api/cumplimiento-general/", views.api_cumplimiento_general, name="api_cumplimiento_general"),
    path("api/tasa-actual/", views.api_tasa_actual, name="api_tasa_actual"),
    path("api/supervisores/unidad/", views.api_supervisores_unidad, name="api_supervisores_unidad"),
    path("api/condiciones/guardar/", views.api_condiciones_guardar, name="api_condiciones_guardar"),
]
