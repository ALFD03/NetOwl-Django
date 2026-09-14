"""Las dos tablas del modulo de importaciones.

`ImportActionLog` es el historial permanente que ve el usuario;
`AnalysisJob`, el estado vivo de una ejecucion concreta. No se sustituyen: la
primera dice que paso, la segunda que esta pasando.

Ambas cualifican su `db_table` con `DB_SCHEMA`, asi que cada entorno tiene las
suyas; las crea `manage.py preparar_imports` (ver ese comando).
"""

import uuid

from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

from core.config import DB_SCHEMA


class ImportActionLog(models.Model):
    """Una linea del historial: una importacion o un calculo ya terminados.

    Guarda el fichero, las filas procesadas, el desenlace y el log completo, y es
    lo que alimenta la pantalla de historial.
    """

    MODULE_CHOICES = [
        ('subs_subscriptions', 'Subscriptions - Suscripciones'),
        ('subs_logs', 'Subscriptions - Logs'),
        ('subs_analysis', 'Subscriptions - Calculo de metricas'),
        ('crm', 'CRM Analytics - Odoo Export'),
        ('crm_analysis', 'CRM Analytics - Calculo de metricas'),
        ('support', 'Support - Tickets'),
        ('support_analysis', 'Support - Calculo de metricas'),
        ('subs_lifetime', 'Subscriptions - Ciclo de vida'),
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


class AnalysisJob(models.Model):
    """Una ejecucion de analisis encolada en Celery.

    Es la unica fuente de verdad del estado: el worker va escribiendo aqui el
    log y el progreso mientras calcula, y la interfaz lo lee por sondeo. Por eso
    Celery corre sin backend de resultados (ver netowl_web/celery.py).

    `ImportActionLog` sigue existiendo y no lo sustituye: aquel es el historial
    permanente que ve el usuario, este el estado vivo de una ejecucion concreta.
    """

    PENDIENTE = 'pending'
    EN_CURSO = 'running'
    EXITO = 'success'
    ERROR = 'error'

    STATUS_CHOICES = [
        (PENDIENTE, 'En cola'),
        (EN_CURSO, 'En ejecucion'),
        (EXITO, 'Completado'),
        (ERROR, 'Error'),
    ]

    ESTADOS_ABIERTOS = (PENDIENTE, EN_CURSO)

    # UUID y no autoincremental: el id viaja al navegador y se sondea sin sesion
    # de por medio; un entero correlativo deja adivinar ejecuciones ajenas.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    module = models.CharField(max_length=50, choices=ImportActionLog.MODULE_CHOICES)
    # Mes analizado en formato YYYY-MM. Vacio en los analisis sin periodo
    # (ciclo de vida, que recorre todo el historico).
    periodo = models.CharField(max_length=7, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDIENTE)
    task_id = models.CharField(max_length=255, blank=True, default='')

    # Salida de consola acumulada: lo que el analisis imprime por stdout.
    log = models.TextField(blank=True, default='')
    message = models.TextField(blank=True, default='')
    # Lo que la vista devolvia antes en el JSON final (periodo_label, dias...).
    result = models.JSONField(default=dict, blank=True)

    progress_done = models.IntegerField(default=0)
    progress_total = models.IntegerField(default=0)
    progress_label = models.CharField(max_length=120, blank=True, default='')

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    username = models.CharField(max_length=150)

    created_at = models.DateTimeField(auto_now_add=True)
    # Latido: cada volcado de log lo actualiza. Sirve para detectar un job que
    # quedo "en curso" porque mataron al worker (ver `esta_muerto`).
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = f'"{DB_SCHEMA}"."analysis_jobs"' if DB_SCHEMA else 'analysis_jobs'
        ordering = ['-created_at']
        # Nombre explicito: el que Django autogenera sale de un hash del nombre
        # de la tabla, que aqui lleva el esquema dentro y cambia por entorno.
        # Sin fijarlo, la misma migracion no valdria para los dos.
        indexes = [models.Index(fields=['module', 'status'], name='analysis_jobs_mod_est_idx')]

    def __str__(self):
        return f"{self.get_module_display()} | {self.periodo or 'global'} | {self.status}"

    @property
    def esta_abierto(self):
        """Si la ejecucion sigue viva: encolada o calculando."""
        return self.status in self.ESTADOS_ABIERTOS

    @property
    def esta_muerto(self):
        """Job abierto que lleva demasiado tiempo sin dar senales de vida.

        Si el contenedor del worker muere de golpe, la fila se queda en
        `running` para siempre y bloquearia cualquier ejecucion posterior del
        mismo modulo. Pasado el margen se le deja de tener en cuenta.
        """
        if not self.esta_abierto:
            return False
        margen = getattr(settings, 'ANALYSIS_JOB_STALE_SECONDS', 15 * 60)
        return (timezone.now() - self.updated_at).total_seconds() > margen

    def to_dict(self):
        """Forma en la que el job viaja al cliente durante el sondeo."""
        return {
            "id": str(self.id),
            "module": self.module,
            "module_display": self.get_module_display(),
            "periodo": self.periodo,
            "status": self.status,
            "status_display": self.get_status_display(),
            "message": self.message,
            "log_output": self.log,
            "progress": {
                "done": self.progress_done,
                "total": self.progress_total,
                "label": self.progress_label,
            },
            "result": self.result or {},
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "finished_at": self.finished_at.strftime("%Y-%m-%d %H:%M:%S") if self.finished_at else None,
        }
