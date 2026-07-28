from django.db import models
from django.contrib.auth.models import User
from backend.conf_config import DB_SCHEMA 

class ImportActionLog(models.Model):
    MODULE_CHOICES = [
        ('subs_subscriptions', 'Subscriptions - Suscripciones'),
        ('subs_logs', 'Subscriptions - Logs'),
        ('crm', 'CRM Analytics - Odoo Export'),
    ]
    
    STATUS_CHOICES = [
        ('success', 'Exitoso'),
        ('error', 'Error'),
        ('warning', 'Advertencia'),
    ]

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    username = models.CharField(max_length=150)
    module = models.CharField(max_length=50, choices=MODULE_CHOICES)
    file_name = models.CharField(max_length=255)
    rows_processed = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='success')
    message = models.TextField(blank=True, default='')
    details = models.TextField(blank=True, default='')  # Traza completa o log de consola
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = f'"{DB_SCHEMA}"."import_action_logs"' if DB_SCHEMA else 'import_action_logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at.strftime('%Y-%m-%d %H:%M')} | {self.username} | {self.get_module_display()} ({self.status})"