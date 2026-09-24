"""Rutas del modulo de importaciones, bajo `/imports/`.

Incluye las pantallas, las cargas de CSV, el lanzamiento de analisis y los tres
endpoints de seguimiento que sondea la interfaz.
"""

# frontend/imports/urls.py
from django.urls import path

from . import views

app_name = "imports"

urlpatterns = [
    path("", views.imports_index_view, name="index"),
    path("subscriptions/", views.subscriptions_import_view, name="subscriptions"),
    path("crm/", views.crm_import_view, name="crm"),
    path("history/", views.history_view, name="history"),
    path("support/", views.support_import_view, name="support"),

    # APIs protegidas
    path("api/import-subscriptions/", views.api_import_subscriptions, name="api_import_subscriptions"),
    path("api/import-logs/", views.api_import_logs, name="api_import_logs"),
    path("api/import-gratis/", views.api_import_gratis, name="api_import_gratis"),
    path("api/import-crm/", views.api_import_crm, name="api_import_crm"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
    path("api/run-crm-analysis/", views.api_run_crm_analysis, name="api_run_crm_analysis"), # <-- AGREGADO
    path("api/history/", views.api_history_list, name="api_history"),
    path("api/import-support/", views.api_import_support, name="api_import_support"),
    path("api/run-support-analysis/", views.api_run_support_analysis, name="api_run_support_analysis"),

    # Seguimiento de los analisis, que corren en el worker de Celery.
    path("api/jobs/queue/", views.api_jobs_queue, name="api_jobs_queue"),
    path("api/jobs/active/", views.api_job_active, name="api_job_active"),
    path("api/jobs/<uuid:job_id>/", views.api_job_detail, name="api_job_detail"),
    path("api/jobs/<uuid:job_id>/cancel/", views.api_job_cancel, name="api_job_cancel"),
]