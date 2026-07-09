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
    path("api/metrics/totals/", views.api_metric_totals, name="api_metric_totals"),
    path("api/metrics/tiempo-instalacion/", views.api_metric_tiempo_instalacion, name="api_metric_tiempo_instalacion"),
    path("api/metrics/tiempo-por-etapa/", views.api_metric_tiempo_por_etapa, name="api_metric_tiempo_por_etapa"),
    path("api/metrics/efectividad/", views.api_metric_efectividad, name="api_metric_efectividad"),
    path("api/metrics/etapa8/", views.api_metric_etapa8, name="api_metric_etapa8"),
    path("api/metrics/perdido/", views.api_metric_perdido, name="api_metric_perdido"),
    path("api/metrics/rescate/", views.api_metric_rescate, name="api_metric_rescate"),

    # Per-metric dimension APIs
    path("api/dimensions/totals/", views.api_dimension_totals, name="api_dimension_totals"),
    path("api/dimensions/tiempo-instalacion/", views.api_dimension_tiempo_instalacion, name="api_dimension_tiempo_instalacion"),
    path("api/dimensions/tiempo-por-etapa/", views.api_dimension_tiempo_por_etapa, name="api_dimension_tiempo_por_etapa"),
    path("api/dimensions/efectividad/", views.api_dimension_efectividad, name="api_dimension_efectividad"),
    path("api/dimensions/etapa8/", views.api_dimension_etapa8, name="api_dimension_etapa8"),
    path("api/dimensions/perdido/", views.api_dimension_perdido, name="api_dimension_perdido"),
    path("api/dimensions/rescate/", views.api_dimension_rescate, name="api_dimension_rescate"),
]