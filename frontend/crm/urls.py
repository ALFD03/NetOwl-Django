"""Enrutamiento URL para el modulo CRM Analytics."""
from django.urls import path
from frontend.crm import views

app_name = "crm"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("import/", views.imports, name="imports"),

    path("api/import-crm/", views.api_import_crm, name="api_import_crm"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),

    # Per-metric global APIs
    path("api/metricas/totals/", views.api_metric_totals, name="api_metric_totals"),
    path("api/metricas/tiempo-instalacion/", views.api_metric_tiempo_instalacion, name="api_metric_tiempo_instalacion"),
    path("api/metricas/tiempo-por-etapa/", views.api_metric_tiempo_por_etapa, name="api_metric_tiempo_por_etapa"),
    path("api/metricas/efectividad/", views.api_metric_efectividad, name="api_metric_efectividad"),
    path("api/metricas/etapa8/", views.api_metric_etapa8, name="api_metric_etapa8"),
    path("api/metricas/perdido/", views.api_metric_perdido, name="api_metric_perdido"),
    path("api/metricas/rescate/", views.api_metric_rescate, name="api_metric_rescate"),

    # Per-metric dimension APIs
    path("api/dimensiones/totals/", views.api_dimension_totals, name="api_dimension_totals"),
    path("api/dimensiones/tiempo-instalacion/", views.api_dimension_tiempo_instalacion, name="api_dimension_tiempo_instalacion"),
    path("api/dimensiones/tiempo-por-etapa/", views.api_dimension_tiempo_por_etapa, name="api_dimension_tiempo_por_etapa"),
    path("api/dimensiones/efectividad/", views.api_dimension_efectividad, name="api_dimension_efectividad"),
    path("api/dimensiones/etapa8/", views.api_dimension_etapa8, name="api_dimension_etapa8"),
    path("api/dimensiones/perdido/", views.api_dimension_perdido, name="api_dimension_perdido"),
    path("api/dimensiones/rescate/", views.api_dimension_rescate, name="api_dimension_rescate"),
]