"""Punto de entrada WSGI. Es lo que sirve gunicorn en produccion."""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'netowl_web.settings')
application = get_wsgi_application()
