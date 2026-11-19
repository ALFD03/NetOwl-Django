"""Rutas de `/api/surveys/`."""

from django.urls import path

from . import views

app_name = "surveys"

urlpatterns = [
    path("installed/", views.installed, name="installed"),
    path("churned/", views.churned, name="churned"),
    path("settings/", views.survey_settings, name="settings"),
    path("respondents/", views.respondents, name="respondents"),
    path("answers/", views.answers, name="answers"),
    path("periods/open/", views.period_open, name="period_open"),
    path("periods/delete/", views.period_delete, name="period_delete"),
    path("answers/save/", views.answers_save, name="answers_save"),
    path("status/save/", views.status_save, name="status_save"),
    path("questions/save/", views.question_save, name="question_save"),
    path("questions/delete/", views.question_delete, name="question_delete"),
    path("questions/move/", views.question_move, name="question_move"),
    path("options/save/", views.option_save, name="option_save"),
    path("options/delete/", views.option_delete, name="option_delete"),
    path("options/move/", views.option_move, name="option_move"),
]
