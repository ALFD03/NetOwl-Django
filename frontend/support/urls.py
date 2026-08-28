# frontend/support/urls.py
from django.urls import path
from frontend.support import views

app_name = "support"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),

    # APIs REST
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/cierre-historico/", views.api_cierre_historico, name="api_cierre_historico"),
    path("api/global-metrics/", views.api_global_metrics, name="api_global_metrics"),
    path("api/dimension-metrics/", views.api_dimension_metrics, name="api_dimension_metrics"),
    path("api/breakdown/", views.api_breakdown, name="api_breakdown"),
    path("api/tickets/", views.api_tickets_list, name="api_tickets_list"),
]