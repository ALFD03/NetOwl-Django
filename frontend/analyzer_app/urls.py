"""
Enrutamiento URL para la aplicación analyzer_app.

Define las rutas de la SPA (Single Page Application) y los endpoints
de la API REST que expone el analizador de churn.

Todas las rutas que no comienzan con /api/ renderizan la misma plantilla
(dashboard.html) y el enrutamiento interno se maneja desde el frontend
JavaScript (SPA). Las rutas /api/ exponen datos y acciones hacia el
backend.

Dependencias:
    - django.urls.path
    - frontend.analyzer_app.views
"""

from django.urls import path
from frontend.analyzer_app import views

urlpatterns = [
    # --- Rutas de la SPA (todas renderizan dashboard.html) ---
    # Página principal del dashboard
    path("", views.dashboard, name="dashboard"),
    # Vista de importación de suscripciones
    path("import/subscriptions/", views.dashboard, name="import_subscriptions"),
    # Vista de importación de logs
    path("import/logs/", views.dashboard, name="import_logs"),
    # Vista de analytics / reportes
    path("analytics/", views.dashboard, name="analytics"),
    # Vista de listado de resultados
    path("results/", views.dashboard, name="results_list"),
    # Vista de detalle de un resultado por periodo
    path("results/<str:periodo>/", views.dashboard, name="results_detail"),
    # Vista de supervivencia Kaplan-Meier
    path("survival/", views.dashboard, name="survival"),

    # --- Endpoints de la API REST ---
    # Datos agregados para el dashboard
    path("api/dashboard-data/", views.api_dashboard_data, name="api_dashboard_data"),
    # Ejecución de análisis de churn (POST)
    path("api/run-analysis/", views.api_run_analysis, name="api_run_analysis"),
    # Datos analíticos filtrables por periodos
    path("api/analytics-data/", views.api_analytics_data, name="api_analytics_data"),
    # Lista de periodos disponibles
    path("api/periods/", views.api_periods_list, name="api_periods_list"),
    # Historial completo de resultados
    path("api/results/", views.api_results_list, name="api_results_list"),
    # Detalle de resultado por periodo
    path("api/results/<str:periodo>/", views.api_results_detail, name="api_results_detail"),
    # Datos de supervivencia Kaplan-Meier (global, desde ciclo de vida)
    path("api/survival/global/", views.api_survival_data, name="api_survival_data"),
    # Importación de CSV de suscripciones (POST)
    path("api/import-subscriptions/", views.api_import_subscriptions, name="api_import_subscriptions"),
    # Importación de CSV de logs (POST)
    path("api/import-logs/", views.api_import_logs, name="api_import_logs"),
    # Analisis de ciclo de vida global (POST)
    path("api/lifecycle/run/", views.api_lifecycle_run, name="api_lifecycle_run"),
    # Resultados del analisis de ciclo de vida (GET)
    path("api/lifecycle/results/", views.api_lifecycle_results, name="api_lifecycle_results"),
]
