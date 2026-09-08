"""Enrutamiento URL para el modulo Subscriptions."""
from django.urls import path
from frontend.subscriptions import views, views_eta

app_name = "subscriptions"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("results/<str:periodo>/", views.results, name="results_detail"),
    path("lifetime/", views.lifetime, name="lifetime"),
    path("sales-report/", views.sales_report, name="sales_report"),
    path("eta-report/", views_eta.eta_report, name="eta_report"),
    path("eta-report/config/", views_eta.eta_config_view, name="eta_config"),
    path("business-units/", views.business_units, name="business_units"),

    path("api/dashboard-data/", views.api_dashboard_data, name="api_dashboard_data"),
    path("api/analytics-data/", views.api_analytics_data, name="api_analytics_data"),
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/results/", views.api_results_list, name="api_results_list"),
    path("api/results/<str:periodo>/", views.api_results_detail, name="api_results_detail"),
    path("api/survival/global/", views.api_survival_data, name="api_survival_data"),
    path("api/lifecycle/run/", views.api_lifecycle_run, name="api_lifecycle_run"),
    path("api/lifecycle/results/", views.api_lifecycle_results, name="api_lifecycle_results"),
    path("api/sales-report/", views.api_sales_report, name="api_sales_report"),
    path("api/eta-report/data/", views_eta.api_eta_report_data, name="api_eta_report_data"),
    path("api/eta-report/lock/", views_eta.api_eta_report_lock, name="api_eta_report_lock"),
    path("api/eta-report/save-plan-config/", views_eta.api_eta_report_save_plan_config, name="api_eta_report_save_plan_config"),
    path("api/eta-report/save-sub-config/", views_eta.api_eta_report_save_sub_config, name="api_eta_report_save_sub_config"),
    path("api/business-units/", views.api_business_units_report, name="api_business_units_report"),
    path("api/eta-report/delete-plan-config/", views_eta.api_eta_report_delete_plan_config, name="api_eta_report_delete_plan_config"),
    path("api/eta-report/delete-sub-config/", views_eta.api_eta_report_delete_sub_config, name="api_eta_report_delete_sub_config"),

]
