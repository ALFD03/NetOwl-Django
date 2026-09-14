"""Registro de la app de importaciones."""

from django.apps import AppConfig


class ImportsConfig(AppConfig):
    """Configuracion de la app `services.imports`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.imports"
    verbose_name = "Modulo de Imports"