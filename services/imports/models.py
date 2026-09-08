from django.contrib.auth.models import User
from django.db import models

from core.config import DB_SCHEMA


class ImportActionLog(models.Model):
    MODULE_CHOICES = [
        ('subs_subscriptions', 'Subscriptions - Suscripciones'),
        ('subs_logs', 'Subscriptions - Logs'),
        ('subs_analysis', 'Subscriptions - Calculo de metricas'),
        ('crm', 'CRM Analytics - Odoo Export'),
        ('crm_analysis', 'CRM Analytics - Calculo de metricas'),
        ('support', 'Support - Tickets'),
        ('support_analysis', 'Support - Calculo de metricas'),
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

    def to_dict(self):
        """Forma en la que el historial viaja al cliente.

        La vista Inertia y el endpoint JSON servian este mismo diccionario de
        diez claves, cada uno con su copia; cualquier campo nuevo habia que
        acordarse de anadirlo en los dos sitios.
        """
        return {
            "id": self.id,
            "timestamp": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "username": self.username,
            "module": self.module,
            "module_display": self.get_module_display(),
            "file_name": self.file_name,
            "rows_processed": self.rows_processed,
            "status": self.status,
            "status_display": self.get_status_display(),
            "message": self.message,
            "details": self.details,
        }