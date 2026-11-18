"""Páginas de `/imports/`."""

from django.urls import path

from services.config.pages import module_root, page

app_name = "imports"

PAGES = [
    ("imports:subscriptions", ("can_view_imports", "can_view_imports_subs")),
    ("imports:crm", ("can_view_imports", "can_view_imports_crm")),
    ("imports:support", ("can_view_imports", "can_view_imports_support")),
    ("imports:history", ("can_view_imports", "can_view_import_history")),
]

urlpatterns = [
    path("", module_root(PAGES), name="index"),
    path("subscriptions/", page("can_view_imports", "can_view_imports_subs"), name="subscriptions"),
    path("crm/", page("can_view_imports", "can_view_imports_crm"), name="crm"),
    path("support/", page("can_view_imports", "can_view_imports_support"), name="support"),
    path("history/", page("can_view_imports", "can_view_import_history"), name="history"),
]
