"""
Enrutamiento de URLs específicas de la aplicación analyzer_app.

Define los patrones de URL que el proyecto raíz (churn_web) incluirá bajo
su propio enrutamiento. Cada ruta se asocia a una vista y posee un nombre
único para facilitar la referencia desde templates con la etiqueta {% url %}.

Dependencias:
    - django.urls.path
    - .views (vistas de la aplicación)

Rutas definidas:
    /                           → dashboard          (formulario + resultados)
    /import/subscriptions/       → import_subscriptions (carga CSV suscripciones)
    /import/logs/                → import_logs          (carga CSV logs)
    /analytics/                  → analytics          (vista analítica avanzada)
    /results/                    → results_list         (histórico completo)
    /results/<str:periodo>/      → results_detail       (detalle por período)
"""

from django.urls import path

from . import views

urlpatterns = [
    # Vistas de la SPA (todas sirven la interfaz base, el router JS activa la pestaña correcta)
    path("", views.dashboard, name="dashboard"),
    path("import/subscriptions/", views.dashboard, name="import_subscriptions"),
    path("import/logs/", views.dashboard, name="import_logs"),
    path("analytics/", views.dashboard, name="analytics"),
    path("results/", views.dashboard, name="results_list"),
    path("results/<str:periodo>/", views.dashboard, name="results_detail"),

    # Endpoints de la API JSON
    path("api/dashboard-data/", views.api_dashboard_data, name="api_dashboard_data"),
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
    path("api/analytics-data/", views.api_analytics_data, name="api_analytics_data"),
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    path("api/results/", views.api_results_list, name="api_results_list"),
    path("api/results/<str:periodo>/", views.api_results_detail, name="api_results_detail"),
    path("api/import-subscriptions/", views.api_import_subscriptions, name="api_import_subscriptions"),
    path("api/import-logs/", views.api_import_logs, name="api_import_logs"),
]