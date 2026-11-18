"""App de comisiones. Conserva el label `comisiones` (tablas y migraciones)."""

from django.apps import AppConfig


class CommissionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.commissions"
    label = "comisiones"
