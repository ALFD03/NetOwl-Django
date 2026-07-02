from django.apps import AppConfig


class ConfigAppConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "frontend.config"
    verbose_name = "Configuración"
