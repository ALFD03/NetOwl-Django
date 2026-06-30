"""Enrutamiento URL para el modulo CRM Analytics."""
from django.urls import path
from frontend.crm import views

app_name = "crm"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("import/", views.imports, name="imports"),
    path("results/", views.results, name="results"),
    path("results/<str:periodo>/", views.results, name="results_detail"),

    path("api/dashboard-data/", views.api_dashboard_data, name="api_dashboard_data"),
    path("api/analytics-data/", views.api_analytics_data, name="api_analytics_data"),
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/results/", views.api_results_list, name="api_results_list"),
    path("api/results/<str:periodo>/", views.api_results_detail, name="api_results_detail"),
    path("api/import-crm/", views.api_import_crm, name="api_import_crm"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
]