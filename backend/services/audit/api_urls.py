"""Rutas de `/api/audit/`."""

from django.urls import path

from . import views

app_name = "audit"

urlpatterns = [
    path("logs/", views.logs, name="logs"),
    path("logs/<int:log_id>/", views.log_detail, name="log_detail"),
    path("health/", views.health, name="health"),
    path("stats/", views.stats, name="stats"),
]
