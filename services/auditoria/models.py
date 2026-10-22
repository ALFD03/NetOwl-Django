"""La tabla del registro de auditoria.

Vive en el esquema del entorno, como todo (su `db_table` va sin cualificar y la
conexion fija `search_path`). Es **solo de anadir**: un registro no se edita ni
se borra desde la aplicacion, que es lo que lo hace util como prueba.
"""

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class RegistroInmutable(Exception):
    """Se intento modificar o borrar un registro de auditoria."""


class RegistroAuditoria(models.Model):
    """Una accion: quien, cuando, desde donde, sobre que y como acabo.

    `username` se copia aparte del FK porque la cuenta puede borrarse despues
    (`SET_NULL`) y el registro tiene que seguir diciendo quien fue. `detalle`
    guarda lo que se envio -sin contrasenas ni tokens, ver `registro.limpiar`-
    y, cuando lo hay, el estado de antes y el de despues.
    """

    OK = "ok"
    RECHAZADO = "rechazado"
    DENEGADO = "denegado"
    LIMITADO = "limitado"
    ERROR = "error"
    RESULTADO_CHOICES = [
        (OK, "Correcto"),
        (RECHAZADO, "Rechazado"),
        (DENEGADO, "Denegado"),
        (LIMITADO, "Limitado"),
        (ERROR, "Error"),
    ]

    fecha = models.DateTimeField(default=timezone.now, db_index=True)
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    username = models.CharField(max_length=150, blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    # El modulo es el `app_name` de la ruta (config, imports, comisiones...) y la
    # accion su nombre de ruta, o uno propio para lo que no viene de una vista.
    modulo = models.CharField(max_length=40)
    accion = models.CharField(max_length=80)
    metodo = models.CharField(max_length=10, blank=True, default="")
    ruta = models.CharField(max_length=255, blank=True, default="")
    estado_http = models.PositiveSmallIntegerField(null=True, blank=True)
    resultado = models.CharField(max_length=10, choices=RESULTADO_CHOICES, default=OK)
    # Sobre que se actuo, en texto corto: "periodo=2026-09", "user_id=12"...
    objeto = models.CharField(max_length=255, blank=True, default="")
    # El mensaje que recibio el usuario, o el que explica el evento.
    descripcion = models.TextField(blank=True, default="")
    detalle = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "auditoria_registro"
        ordering = ["-fecha", "-id"]
        indexes = [
            models.Index(fields=["modulo", "fecha"], name="ix_auditoria_modulo_fecha"),
            models.Index(fields=["usuario", "fecha"], name="ix_auditoria_usuario_fecha"),
        ]

    def __str__(self):
        return f"{self.fecha:%Y-%m-%d %H:%M} {self.username or 'anónimo'} {self.modulo}.{self.accion}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise RegistroInmutable("Un registro de auditoría no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RegistroInmutable("Un registro de auditoría no se borra.")
