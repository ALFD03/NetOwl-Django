"""App de catálogos. Conserva el label `catalogos` (tablas y migraciones)."""

from django.apps import AppConfig


class CatalogsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.catalogs"
    label = "catalogos"
