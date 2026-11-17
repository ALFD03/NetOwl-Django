"""Rutas de `/api/support/`."""

from django.urls import path

from . import views, views_stages, views_users

app_name = "support"

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("breakdown/", views.breakdown, name="breakdown"),
    path("day-metrics/", views.day_metrics, name="day_metrics"),
    path("users/", views_users.users, name="users"),
    path("users/save/", views_users.user_save, name="user_save"),
    path("users/delete/", views_users.user_delete, name="user_delete"),
    path("users/move/", views_users.user_move, name="user_move"),
    path("stages/", views_stages.stages, name="stages"),
    path("stages/save/", views_stages.stage_save, name="stage_save"),
    path("stages/delete/", views_stages.stage_delete, name="stage_delete"),
]
