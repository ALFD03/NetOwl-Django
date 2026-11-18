"""Tareas de Celery: los analisis que antes corrian dentro de la peticion.

Un analisis mensual de suscripciones tarda minutos (una lectura completa de
logs mas el cierre del mes mas el corte de cada dia). En el ciclo
peticion/respuesta eso significaba un 504 del proxy inverso y, peor, un worker
de gunicorn muerto a los 300s dejando el mes con la mitad de los dias escritos.

Aqui cada analisis es una tarea con su fila en `AnalysisJob`: la vista encola y
responde al instante, el worker calcula sin limite de peticion y va escribiendo
log y progreso en esa fila, que es lo que sondea la interfaz.

Todas las tareas comparten el mismo esqueleto (`run_analysis`) y solo se
diferencian en la funcion de calculo, registrada en `RUNNERS`.

El worker corre varias a la vez (`CELERY_WORKER_CONCURRENCY`), pero nunca dos
del mismo modulo: eso lo garantiza `module_lock`, porque los analisis de un
mismo modulo comparten tabla. Asi se puede lanzar churn, CRM y soporte a la vez
y encolar de paso tres meses de churn, que iran uno detras de otro.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.db import close_old_connections

from core import fixtures
from core.database import DBConnector
from core.models import Period
from core.utils import capture_console
from services.audit.log import record
from services.audit.models import AuditLog

from .history import register_import_log
from .jobs import (
    AnalysisCancelled,
    JobConsole,
    mark_finished,
    mark_started,
    module_lock,
)
from .models import AnalysisJob

logger = logging.getLogger(__name__)

# Cada cuanto vuelve a intentarlo un analisis que encontro su modulo ocupado.
SHIFT_WAIT_SECONDS = 20


# --- Analisis concretos ---------------------------------------------------
#
# Cada runner recibe el job y su consola, y devuelve `(mensaje, resultado)`.
# El resultado es lo que la vista devolvia antes en el JSON final y lo que la
# interfaz usa para componer el mensaje de exito.

def _run_subscriptions(job: AnalysisJob, console: JobConsole):
    """Analisis mensual de churn mas las metricas de cada dia del mes.

    Comprueba el catalogo **antes** de calcular y reutiliza el mismo analyzer para
    el cierre y para los dias, de modo que toda la ejecucion hace una sola lectura
    de datos.
    """
    from services.subscriptions.analytics import MetricsAnalyzer, build_day_metrics
    from services.subscriptions.analytics.imports import products_outside_catalog

    # La importacion garantiza que toda orden entra con un plan catalogado,
    # pero un plan se puede borrar despues, y los datos cargados antes de que
    # esa comprobacion existiera pueden no tener ninguno. Se mira aqui arriba,
    # antes de los minutos de calculo que darian una respuesta mala igualmente.
    outside = products_outside_catalog()
    if outside:
        detail = ", ".join(f"{p['nombre']} ({p['ordenes']} órdenes)" for p in outside[:10])
        if len(outside) > 10:
            detail += f" y {len(outside) - 10} más"
        raise RuntimeError(
            f"{len(outside)} producto(s) no están en el catálogo: {detail}. "
            "Regístralos en Catálogos → Productos (o márcalos como ignorados) "
            "y vuelve a lanzar el análisis."
        )

    period = Period.build(f"{job.period}-01")
    period_label = period.label()

    db = DBConnector()
    analyzer = MetricsAnalyzer(db, period)
    analyzer.run()
    # Mismo analyzer: los datos ya estan cargados, asi que el cierre del mes y
    # las metricas de cada dia salen de una sola lectura.
    days = build_day_metrics(
        job.period, db=db, analyzer=analyzer, progress=console.progress
    )["dias_calculados"]

    message = (
        f"Análisis de Churn completado para el periodo {period_label}"
        f" ({days} días calculados)."
    )
    return message, {"periodo_label": period_label, "dias_calculados": days}


def _run_crm(job: AnalysisJob, console: JobConsole):
    """Analisis del embudo de CRM para un mes, mas el corte de cada dia.

    El recorrido de los dias lo hace el propio analisis sobre la base que ya
    tiene cargada; aqui solo se le pasa la consola para que alimente la barra.
    """
    from services.crm.analytics import get_crm_day_series, run_crm_analysis

    run_crm_analysis(job.period, progress=console.progress)
    days = len(get_crm_day_series(job.period).get("dias_disponibles", []))
    message = (
        f"Análisis de CRM completado exitosamente para el periodo {job.period}"
        f" ({days} días calculados)."
    )
    return message, {"periodo_label": job.period, "dias_calculados": days}


def _run_support(job: AnalysisJob, console: JobConsole):
    """Analisis de las cohortes de soporte para un mes, mas el corte de cada dia."""
    from services.support.analytics import get_support_day_series, run_support_analysis

    run_support_analysis(job.period, progress=console.progress)
    days = len(get_support_day_series(job.period).get("dias_disponibles", []))
    message = (
        f"Análisis de Technical Support completado para {job.period}"
        f" ({days} días calculados)."
    )
    return message, {"periodo_label": job.period, "dias_calculados": days}


def _run_lifetime(job: AnalysisJob, console: JobConsole):
    """Lifetime de las bajas de cada mes, desde enero de 2026.

    Calcula todos los meses de una vez; la pagina lee despues el que se elija
    con `get_lifetime_month`. El job solo guarda el resumen escalar.
    """
    from services.subscriptions.analytics.lifetime import run_lifetime_analysis

    summary = run_lifetime_analysis()
    message = (
        f"Lifetime calculado: {summary['meses_calculados']} meses,"
        f" {summary['bajas_totales']} bajas (datos al {summary['fecha_corte']})."
    )
    return message, summary


RUNNERS: dict[str, Callable[[AnalysisJob, JobConsole], tuple[str, dict]]] = {
    'subs_analysis': _run_subscriptions,
    'crm_analysis': _run_crm,
    'support_analysis': _run_support,
    'subs_lifetime': _run_lifetime,
}


# --- Esqueleto comun ------------------------------------------------------

@shared_task(bind=True, name="imports.run_analysis", max_retries=None)
def run_analysis(self, job_id: str) -> None:
    """Ejecuta el analisis del job indicado y deja el desenlace en su fila.

    No propaga la excepcion: el error interesa en el job (lo lee la interfaz) y
    en el historial de importaciones, no como traza de Celery que nadie mira.

    La misma guarda que descarta una reentrega tras reiniciar el worker es la que
    cancela un analisis que todavia esperaba en la cola: cancelarlo cierra su
    fila, y una fila cerrada no se ejecuta.

    Si otro analisis del mismo modulo tiene el turno, la tarea se reencola en
    vez de esperar ocupando un hueco del worker: mientras tanto el job se queda
    en `pending` y la interfaz lo enseña, correctamente, como que espera turno.
    """
    close_old_connections()
    try:
        job = AnalysisJob.objects.get(pk=job_id)
    except AnalysisJob.DoesNotExist:
        logger.error("Job de analisis inexistente: %s", job_id)
        return

    # Reentrega tras un reinicio del worker, o analisis cancelado mientras
    # esperaba turno: el mensaje sigue en la cola pero la fila ya esta cerrada.
    # Repetirlo reescribiria el periodo entero.
    if not job.is_open:
        logger.warning("Job %s ya cerrado (%s); no se ejecuta", job_id, job.status)
        return

    with module_lock(job.module) as shift:
        if shift is None:
            # `countdown` y no espera activa: el hueco del worker queda libre
            # para un analisis de otro modulo, que es justo lo que se busca.
            raise self.retry(countdown=SHIFT_WAIT_SECONDS)
        _run_with_turn(self, job)


def _run_with_turn(celery_task, job: AnalysisJob) -> None:
    """Cuerpo del analisis, ya con el turno del modulo tomado."""
    # El catalogo se lee cacheado durante 60s. Olvidarlo al empezar garantiza
    # que la ejecucion arranca con lo ultimo que se guardo y, sobre todo, que
    # no cambia de catalogo a mitad de un calculo que dura minutos.
    fixtures.reset_cache()
    mark_started(job, getattr(celery_task.request, 'id', ''))
    console = JobConsole(job)
    runner = RUNNERS[job.module]
    label = f"Periodo {job.period}" if job.period else "Global"

    try:
        with capture_console(console):
            message, result = runner(job, console)
    except AnalysisCancelled:
        # Lo pidio alguien desde la interfaz: la fila ya esta en `cancelled` y con
        # su mensaje. Aqui solo se cierra -vuelca el log parcial, que es lo que
        # dice hasta donde llego- y se deja constancia en el historial.
        text = (
            AnalysisJob.objects.filter(pk=job.pk)
            .values_list('message', flat=True)
            .first()
            or "Análisis cancelado."
        )
        mark_finished(job, console, AnalysisJob.CANCELLED_STATE, text)
        register_import_log(job.user, job.module, label, 0, 'warning', text, job.log)
        _audit(job, 'analisis_cancelado', AuditLog.REJECTED, text)
        return
    except SoftTimeLimitExceeded:
        text = (
            "El análisis superó el tiempo máximo de ejecución y fue detenido."
            " Revise el volumen de datos o divida el periodo."
        )
        mark_finished(job, console, AnalysisJob.ERROR, text)
        register_import_log(job.user, job.module, label, 0, 'error', text, job.log)
        _audit(job, 'analisis_fallido', AuditLog.ERROR, text)
        return
    except Exception:  # noqa: BLE001 - el desenlace se reporta, no se propaga
        logger.exception("Fallo en el analisis %s (%s)", job.module, job.id)
        # El mensaje va a `job.message` y al historial, que se muestran en la
        # interfaz: `str(e)` de psycopg2 nombra el esquema, la tabla y las
        # columnas. El detalle queda en logs/app.log, que es donde toca.
        text = (
            "Fallo en la ejecución del análisis."
            " Consulte el registro de la aplicación para ver el detalle."
        )
        mark_finished(job, console, AnalysisJob.ERROR, text)
        register_import_log(job.user, job.module, label, 0, 'error', text, job.log)
        _audit(job, 'analisis_fallido', AuditLog.ERROR, text)
        return

    rows = int(result.get("dias_calculados") or 0)
    mark_finished(job, console, AnalysisJob.SUCCESS, message, result)
    register_import_log(job.user, job.module, label, rows, 'success', message, job.log)
    _audit(job, 'analisis_terminado', AuditLog.OK, message)


def _audit(job: AnalysisJob, action: str, result: str, text: str) -> None:
    """Anota el desenlace en auditoria, a nombre de quien lanzo el analisis.

    Lanzarlo ya quedo anotado por el middleware; esto dice como acabo, que
    ocurre en el worker, sin peticion de por medio.
    """
    record(
        module='analisis',
        action=action,
        user=job.user,
        description=text,
        target=f"module={job.module}" + (f" · periodo={job.period}" if job.period else ""),
        detail={'job_id': str(job.id), 'module': job.module, 'periodo': job.period or None},
        outcome=result,
    )
