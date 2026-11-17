"""`/api/imports/`: carga de CSV, lanzamiento de análisis y su seguimiento.

La carga ocurre dentro de la petición; el análisis solo se encola (ver `jobs.py`).
Las mutaciones aceptan el permiso granular **o** el global heredado
(`can_import_data` / `can_run_calculations`).
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from core.exports import InvalidExport
from services.config.api import ApiError, endpoint
from services.config.auth import has_permission
from services.config.uploads import uploaded_csv
from services.crm.analytics import loader as crm_loader
from services.subscriptions.analytics import free_plans, invoices
from services.subscriptions.analytics import imports as subs_imports
from services.subscriptions.analytics.imports import EmptyCatalog, UncatalogedProducts
from services.support.analytics import loader as support_loader
from services.support.analytics import logs as support_logs

from .history import register_import_log
from .jobs import bloqueo_modulos, cancelar_job, job_en_curso, jobs_abiertos, lanzar_analisis
from .models import AnalysisJob, ImportActionLog

logger = logging.getLogger(__name__)

INTERNAL_ERROR = "Error interno del servidor. Consulte el registro de la aplicación."

# Los análisis que leen lo que reemplaza cada importación: importar mientras uno
# calcula le cambiaría los datos a mitad de camino.
SUBS_ANALYSES = ("subs_analysis", "subs_lifetime")
CRM_ANALYSES = ("crm_analysis",)
SUPPORT_ANALYSES = ("support_analysis",)

ANALYSIS_LABELS = {
    "subs_analysis": "churn",
    "subs_lifetime": "ciclo de vida",
    "crm_analysis": "CRM",
    "support_analysis": "soporte",
}

SUBS_IMPORT = ["can_import_subs", "can_import_data"]
CRM_IMPORT = ["can_import_crm", "can_import_data"]
SUPPORT_IMPORT = ["can_import_support", "can_import_data"]


class ImportRejected(Exception):
    """El fichero no se puede cargar por una razón que el usuario debe leer."""

    def __init__(self, message: str, status: int = 400, payload: dict | None = None):
        super().__init__(message)
        self.message, self.status, self.payload = message, status, payload or {}


def _import(
    request,
    *,
    log_module: str,
    analyses: tuple[str, ...],
    run: Callable[[str], tuple[int, str, str, dict]],
    upload_error: str,
    failure: str,
):
    """Recibe el CSV, lo carga con `run(path)` y deja el desenlace en el historial.

    `run` devuelve `(filas, mensaje, detalle, extra)`. 409 si un análisis que lee
    esas tablas está en curso.
    """
    upload = request.FILES.get("csv_file")
    file_name = upload.name if upload else "Desconocido"
    with bloqueo_modulos(analyses) as (turn, busy):
        if turn is None:
            raise ApiError(
                f"Hay un análisis de {ANALYSIS_LABELS.get(busy, busy)} en curso (o una importación de los "
                "mismos datos). Espera a que termine e inténtalo de nuevo: importar ahora le cambiaría los "
                "datos a mitad de cálculo.",
                409,
            )
        received = False
        try:
            with uploaded_csv(request) as path:
                received = True
                try:
                    try:
                        rows, message, detail, extra = run(path)
                    except InvalidExport as exc:
                        raise ImportRejected(str(exc)) from exc
                except ImportRejected as exc:
                    status = "warning" if exc.status == 409 and exc.payload else "error"
                    register_import_log(request.user, log_module, file_name, 0, status, exc.message, exc.message)
                    if exc.payload:
                        return {"status": "catalogo", "message": exc.message, **exc.payload}, exc.status
                    raise ApiError(exc.message, exc.status) from exc
                except Exception:
                    # El detalle va al log del servidor: psycopg2 nombra esquema, tabla y columnas.
                    logger.exception("Error al importar %s", log_module)
                    register_import_log(request.user, log_module, file_name, 0, "error", failure, INTERNAL_ERROR)
                    raise ApiError(INTERNAL_ERROR, 500) from None
        except ApiError:
            if not received:
                register_import_log(request.user, log_module, file_name, 0, "error", upload_error)
            raise
    register_import_log(request.user, log_module, file_name, rows, "success", message, detail)
    return {"status": "success", "message": message, **extra}


@endpoint(perms=["can_view_imports", "can_view_imports_subs"], require_all=True)
def subscriptions(request):
    """Las columnas de Odoo que espera la carga de suscripciones."""
    return {"camposOdoo": subs_imports.odoo_fields()}


@endpoint(perms=["can_view_imports", "can_view_imports_crm"], require_all=True)
def crm(request):
    """Las columnas de Odoo que espera la carga de CRM."""
    return {"camposOdoo": crm_loader.odoo_fields()}


@endpoint(perms=["can_view_imports", "can_view_imports_support"], require_all=True)
def support(request):
    """Las columnas de Odoo de tickets y logs, y si ya hay logs cargados."""
    return {
        "camposOdoo": support_loader.odoo_fields(),
        "camposOdooLogs": support_logs.odoo_fields(),
        "logsCargados": support_logs.loaded_logs_summary(),
    }


@endpoint(perms=["can_view_imports", "can_view_import_history"], require_all=True)
def history(request):
    """Las 200 últimas importaciones y cálculos."""
    return {"history": [log.to_dict() for log in ImportActionLog.objects.all()[:200]]}


def _subscriptions_file(path: str):
    try:
        rows = subs_imports.import_subscriptions(path)
    except UncatalogedProducts as exc:
        # No se escribió nada: el cliente ofrece crear los productos o ignorarlos.
        raise ImportRejected(str(exc), 409, {"productos": exc.products, "ordenes": exc.orders}) from exc
    except EmptyCatalog as exc:
        raise ImportRejected(str(exc), 409) from exc
    message = f"Suscripciones: {rows} filas importadas correctamente."
    return rows, message, f"Procesamiento exitoso de {rows} registros.", {}


@endpoint(methods=["POST"], perms=SUBS_IMPORT, rate="5/m")
def import_subscriptions(request):
    """El export de suscripciones. 409 `catalogo` si hay productos fuera del catálogo."""
    return _import(
        request, log_module="subs_subscriptions", analyses=SUBS_ANALYSES, run=_subscriptions_file,
        upload_error="Error al recibir el archivo de suscripciones.",
        failure="Fallo al importar.",
    )


def _free_plans_file(path: str):
    rows = free_plans.import_free_plans(path)
    return (rows, f"Planes gratuitos: {rows} suscripciones importadas y fechadas.",
            f"Deteccion de inicio de plan gratuito sobre {rows} suscripciones.", {})


@endpoint(methods=["POST"], perms=SUBS_IMPORT, rate="5/m")
def import_free_plans(request):
    """El export de planes gratuitos: detecta desde cuándo lo son."""
    return _import(
        request, log_module="subs_subscriptions", analyses=SUBS_ANALYSES, run=_free_plans_file,
        upload_error="Error al recibir el archivo de planes gratuitos.",
        failure="Fallo al importar planes gratuitos.",
    )


def _invoices_file(path: str):
    count = invoices.import_invoices(path)
    return count, f"Facturas: {count} facturas importadas.", f"Carga del export de facturas con {count} facturas.", {}


@endpoint(methods=["POST"], perms=SUBS_IMPORT, rate="5/m")
def import_invoices(request):
    """El export global de facturas (lo usa Comisiones)."""
    return _import(
        request, log_module="subs_subscriptions", analyses=SUBS_ANALYSES, run=_invoices_file,
        upload_error="Error al recibir el archivo de facturas.", failure="Fallo al importar facturas.",
    )


def _subscription_logs_file(path: str):
    rows = subs_imports.import_logs(path)
    return rows, f"Logs de Suscripciones: {rows} filas importadas.", f"Carga masiva de logs finalizada con {rows} filas.", {}


@endpoint(methods=["POST"], perms=SUBS_IMPORT, rate="5/m")
def import_subscription_logs(request):
    """Carga el CSV de logs de suscripciones."""
    return _import(
        request, log_module="subs_logs", analyses=SUBS_ANALYSES, run=_subscription_logs_file,
        upload_error="Error al recibir el archivo de logs.",
        failure="Fallo en carga de logs.",
    )


def _crm_file(path: str):
    clients, logs = crm_loader.import_crm(path)
    return (clients, f"CRM: Importados {clients} clientes y {logs} logs exitosamente.",
            f"Clientes: {clients} | Logs: {logs}", {})


@endpoint(methods=["POST"], perms=CRM_IMPORT, rate="5/m")
def import_crm(request):
    """El export de CRM: oportunidades y movimientos."""
    return _import(
        request, log_module="crm", analyses=CRM_ANALYSES, run=_crm_file,
        upload_error="Error al recibir el archivo de CRM.", failure="Fallo en importación CRM.",
    )


def _support_file(path: str):
    rows = support_loader.import_tickets(path)
    return rows, f"Technical Support: {rows} tickets importados correctamente.", f"Carga realizada exitosamente con {rows} registros.", {}


@endpoint(methods=["POST"], perms=SUPPORT_IMPORT, rate="5/m")
def import_support(request):
    """Carga el CSV de tickets de soporte."""
    return _import(
        request, log_module="support", analyses=SUPPORT_ANALYSES, run=_support_file,
        upload_error="Error al recibir el archivo de soporte.",
        failure="Fallo al importar tickets.",
    )


def _support_logs_file(path: str):
    r = support_logs.import_ticket_logs(path)
    message = (
        f"Logs de soporte: {r['nuevos']} nuevos y {r['repetidos']} que ya estaban, "
        f"de {r['tickets']} tickets ({r['desde']} a {r['hasta']})."
    )
    detail = (
        f"Lote de logs: {r['filas']} filas leídas, {r['nuevos']} nuevas, {r['repetidos']} repetidas, "
        f"{r['duplicados_en_archivo']} duplicadas dentro del archivo."
    )
    return r["nuevos"], message, detail, {"lote": r, "cargados": support_logs.loaded_logs_summary()}


@endpoint(methods=["POST"], perms=SUPPORT_IMPORT, rate="5/m")
def import_support_logs(request):
    """Suma un lote de logs de etapa; cada log entra una sola vez por su id."""
    return _import(
        request, log_module="support", analyses=SUPPORT_ANALYSES, run=_support_logs_file,
        upload_error="Error al recibir el archivo de logs de soporte.", failure="Fallo al importar logs de soporte.",
    )


@endpoint(methods=["POST"], perms=["can_run_subs_analysis", "can_run_calculations"], rate="2/m")
def run_subscriptions(request):
    """Encola el análisis mensual de churn."""
    return lanzar_analisis(request, "subs_analysis")


@endpoint(methods=["POST"], perms=["can_run_crm_analysis", "can_run_calculations"], rate="2/m")
def run_crm(request):
    """Encola el análisis mensual de CRM."""
    return lanzar_analisis(request, "crm_analysis")


@endpoint(methods=["POST"], perms=["can_run_support_analysis", "can_run_calculations"], rate="2/m")
def run_support(request):
    """Encola el análisis mensual de soporte."""
    return lanzar_analisis(request, "support_analysis")


def _job_visible(request, job) -> bool:
    """Quien lo lanzó, quien ve el historial y los superusuarios."""
    return job.user_id == request.user.id or has_permission(request.user, "can_view_import_history")


def _visible_job(request, job_id) -> AnalysisJob:
    job = AnalysisJob.objects.filter(pk=job_id).first()
    if job is None or not _job_visible(request, job):
        raise ApiError("Ejecución no encontrada.", 404)
    return job


@endpoint()
def job_detail(request, job_id):
    """Estado vivo de una ejecución. Se sondea cada pocos segundos: sin límite."""
    return _visible_job(request, job_id).to_dict()


@endpoint(methods=["POST"], rate="10/m")
def job_cancel(request, job_id):
    """Cancela una ejecución abierta; el worker se detiene en su siguiente punto de control.

    Puede quien la lanzó o quien puede lanzar análisis (`can_run_calculations`).
    """
    job = _visible_job(request, job_id)
    if job.user_id != request.user.id and not has_permission(request.user, "can_run_calculations"):
        raise ApiError("No tienes permiso para cancelar esta ejecución.", 403)
    if not job.esta_abierto:
        return {
            "status": "error",
            "message": f"La ejecución ya terminó ({job.get_status_display()}).",
            "job": job.to_dict(),
        }, 409
    cancelar_job(job, request.user.username)
    return {
        "status": "cancelled",
        "message": (
            "Cancelación solicitada. El análisis se detiene en su próximo punto de control."
            if job.started_at else "Análisis cancelado antes de empezar."
        ),
        "job": job.to_dict(),
    }


@endpoint()
def job_queue(request):
    """Lo que calcula o espera turno, para el aviso flotante. Sin límite: se sondea."""
    visible = [job for job in jobs_abiertos() if _job_visible(request, job)]
    return {
        "jobs": [job.to_dict() for job in visible],
        "en_ejecucion": sum(1 for j in visible if j.status == AnalysisJob.EN_CURSO),
        "en_cola": sum(1 for j in visible if j.status == AnalysisJob.PENDIENTE),
    }


@endpoint()
def job_active(request):
    """La ejecución abierta de un módulo, para reengancharse tras recargar."""
    module = request.GET.get("module") or ""
    if module not in dict(ImportActionLog.MODULE_CHOICES):
        raise ApiError("Módulo inválido.")
    job = job_en_curso(module)
    return {"job": job.to_dict() if job is not None and _job_visible(request, job) else None}
