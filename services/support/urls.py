"""Rutas del modulo de soporte, bajo `/support/`."""

# frontend/support/urls.py
from django.urls import path

from services.support import views, views_usuarios

app_name = "support"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("users/", views_usuarios.usuarios_view, name="usuarios"),

    # APIs REST
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/cierre-historico/", views.api_cierre_historico, name="api_cierre_historico"),
    path("api/global-metrics/", views.api_global_metrics, name="api_global_metrics"),
    path("api/dimension-metrics/", views.api_dimension_metrics, name="api_dimension_metrics"),
    path("api/breakdown/", views.api_breakdown, name="api_breakdown"),
    path("api/day-metrics/", views.api_day_metrics, name="api_day_metrics"),
    path("api/tickets/", views.api_tickets_list, name="api_tickets_list"),
    path("api/usuarios/guardar/", views_usuarios.api_usuario_guardar, name="api_usuario_guardar"),
    path("api/usuarios/eliminar/", views_usuarios.api_usuario_eliminar, name="api_usuario_eliminar"),
    path("api/usuarios/movimiento/", views_usuarios.api_usuario_movimiento, name="api_usuario_movimiento"),
]