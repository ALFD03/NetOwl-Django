"""Registro de la app de soporte."""

from django.apps import AppConfig


class SupportConfig(AppConfig):
    """Configuracion de la app `services.support`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.support"
    verbose_name = "Technical Support"

    def ready(self):
        # Registra sus tablas de la analitica para `migrate` (`core.tables.sync_all`).
        from .analytics import tables  # noqa: F401
