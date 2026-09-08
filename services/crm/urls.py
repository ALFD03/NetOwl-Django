from django.urls import path
from services.crm import views

app_name = "crm"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("dashboard/", views.dashboard),
    path("analytics/", views.analytics, name="analytics"),
    path("results/", views.results, name="results"),

    # APIs REST
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/global-metrics/", views.api_global_metrics, name="api_global_metrics"),
    path("api/cierre-historico/", views.api_cierre_historico, name="api_cierre_historico"),
    path("api/dimension-metrics/", views.api_dimension_metrics, name="api_dimension_metrics"),
]