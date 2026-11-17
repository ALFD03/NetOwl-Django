"""Páginas de `/subscriptions/`."""

from django.urls import path

from services.config.pages import module_root, page

app_name = "subscriptions"

PAGES = [
    ("subscriptions:dashboard", ("can_view_subscriptions", "can_view_subs_dashboard")),
    ("subscriptions:analytics", ("can_view_subs_analytics",)),
    ("subscriptions:results", ("can_view_subs_results",)),
    ("subscriptions:lifetime", ("can_view_subs_lifetime",)),
    ("subscriptions:sales_report", ("can_view_subs_sales",)),
    ("subscriptions:business_units", ("can_view_subs_business_units",)),
    ("subscriptions:eta_report", ("can_view_eta",)),
]

urlpatterns = [
    path("", module_root(PAGES), name="index"),
    path("dashboard/", page("can_view_subscriptions", "can_view_subs_dashboard"), name="dashboard"),
    path("analytics/", page("can_view_subs_analytics"), name="analytics"),
    path("results/", page("can_view_subs_results"), name="results"),
    path("results/<str:period>/", page("can_view_subs_results"), name="results_detail"),
    path("lifetime/", page("can_view_subs_lifetime"), name="lifetime"),
    path("sales-report/", page("can_view_subs_sales"), name="sales_report"),
    path("business-units/", page("can_view_subs_business_units"), name="business_units"),
    path("eta-report/", page("can_view_eta"), name="eta_report"),
    path("eta-report/config/", page("can_manage_eta"), name="eta_config"),
]
