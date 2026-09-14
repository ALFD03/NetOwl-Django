"""Registro de la app de soporte."""

# frontend/support/apps.py
from django.apps import AppConfig


class SupportConfig(AppConfig):
    """Configuracion de la app `services.support`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.support"
    verbose_name = "Technical Support"