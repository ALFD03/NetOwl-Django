"""Registro de la app de suscripciones."""

from django.apps import AppConfig


class AnalyzerAppConfig(AppConfig):
    """Configuracion de la app `services.subscriptions`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.subscriptions"
