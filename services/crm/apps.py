"""Registro de la app de CRM."""

from django.apps import AppConfig


class CrmConfig(AppConfig):
    """Configuracion de la app `services.crm`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.crm"
    verbose_name = "CRM Analytics"