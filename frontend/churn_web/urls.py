"""
Enrutamiento URL raíz del proyecto churn_web (frontend).

Incluye todas las rutas definidas en la aplicación analyzer_app bajo
la raíz (""). Cualquier petición que llegue al servidor se delega a
los patrones definidos en frontend/analyzer_app/urls.py.

Dependencias:
    - django.urls.path, django.urls.include
"""

from django.urls import path, include

urlpatterns = [
    # Delegar todo el enrutamiento a la aplicación analyzer_app
    path("", include("frontend.analyzer_app.urls")),
]
