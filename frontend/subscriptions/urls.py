"""Enrutamiento URL para el modulo Subscriptions."""
from django.urls import path
from frontend.subscriptions import views

app_name = "subscriptions"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("import/", views.imports, name="imports"),
    path("import/subscriptions/", views.imports, name="import_subscriptions"),
    path("import/logs/", views.imports, name="import_logs"),
    path("results/", views.results, name="results"),
    path("results/<str:periodo>/", views.results, name="results_detail"),
    path("lifetime/", views.lifetime, name="lifetime"),
    path("sales-report/", views.sales_report, name="sales_report"),
    path("eta-report/", views.eta_report, name="eta_report"),

    path("api/dashboard-data/", views.api_dashboard_data, name="api_dashboard_data"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
    path("api/analytics-data/", views.api_analytics_data, name="api_analytics_data"),
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/results/", views.api_results_list, name="api_results_list"),
    path("api/results/<str:periodo>/", views.api_results_detail, name="api_results_detail"),
    path("api/survival/global/", views.api_survival_data, name="api_survival_data"),
    path("api/import-subscriptions/", views.api_import_subscriptions, name="api_import_subscriptions"),
    path("api/import-logs/", views.api_import_logs, name="api_import_logs"),
    path("api/lifecycle/run/", views.api_lifecycle_run, name="api_lifecycle_run"),
    path("api/lifecycle/results/", views.api_lifecycle_results, name="api_lifecycle_results"),
    path("api/sales-report/", views.api_sales_report, name="api_sales_report"),
    path("api/eta-report/data/", views.api_eta_report_data, name="api_eta_report_data"),
    path("api/eta-report/lock/", views.api_eta_report_lock, name="api_eta_report_lock"),
    path("api/eta-report/save-plan-config/", views.api_eta_report_save_plan_config, name="api_eta_report_save_plan_config"),
    path("api/eta-report/save-sub-config/", views.api_eta_report_save_sub_config, name="api_eta_report_save_sub_config"),
]
