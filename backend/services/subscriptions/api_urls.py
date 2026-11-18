"""Rutas de `/api/subscriptions/`."""

from django.urls import path

from . import views, views_eta

app_name = "subscriptions"

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),
    path("results/<str:period>/", views.result_detail, name="result_detail"),
    path("lifetime/", views.lifetime, name="lifetime"),
    path("lifetime/detail/", views.lifetime_detail, name="lifetime_detail"),
    path("lifetime/run/", views.lifetime_run, name="lifetime_run"),
    path("sales-report/", views.sales_report, name="sales_report"),
    path("business-units/", views.business_units, name="business_units"),
    path("churn/detail/", views.churn_detail, name="churn_detail"),
    path("eta-report/", views_eta.eta_report, name="eta_report"),
    path("eta-report/config/", views_eta.eta_config, name="eta_config"),
    path("eta-report/data/", views_eta.eta_data, name="eta_data"),
    path("eta-report/lock/", views_eta.eta_lock, name="eta_lock"),
    path("eta-report/orders/save/", views_eta.eta_order_save, name="eta_order_save"),
    path("eta-report/orders/delete/", views_eta.eta_order_delete, name="eta_order_delete"),
    path("eta-report/rate/", views_eta.eta_rate, name="eta_rate"),
    path("eta-report/rate/fetch/", views_eta.eta_rate_fetch, name="eta_rate_fetch"),
    path("eta-report/rate/current/", views_eta.eta_rate_current, name="eta_rate_current"),
]
