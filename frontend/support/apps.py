# frontend/support/apps.py
from django.apps import AppConfig

class SupportConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "frontend.support"
    verbose_name = "Technical Support"