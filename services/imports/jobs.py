"""Piezas compartidas entre las vistas que encolan y las tareas que ejecutan.

Las vistas crean el `AnalysisJob` y lo mandan a la cola; el worker lo recoge,
escribe aqui su progreso y su log, y la interfaz lee esa misma fila por sondeo.
Todo lo que las dos partes necesitan saber vive en este modulo.
"""

from __future__ import annotations

import contextlib
import io
import json
import logging
import time

from django.conf import settings
from django.db import close_old_connections
from django.http import JsonResponse
from django.utils import timezone

from .models import AnalysisJob

logger = logging.getLogger(__name__)


def job_en_curso(module: str) -> AnalysisJob | None:
    """Ejecucion abierta de ese modulo, o None si no hay ninguna viva.

    Un job cuyo worker murio a la fuerza se queda en `running` para siempre; sin
    descartarlo, el modulo quedaria bloqueado hasta tocar la base a mano (ver
    `AnalysisJob.esta_muerto`).
    """
    abiertos = AnalysisJob.objects.filter(
        module=module, status__in=AnalysisJob.ESTADOS_ABIERTOS
    )
    for job in abiertos:
        if not job.esta_muerto:
            return job
    return None


def job_duplicado(module: str, periodo: str) -> AnalysisJob | None:
    """Ejecucion abierta que escribiria exactamente lo mismo que la pedida.

    Lo que no se puede permitir no es que haya varios analisis a la vez, sino
    que dos escriban el mismo periodo del mismo modulo: los dos borran y
    reescriben esas filas, y el resultado depende de quien termine ultimo. Dos
    meses distintos, o dos modulos distintos, no se estorban y pueden encolarse.

    El ciclo de vida no tiene periodo, asi que su duplicado es simplemente otro
    ciclo de vida abierto.
    """
    abiertos = AnalysisJob.objects.filter(
        module=module, periodo=periodo or '', status__in=AnalysisJob.ESTADOS_ABIERTOS
    )
    for job in abiertos:
        if not job.esta_muerto:
            return job
    return None


@contextlib.contextmanager
def bloqueo_modulo(module: str):
    """Toma el turno de escritura de un modulo, o cede si ya lo tiene otro.

    Con el worker en paralelo pueden coincidir dos analisis, y dos analisis del
    mismo modulo comparten tabla: ademas de reescribir filas, `save_historico`
    crea y altera la tabla sobre la marcha, y dos DDL simultaneas sobre la misma
    tabla acaban en bloqueo mutuo. Este cerrojo deja que corran a la vez modulos
    distintos -que es lo que se queria- y pone en fila los del mismo modulo.

    El cerrojo vive en Redis con caducidad: si el worker muere a la fuerza se
    suelta solo, en vez de dejar el modulo bloqueado para siempre. Lleva el
    sufijo del entorno, asi que desarrollo y produccion no comparten turno
    aunque compartan el Redis.

    Cede el control con `None` cuando no lo consigue; no espera.
    """
    import redis

    cliente = redis.Redis.from_url(settings.REDIS_URL)
    cerrojo = cliente.lock(
        f"netowl:analisis:{settings.ENV_SUFFIX}:{module}",
        timeout=settings.ANALYSIS_LOCK_TIMEOUT,
        blocking=False,
    )
    if not cerrojo.acquire(blocking=False):
        yield None
        return
    try:
        yield cerrojo
    finally:
        # `LockNotOwnedError` si el analisis duro mas que la caducidad: el
        # cerrojo ya es de otro y soltarlo seria quitarselo.
        with contextlib.suppress(Exception):
            cerrojo.release()


def jobs_abiertos() -> list[AnalysisJob]:
    """Todas las ejecuciones vivas, en el orden en que entraron a la cola.

    Lo consume el aviso flotante de la interfaz: `job_en_curso` responde por un
    modulo, pero el usuario quiere ver de un vistazo todo lo que hay corriendo
    y esperando, sea de churn, CRM o soporte.

    En ejecucion primero y luego las que esperan turno, que es como avanzaran.
    """
    abiertos = AnalysisJob.objects.filter(
        status__in=AnalysisJob.ESTADOS_ABIERTOS
    ).order_by('created_at')
    vivos = [job for job in abiertos if not job.esta_muerto]
    return sorted(vivos, key=lambda j: (j.status != AnalysisJob.EN_CURSO, j.created_at))


def crear_job(user, module: str, periodo: str = '') -> AnalysisJob:
    """Crea la fila de una ejecucion en estado `pending`.

    El usuario se guarda con `SET_NULL`, asi que un job puede sobrevivir a la
    cuenta que lo lanzo.
    """
    return AnalysisJob.objects.create(
        module=module,
        periodo=periodo or '',
        user=user if user.is_authenticated else None,
        username=user.username if user.is_authenticated else 'Sistema',
        status=AnalysisJob.PENDIENTE,
    )


