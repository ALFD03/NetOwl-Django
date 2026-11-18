"""Rutas de `/api/imports/`."""

from django.urls import path

from . import views

app_name = "imports"

urlpatterns = [
    path("subscriptions/", views.subscriptions, name="subscriptions"),
    path("crm/", views.crm, name="crm"),
    path("support/", views.support, name="support"),
    path("history/", views.history, name="history"),
    path("subscriptions/upload/", views.import_subscriptions, name="import_subscriptions"),
    path("subscriptions/logs/upload/", views.import_subscription_logs, name="import_subscription_logs"),
    path("subscriptions/free-plans/upload/", views.import_free_plans, name="import_free_plans"),
    path("subscriptions/invoices/upload/", views.import_invoices, name="import_invoices"),
    path("crm/upload/", views.import_crm, name="import_crm"),
    path("support/upload/", views.import_support, name="import_support"),
    path("support/logs/upload/", views.import_support_logs, name="import_support_logs"),
    path("subscriptions/run/", views.run_subscriptions, name="run_subscriptions"),
    path("crm/run/", views.run_crm, name="run_crm"),
    path("support/run/", views.run_support, name="run_support"),
    path("jobs/queue/", views.job_queue, name="job_queue"),
    path("jobs/active/", views.job_active, name="job_active"),
    path("jobs/<uuid:job_id>/", views.job_detail, name="job_detail"),
    path("jobs/<uuid:job_id>/cancel/", views.job_cancel, name="job_cancel"),
]
