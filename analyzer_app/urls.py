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
    /results/                    → results_list         (histórico completo)
    /results/<str:periodo>/      → results_detail       (detalle por período)
"""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("import/subscriptions/", views.import_subscriptions, name="import_subscriptions"),
    path("import/logs/", views.import_logs, name="import_logs"),
    path("results/", views.results_list, name="results_list"),
    path("results/<str:periodo>/", views.results_detail, name="results_detail"),
]