class ConsolaJob(io.StringIO):
    """Buffer de stdout que ademas va volcando el log a la fila del job.

    El analisis narra su avance con `print`; antes esa salida solo llegaba al
    navegador al terminar, dentro del JSON de respuesta. Ahora se guarda en la
    base cada `INTERVALO_VOLCADO` segundos, que es lo que convierte la consola
    de la interfaz en algo que se lee en vivo.

    No se vuelca en cada `write` a proposito: un analisis mensual imprime una
    linea por dia y varias por bloque, y un UPDATE por linea multiplicaria las
    escrituras sin que el usuario note diferencia.
    """

    INTERVALO_VOLCADO = 2.0

    def __init__(self, job: AnalysisJob):
        super().__init__()
        self.job = job
        self._ultimo_volcado = 0.0
        # Evita reentrar si algo dentro del propio volcado escribiese a stdout,
        # que en ese momento sigue redirigido a este buffer.
        self._volcando = False

    def write(self, s):  # noqa: D102 - contrato de StringIO
        """Acumula la salida y, cada `INTERVALO_VOLCADO`, la guarda en el job."""
        escrito = super().write(s)
        ahora = time.monotonic()
        if not self._volcando and ahora - self._ultimo_volcado >= self.INTERVALO_VOLCADO:
            self.volcar()
        return escrito

    def volcar(self, **campos) -> None:
        """Guarda el log acumulado (y los campos indicados) en el job.

        Nunca propaga: esto es la narracion del analisis, no el analisis. Un
        corte de conexion mientras se guarda el log no puede tirar un calculo de
        varios minutos. Se reintenta una vez porque el fallo tipico es una
        conexion caducada entre dos volcados, y `close_old_connections` la
        renueva.
        """
        if self._volcando:
            return
        self._volcando = True
        try:
            self.job.log = self.getvalue()
            for nombre, valor in campos.items():
                setattr(self.job, nombre, valor)
            campos_a_guardar = ['log', 'updated_at', *campos.keys()]
            try:
                self.job.save(update_fields=campos_a_guardar)
            except Exception:
                close_old_connections()
                self.job.save(update_fields=campos_a_guardar)
            self._ultimo_volcado = time.monotonic()
        except Exception:
            logger.exception("No se pudo guardar el progreso del job %s", self.job.pk)
            # Se reintentara en el siguiente volcado; no se toca el reloj para
            # que el proximo write lo intente de inmediato.
        finally:
            self._volcando = False

    def progreso(self, hechos: int, total: int, etiqueta: str = '') -> None:
        """Callback de avance que reciben los analisis con pasos contables."""
        self.job.progress_done = hechos
        self.job.progress_total = total
        self.job.progress_label = etiqueta
        # El progreso si se fuerza: es lo que mueve la barra, y llega una vez
        # por dia calculado, no una vez por linea impresa.
        self.volcar(
            progress_done=hechos, progress_total=total, progress_label=etiqueta
        )


def marcar_inicio(job: AnalysisJob, task_id: str) -> None:
    """Pasa el job a `running` y le anota el id de la tarea de Celery."""
    close_old_connections()
    job.status = AnalysisJob.EN_CURSO
    job.task_id = task_id or ''
    job.started_at = timezone.now()
    job.save(update_fields=['status', 'task_id', 'started_at', 'updated_at'])


def marcar_fin(
    job: AnalysisJob,
    consola: ConsolaJob,
    status: str,
    message: str,
    result: dict | None = None,
) -> None:
    """Cierra el job con su desenlace y fuerza el ultimo volcado del log."""
    job.status = status
    job.message = message
    job.result = result or {}
    job.finished_at = timezone.now()
    consola.volcar(
        status=status, message=message, result=job.result, finished_at=job.finished_at
    )


# --- Lanzamiento -----------------------------------------------------------
#
# Vive aqui y no en las vistas porque lo usan dos apps: `imports` (churn, CRM,
# soporte) y `subscriptions` (ciclo de vida).

def lanzar_analisis(request, module, requiere_periodo=True):
    """Valida el mes, crea el job y lo encola. Devuelve la respuesta ya hecha."""
    periodo = ''
    if requiere_periodo:
        try:
            data = json.loads(request.body)
            periodo = data.get("month")
        except Exception:
            return JsonResponse({"status": "error", "message": "JSON inválido"}, status=400)

        if not periodo or len(periodo) != 7:
            return JsonResponse(
                {"status": "error", "message": "Periodo inválido (YYYY-MM)"}, status=400
            )

    # Solo se rechaza el duplicado exacto: pedir otra vez el mismo periodo del
    # mismo modulo que ya esta encolado o corriendo no calcularia nada nuevo, y
    # las dos ejecuciones se pisarian las mismas filas. Cualquier otra
    # combinacion se encola y espera turno.
    duplicado = job_duplicado(module, periodo)
    if duplicado is not None:
        en_curso = duplicado.status == AnalysisJob.EN_CURSO
        return JsonResponse({
            "status": "running",
            "message": (
                f"Este análisis{f' del periodo {duplicado.periodo}' if duplicado.periodo else ''}"
                f"{' ya se está ejecutando' if en_curso else ' ya está en la cola'}."
                " Se muestra su progreso."
            ),
            "job": duplicado.to_dict(),
        }, status=409)

    # Import diferido: `tasks` importa este modulo para su consola y su
    # registro de estado, asi que hacerlo arriba cerraria el ciclo.
    from .tasks import ejecutar_analisis

    job = crear_job(request.user, module, periodo)
    ejecutar_analisis.delay(str(job.id))
    return JsonResponse({
        "status": "queued",
        "message": "Análisis encolado. El cálculo continúa aunque cierres esta página.",
        "job": job.to_dict(),
    }, status=202)
