"""
Enrutamiento raíz del proyecto churn_web.

Todas las rutas se delegan a la aplicación analyzer_app mediante
un único include. Esto mantiene el proyecto abierto a añadir más
aplicaciones en el futuro sin modificar la estructura raíz.

Dependencias:
    - django.urls.path, django.urls.include
"""

from django.urls import path, include

urlpatterns = [
    path("", include("analyzer_app.urls")),
]
