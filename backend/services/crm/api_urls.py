"""Rutas de `/api/crm/`."""

from django.urls import path

from . import views

app_name = "crm"

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("day-metrics/", views.day_metrics, name="day_metrics"),
    path("dimension-metrics/", views.dimension_metrics, name="dimension_metrics"),
]
