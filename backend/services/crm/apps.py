"""Registro de la app de CRM."""

from django.apps import AppConfig


class CrmConfig(AppConfig):
    """Configuracion de la app `services.crm`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.crm"
    verbose_name = "CRM Analytics"

    def ready(self):
        # Registra sus tablas de la analitica para `migrate` (`core.tables.sync_all`).
        from .analytics import tables  # noqa: F401
