"""
Punto de entrada WSGI para el proyecto churn_web.

WSGI (Web Server Gateway Interface) es el estándar que permite servir
la aplicación Django mediante servidores web como Gunicorn, uWSGI o
el servidor de desarrollo de Django.

Uso (Gunicorn):
    gunicorn churn_web.wsgi:application --bind 0.0.0.0:8000

Dependencias:
    - django.core.wsgi.get_wsgi_application
    - Variable de entorno DJANGO_SETTINGS_MODULE (se define por defecto)
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "churn_web.settings")

application = get_wsgi_application()
