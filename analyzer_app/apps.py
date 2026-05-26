"""
Configuración de la aplicación Django 'analyzer_app'.

Define los metadatos de la aplicación para que Django pueda registrarla
correctamente en el proyecto.

Dependencias:
    - django.apps.AppConfig (clase base de Django)
"""

from django.apps import AppConfig


class AnalyzerAppConfig(AppConfig):
    """
    Configuración de la aplicación analyzer_app.

    Atributos:
        default_auto_field : Tipo de campo auto-incremental por defecto
                             (BigAutoField para soportar un gran volumen
                             de registros).
        name              : Nombre interno de la aplicación, usado por
                             Django para localizar modelos, migraciones,
                             templates, etc.
    """
    default_auto_field = "django.db.models.BigAutoField"
    name = "analyzer_app"
