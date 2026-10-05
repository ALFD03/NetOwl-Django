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

from core import fixtures
from core.database import DBConnector
from core.models import Periodo
from core.utils import capture_console

from .history import register_import_log
from .jobs import (
    AnalisisCancelado,
    ConsolaJob,
    bloqueo_modulo,
    marcar_fin,
    marcar_inicio,
)
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
    """Analisis mensual de churn mas las metricas de cada dia del mes.

    Comprueba el catalogo **antes** de calcular y reutiliza el mismo analyzer para
    el cierre y para los dias, de modo que toda la ejecucion hace una sola lectura
    de datos.
    """
    from services.subscriptions.analytics import (
        MetricsAnalyzer,
        build_day_metrics,
        productos_fuera_de_catalogo,
    )

    # La importacion garantiza que toda orden entra con un plan catalogado,
    # pero un plan se puede borrar despues, y los datos cargados antes de que
    # esa comprobacion existiera pueden no tener ninguno. Se mira aqui arriba,
    # antes de los minutos de calculo que darian una respuesta mala igualmente.
    fuera = productos_fuera_de_catalogo()
    if fuera:
        detalle = ", ".join(f"{p['nombre']} ({p['ordenes']} órdenes)" for p in fuera[:10])
        if len(fuera) > 10:
            detalle += f" y {len(fuera) - 10} más"
        raise RuntimeError(
            f"{len(fuera)} producto(s) no están en el catálogo: {detalle}. "
            "Regístralos en Subscriptions → Catálogos (o márcalos como ignorados) "
            "y vuelve a lanzar el análisis."
        )

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
    """Analisis del embudo de CRM para un mes, mas el corte de cada dia.

    El recorrido de los dias lo hace el propio analisis sobre la base que ya
    tiene cargada; aqui solo se le pasa la consola para que alimente la barra.
    """
    from services.crm.analytics import get_crm_day_series, run_crm_analysis

    run_crm_analysis(job.periodo, progreso=consola.progreso)
    dias = len(get_crm_day_series(job.periodo).get("dias_disponibles", []))
    mensaje = (
        f"Análisis de CRM completado exitosamente para el periodo {job.periodo}"
        f" ({dias} días calculados)."
    )
    return mensaje, {"periodo_label": job.periodo, "dias_calculados": dias}


def _correr_support(job: AnalysisJob, consola: ConsolaJob):
    """Analisis de las cohortes de soporte para un mes, mas el corte de cada dia."""
    from services.support.analytics import get_support_day_series, run_support_analysis

    run_support_analysis(job.periodo, progreso=consola.progreso)
    dias = len(get_support_day_series(job.periodo).get("dias_disponibles", []))
    mensaje = (
        f"Análisis de Technical Support completado para {job.periodo}"
        f" ({dias} días calculados)."
    )
    return mensaje, {"periodo_label": job.periodo, "dias_calculados": dias}


def _correr_lifetime(job: AnalysisJob, consola: ConsolaJob):
    """Lifetime de las bajas de cada mes, desde enero de 2026.

    Calcula todos los meses de una vez; la pagina lee despues el que se elija
    con `get_lifetime_mes`. El job solo guarda el resumen escalar.
    """
    from services.subscriptions.analytics.lifetime import run_lifecycle_analysis

    resumen = run_lifecycle_analysis()
    mensaje = (
        f"Lifetime calculado: {resumen['meses_calculados']} meses,"
        f" {resumen['bajas_totales']} bajas (datos al {resumen['fecha_corte']})."
    )
    return mensaje, resumen


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
    if not job.esta_abierto:
        logger.warning("Job %s ya cerrado (%s); no se ejecuta", job_id, job.status)
        return

    with bloqueo_modulo(job.module) as turno:
        if turno is None:
            # `countdown` y no espera activa: el hueco del worker queda libre
            # para un analisis de otro modulo, que es justo lo que se busca.
            raise self.retry(countdown=ESPERA_TURNO_SEGUNDOS)
        _ejecutar_con_turno(self, job)


def _ejecutar_con_turno(tarea, job: AnalysisJob) -> None:
    """Cuerpo del analisis, ya con el turno del modulo tomado."""
    # El catalogo se lee cacheado durante 60s. Olvidarlo al empezar garantiza
    # que la ejecucion arranca con lo ultimo que se guardo y, sobre todo, que
    # no cambia de catalogo a mitad de un calculo que dura minutos.
    fixtures.reset_cache()
    marcar_inicio(job, getattr(tarea.request, 'id', ''))
    consola = ConsolaJob(job)
    runner = RUNNERS[job.module]
    etiqueta = f"Periodo {job.periodo}" if job.periodo else "Global"

    try:
        with capture_console(consola):
            mensaje, resultado = runner(job, consola)
    except AnalisisCancelado:
        # Lo pidio alguien desde la interfaz: la fila ya esta en `cancelled` y con
        # su mensaje. Aqui solo se cierra -vuelca el log parcial, que es lo que
        # dice hasta donde llego- y se deja constancia en el historial.
        texto = (
            AnalysisJob.objects.filter(pk=job.pk)
            .values_list('message', flat=True)
            .first()
            or "Análisis cancelado."
        )
        marcar_fin(job, consola, AnalysisJob.CANCELADO, texto)
        register_import_log(job.user, job.module, etiqueta, 0, 'warning', texto, job.log)
        return
    except SoftTimeLimitExceeded:
        texto = (
            "El análisis superó el tiempo máximo de ejecución y fue detenido."
            " Revise el volumen de datos o divida el periodo."
        )
        marcar_fin(job, consola, AnalysisJob.ERROR, texto)
        register_import_log(job.user, job.module, etiqueta, 0, 'error', texto, job.log)
        return
    except Exception:  # noqa: BLE001 - el desenlace se reporta, no se propaga
        logger.exception("Fallo en el analisis %s (%s)", job.module, job.id)
        # El mensaje va a `job.message` y al historial, que se muestran en la
        # interfaz: `str(e)` de psycopg2 nombra el esquema, la tabla y las
        # columnas. El detalle queda en logs/app.log, que es donde toca.
        texto = (
            "Fallo en la ejecución del análisis."
            " Consulte el registro de la aplicación para ver el detalle."
        )
        marcar_fin(job, consola, AnalysisJob.ERROR, texto)
        register_import_log(job.user, job.module, etiqueta, 0, 'error', texto, job.log)
        return

    filas = int(resultado.get("dias_calculados") or 0)
    marcar_fin(job, consola, AnalysisJob.EXITO, mensaje, resultado)
    register_import_log(job.user, job.module, etiqueta, filas, 'success', mensaje, job.log)
