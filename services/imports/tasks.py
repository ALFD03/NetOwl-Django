"""Tareas de Celery: los analisis que antes corrian dentro de la peticion.

Un analisis mensual de suscripciones tarda minutos (una lectura completa de
logs mas el cierre del mes mas el corte de cada dia). En el ciclo
peticion/respuesta eso significaba un 504 del proxy inverso y, peor, un worker
de gunicorn muerto a los 300s dejando el mes con la mitad de los dias escritos.

Aqui cada analisis es una tarea con su fila en `AnalysisJob`: la vista encola y
responde al instante, el worker calcula sin limite de peticion y va escribiendo
log y progreso en esa fila, que es lo que sondea la interfaz.

Todas las tareas comparten el mismo esqueleto (`ejecutar_analisis`) y solo se
diferencian en la funcion de calculo, registrada en `RUNNERS`.

El worker corre varias a la vez (`CELERY_WORKER_CONCURRENCY`), pero nunca dos
del mismo modulo: eso lo garantiza `bloqueo_modulo`, porque los analisis de un
mismo modulo comparten tabla. Asi se puede lanzar churn, CRM y soporte a la vez
y encolar de paso tres meses de churn, que iran uno detras de otro.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.db import close_old_connections

from core.database import DBConnector
from core.models import Periodo
from core.utils import capture_console

from .history import register_import_log
from .jobs import ConsolaJob, bloqueo_modulo, marcar_fin, marcar_inicio
from .models import AnalysisJob

logger = logging.getLogger(__name__)

# Cada cuanto vuelve a intentarlo un analisis que encontro su modulo ocupado.
ESPERA_TURNO_SEGUNDOS = 20


# --- Analisis concretos ---------------------------------------------------
#
# Cada runner recibe el job y su consola, y devuelve `(mensaje, resultado)`.
# El resultado es lo que la vista devolvia antes en el JSON final y lo que la
# interfaz usa para componer el mensaje de exito.

def _correr_subscriptions(job: AnalysisJob, consola: ConsolaJob):
    from services.subscriptions.analytics import MetricsAnalyzer, build_day_metrics

    periodo = Periodo.build(f"{job.periodo}-01")
    periodo_label = periodo.label()

    db = DBConnector()
    analyzer = MetricsAnalyzer(db, periodo)
    analyzer.run()
    # Mismo analyzer: los datos ya estan cargados, asi que el cierre del mes y
    # las metricas de cada dia salen de una sola lectura.
    dias = build_day_metrics(
        job.periodo, db=db, analyzer=analyzer, progreso=consola.progreso
    )["dias_calculados"]

    mensaje = (
        f"Análisis de Churn completado para el periodo {periodo_label}"
        f" ({dias} días calculados)."
    )
    return mensaje, {"periodo_label": periodo_label, "dias_calculados": dias}


def _correr_crm(job: AnalysisJob, consola: ConsolaJob):
    from services.crm.analytics import run_crm_analysis

    run_crm_analysis(job.periodo)
    mensaje = f"Análisis de CRM completado exitosamente para el periodo {job.periodo}."
    return mensaje, {"periodo_label": job.periodo}


def _correr_support(job: AnalysisJob, consola: ConsolaJob):
    from services.support.analytics import run_support_analysis

    run_support_analysis(job.periodo)
    mensaje = f"Análisis de Technical Support completado para {job.periodo}."
    return mensaje, {"periodo_label": job.periodo}


def _correr_lifetime(job: AnalysisJob, consola: ConsolaJob):
    from services.subscriptions.analytics.lifetime import run_lifecycle_analysis

    metrics = run_lifecycle_analysis()
    # Las curvas de supervivencia son series largas: no viajan en el estado del
    # job, se leen despues con `get_lifecycle_results`.
    resumen = {
        k: v for k, v in (metrics or {}).items()
        if isinstance(v, (int, float, str, bool)) or v is None
    }
    return "Análisis de ciclo de vida completado.", resumen


RUNNERS: dict[str, Callable[[AnalysisJob, ConsolaJob], tuple[str, dict]]] = {
    'subs_analysis': _correr_subscriptions,
    'crm_analysis': _correr_crm,
    'support_analysis': _correr_support,
    'subs_lifetime': _correr_lifetime,
}


# --- Esqueleto comun ------------------------------------------------------

@shared_task(bind=True, name="imports.ejecutar_analisis", max_retries=None)
def ejecutar_analisis(self, job_id: str) -> None:
    """Ejecuta el analisis del job indicado y deja el desenlace en su fila.

    No propaga la excepcion: el error interesa en el job (lo lee la interfaz) y
    en el historial de importaciones, no como traza de Celery que nadie mira.

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

    # Reentrega tras un reinicio del worker: el mensaje sigue en la cola pero el
    # trabajo ya se dio por terminado. Repetirlo reescribiria el periodo entero.
    if not job.esta_abierto:
        logger.warning("Job %s ya cerrado (%s); se ignora la reentrega", job_id, job.status)
        return

    with bloqueo_modulo(job.module) as turno:
        if turno is None:
            # `countdown` y no espera activa: el hueco del worker queda libre
            # para un analisis de otro modulo, que es justo lo que se busca.
            raise self.retry(countdown=ESPERA_TURNO_SEGUNDOS)
        _ejecutar_con_turno(self, job)


def _ejecutar_con_turno(tarea, job: AnalysisJob) -> None:
    """Cuerpo del analisis, ya con el turno del modulo tomado."""
    marcar_inicio(job, getattr(tarea.request, 'id', ''))
    consola = ConsolaJob(job)
    runner = RUNNERS[job.module]
    etiqueta = f"Periodo {job.periodo}" if job.periodo else "Global"

    try:
        with capture_console(consola):
            mensaje, resultado = runner(job, consola)
    except SoftTimeLimitExceeded:
        texto = (
            "El análisis superó el tiempo máximo de ejecución y fue detenido."
            " Revise el volumen de datos o divida el periodo."
        )
        marcar_fin(job, consola, AnalysisJob.ERROR, texto)
        register_import_log(job.user, job.module, etiqueta, 0, 'error', texto, job.log)
        return
    except Exception as e:  # noqa: BLE001 - el desenlace se reporta, no se propaga
        logger.exception("Fallo en el analisis %s (%s)", job.module, job.id)
        texto = f"Fallo en la ejecución del análisis: {e}"
        marcar_fin(job, consola, AnalysisJob.ERROR, texto)
        register_import_log(job.user, job.module, etiqueta, 0, 'error', texto, job.log)
        return

    filas = int(resultado.get("dias_calculados") or 0)
    marcar_fin(job, consola, AnalysisJob.EXITO, mensaje, resultado)
    register_import_log(job.user, job.module, etiqueta, filas, 'success', mensaje, job.log)
