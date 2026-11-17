"""Páginas de `/support/`."""

from django.urls import path

from services.config.pages import module_root, page

app_name = "support"

PAGES = [
    ("support:dashboard", ("can_view_support", "can_view_support_dashboard")),
    ("support:analytics", ("can_view_support_analytics",)),
    ("support:results", ("can_view_support_results",)),
    ("support:usuarios", ("can_manage_support_users",)),
]

urlpatterns = [
    path("", module_root(PAGES), name="index"),
    path("dashboard/", page("can_view_support", "can_view_support_dashboard"), name="dashboard"),
    path("analytics/", page("can_view_support_analytics"), name="analytics"),
    path("results/", page("can_view_support_results"), name="results"),
    path("users/", page("can_manage_support_users"), name="usuarios"),
    path("etapas/", page("can_manage_support_users"), name="etapas"),
]
