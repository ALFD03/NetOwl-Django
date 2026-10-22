"""Registro de la app de auditoria."""

from django.apps import AppConfig


class AuditoriaConfig(AppConfig):
    """Configuracion de la app `services.auditoria`."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "services.auditoria"
    verbose_name = "Auditoría"

    def ready(self):
        # Conecta las senales de entrada y salida de sesion.
        from . import signals  # noqa: F401
