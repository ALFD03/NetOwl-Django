"""Registro de la app de suscripciones."""

from django.apps import AppConfig


class AnalyzerAppConfig(AppConfig):
    """Configuracion de la app `services.subscriptions`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.subscriptions"

    def ready(self):
        # Registra sus tablas de la analitica para `migrate` (`core.tables.sync_all`).
        from .analytics import tables  # noqa: F401
