from django.urls import path
from frontend.crm import views

app_name = "crm"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("import/", views.imports, name="imports"),

    # APIs REST
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/global-metrics/", views.api_global_metrics, name="api_global_metrics"),
    path("api/cierre-historico/", views.api_cierre_historico, name="api_cierre_historico"),
    path("api/dimension-metrics/", views.api_dimension_metrics, name="api_dimension_metrics"),
    path("api/import-crm/", views.api_import_crm, name="api_import_crm"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
]