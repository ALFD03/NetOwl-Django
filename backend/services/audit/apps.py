"""App de auditoría. Conserva el label `auditoria` (tablas y migraciones)."""

from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.audit"
    label = "auditoria"
    verbose_name = "Auditoría"

    def ready(self):
        from . import signals  # noqa: F401
