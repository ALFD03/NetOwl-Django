from django.urls import path
from frontend.analyzer_app import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("import/subscriptions/", views.dashboard, name="import_subscriptions"),
    path("import/logs/", views.dashboard, name="import_logs"),
    path("analytics/", views.dashboard, name="analytics"),
    path("results/", views.dashboard, name="results_list"),
    path("results/<str:periodo>/", views.dashboard, name="results_detail"),
    path("api/dashboard-data/", views.api_dashboard_data, name="api_dashboard_data"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
    path("api/analytics-data/", views.api_analytics_data, name="api_analytics_data"),
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/results/", views.api_results_list, name="api_results_list"),
    path("api/results/<str:periodo>/", views.api_results_detail, name="api_results_detail"),
    path("api/import-subscriptions/", views.api_import_subscriptions, name="api_import_subscriptions"),
    path("api/import-logs/", views.api_import_logs, name="api_import_logs"),
]
