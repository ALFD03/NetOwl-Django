"""Aplicacion Celery del proyecto.

Los analisis (churn, CRM, soporte, ciclo de vida) tardan minutos y no caben en
el ciclo peticion/respuesta: gunicorn mata al worker a los 300s y el proxy
inverso devuelve 504 mucho antes. Aqui viven encolados en Redis y los ejecuta
el contenedor `worker`, que no tiene limite de tiempo de peticion.

El estado de cada ejecucion NO se guarda en el backend de resultados de Celery
sino en `services.imports.models.AnalysisJob`: la interfaz necesita leer el log
y el progreso mientras la tarea corre, y esa fila es la unica fuente de verdad.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "netowl_web.settings")

app = Celery("netowl")

# Toda la configuracion vive en settings.py con el prefijo CELERY_.
app.config_from_object("django.conf:settings", namespace="CELERY")

# Descubre `tasks.py` en cada app instalada.
app.autodiscover_tasks()
