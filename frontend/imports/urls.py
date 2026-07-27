# frontend/imports/urls.py
from django.urls import path
from . import views

app_name = "imports"

urlpatterns = [
    path("", views.subscriptions_import_view, name="index"),
    path("subscriptions/", views.subscriptions_import_view, name="subscriptions"),
    path("crm/", views.crm_import_view, name="crm"),
    path("history/", views.history_view, name="history"),

    # APIs protegidas
    path("api/import-subscriptions/", views.api_import_subscriptions, name="api_import_subscriptions"),
    path("api/import-logs/", views.api_import_logs, name="api_import_logs"),
    path("api/import-crm/", views.api_import_crm, name="api_import_crm"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
    path("api/run-crm-analysis/", views.api_run_crm_analysis, name="api_run_crm_analysis"), # <-- AGREGADO
    path("api/history/", views.api_history_list, name="api_history"),
]