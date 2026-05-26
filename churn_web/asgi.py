"""
Punto de entrada ASGI para el proyecto churn_web.

ASGI (Asynchronous Server Gateway Interface) extiende WSGI para soportar
protocolos asíncronos como WebSockets, HTTP/2 y long-polling. Se utiliza
con servidores como Daphne, Uvicorn o Hypercorn.

Uso (Daphne):
    daphne churn_web.asgi:application --bind 0.0.0.0:8000

Dependencias:
    - django.core.asgi.get_asgi_application
    - Variable de entorno DJANGO_SETTINGS_MODULE (se define por defecto)
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "churn_web.settings")

application = get_asgi_application()
