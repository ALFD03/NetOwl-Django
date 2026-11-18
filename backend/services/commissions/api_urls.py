"""Rutas de `/api/commissions/`."""

from django.urls import path

from . import views

app_name = "commissions"

urlpatterns = [
    path("report/", views.report, name="report"),
    path("sales/", views.sales, name="sales"),
    path("periods/save/", views.period_save, name="period_save"),
    path("periods/close/", views.period_close, name="period_close"),
    path("periods/reopen/", views.period_reopen, name="period_reopen"),
    path("periods/delete/", views.period_delete, name="period_delete"),
    path("archives/<int:archive_id>/", views.archive_detail, name="archive_detail"),
    path("reviews/save/", views.review_save, name="review_save"),
    path("manual/add/", views.manual_add, name="manual_add"),
    path("manual/remove/", views.manual_remove, name="manual_remove"),
    path("indicators/save/", views.indicator_save, name="indicator_save"),
    path("current-rate/", views.current_rate, name="current_rate"),
    path("conditions/", views.conditions, name="conditions"),
    path("conditions/save/", views.conditions_save, name="conditions_save"),
]
