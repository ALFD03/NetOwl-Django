"""Registro de auditoría. Solo se añade: un registro no se edita ni se borra."""

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class ImmutableLogError(Exception):
    """Se intentó modificar o borrar un registro de auditoría."""


class AuditLog(models.Model):
    """Una acción: quién, cuándo, desde dónde, por qué canal y cómo acabó.

    `username` se copia aparte del FK porque la cuenta puede borrarse. `detail`
    guarda lo enviado sin secretos (ver `log.sanitize`).
    """

    OK = "ok"
    REJECTED = "rechazado"
    DENIED = "denegado"
    LIMITED = "limitado"
    ERROR = "error"
    OUTCOME_CHOICES = [
        (OK, "Correcto"),
        (REJECTED, "Rechazado"),
        (DENIED, "Denegado"),
        (LIMITED, "Limitado"),
        (ERROR, "Error"),
    ]

    WEB = "web"
    API = "api"
    WORKER = "worker"
    CHANNEL_CHOICES = [(WEB, "Aplicación"), (API, "API con token"), (WORKER, "Worker")]

    created_at = models.DateTimeField(default=timezone.now, db_index=True, db_column="fecha")
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", db_column="usuario_id"
    )
    username = models.CharField(max_length=150, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    # Módulo: el namespace de la ruta (crm, imports…). Acción: el nombre de la ruta.
    module = models.CharField(max_length=40, db_column="modulo")
    action = models.CharField(max_length=80, db_column="accion")
    method = models.CharField(max_length=10, blank=True, default="", db_column="metodo")
    path = models.CharField(max_length=255, blank=True, default="", db_column="ruta")
    status_code = models.PositiveSmallIntegerField(null=True, blank=True, db_column="estado_http")
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES, default=OK, db_column="resultado")
    # Sobre qué se actuó, en texto corto: "periodo=2026-09", "user_id=12"…
    target = models.CharField(max_length=255, blank=True, default="", db_column="objeto")
    description = models.TextField(blank=True, default="", db_column="descripcion")
    detail = models.JSONField(null=True, blank=True, db_column="detalle")
    channel = models.CharField(max_length=10, choices=CHANNEL_CHOICES, default=WEB)
    token = models.ForeignKey(
        "config.ApiToken", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_index=False,  # lo cubre ix_auditoria_token_fecha
    )
    duration_ms = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = "auditoria_registro"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["module", "created_at"], name="ix_auditoria_modulo_fecha"),
            models.Index(fields=["user", "created_at"], name="ix_auditoria_usuario_fecha"),
            models.Index(fields=["token", "created_at"], name="ix_auditoria_token_fecha"),
        ]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.username or 'anónimo'} {self.module}.{self.action}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableLogError("Un registro de auditoría no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableLogError("Un registro de auditoría no se borra.")
