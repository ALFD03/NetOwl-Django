"""Páginas de `/crm/`."""

from django.urls import path

from services.config.pages import module_root, page

app_name = "crm"

PAGES = [
    ("crm:dashboard", ("can_view_crm", "can_view_crm_dashboard")),
    ("crm:analytics", ("can_view_crm_analytics",)),
    ("crm:results", ("can_view_crm_results",)),
]

urlpatterns = [
    path("", module_root(PAGES), name="index"),
    path("dashboard/", page("can_view_crm", "can_view_crm_dashboard"), name="dashboard"),
    path("analytics/", page("can_view_crm_analytics"), name="analytics"),
    path("results/", page("can_view_crm_results"), name="results"),
]
