"""Pantallas y endpoints del modulo de importaciones.

Dos cosas distintas conviven aqui: **la carga de CSV**, que ocurre dentro de la
peticion, y **el lanzamiento de analisis**, que solo encola y responde al
instante (el calculo lo hace el worker; ver `jobs.py` y `tasks.py`).

Excepcion deliberada de esta app: los endpoints de mutacion aceptan el permiso
granular **o** el global heredado (`can_import_data` / `can_run_calculations`),
para que las cuentas que ya los tenian no pierdan acceso. Ese patron OR debe
conservarse.
"""

import logging

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from services.config.decorators import deny, permission_required, permissions_all_required
from services.config.uploads import cleanup_tempfile, handle_csv_upload
from services.crm.analytics import campos_odoo_importacion as campos_odoo_crm
from services.crm.analytics import import_crm_csv
from services.crm.analytics.config import REQUIRED_CRM_HEADERS
from services.subscriptions.analytics import (
    CatalogoVacio,
    ProductosSinCatalogo,
    campos_odoo_importacion,
    import_gratis_csv,
    import_logs_csv,
    import_subscriptions_csv,
)
from services.subscriptions.analytics.config import REQUIRED_LOGS_HEADERS, REQUIRED_SUBS_HEADERS
from services.subscriptions.analytics.free_plans import REQUIRED_GRATIS_HEADERS
from services.support.analytics import campos_odoo_importacion as campos_odoo_support
from services.support.analytics import import_support_csv
from services.support.analytics.config import REQUIRED_SUPPORT_HEADERS

from .history import register_import_log
from .jobs import cancelar_job, job_en_curso, jobs_abiertos, lanzar_analisis
from .models import AnalysisJob, ImportActionLog

logger = logging.getLogger(__name__)

TEMPLATE_PREFIX = "imports/"

ERROR_GENERICO = "Error interno del servidor. Consulte el registro de la aplicación."


# Pestanas del modulo en el orden en que aparecen en la cabecera, con el permiso
# que exige cada una. La usa `imports_index_view` para elegir destino.
IMPORT_TABS = [
    ('imports:subscriptions', 'can_view_imports_subs'),
    ('imports:crm', 'can_view_imports_crm'),
    ('imports:support', 'can_view_imports_support'),
    ('imports:history', 'can_view_import_history'),
]


@login_required
@permission_required('can_view_imports')
def imports_index_view(request):
    """Portada del modulo: lleva a la primera pestana que el usuario si pueda ver.

    Antes `/imports/` era un alias de la pestana de Subscriptions, asi que un
    usuario con acceso a una sola pestana distinta entraba, se le negaba y se le
    expulsaba del modulo sin poder llegar nunca a la suya.
    """
    profile = getattr(request.user, 'profile', None)
    for route_name, perm in IMPORT_TABS:
        if request.user.is_superuser or (profile and profile.has_permission(perm)):
            return redirect(route_name)
    return deny(request, "Acceso denegado. No tienes ninguna pestaña de Importaciones asignada.")


@login_required
@permissions_all_required('can_view_imports', 'can_view_imports_subs')
def subscriptions_import_view(request):
    """Pestana de importacion de suscripciones."""
    return render_inertia(request, "Imports/Subscriptions", {
        "section": "subscriptions",
        "camposOdoo": campos_odoo_importacion(),
    })

@login_required
@permissions_all_required('can_view_imports', 'can_view_imports_crm')
def crm_import_view(request):
    """Pestana de importacion de CRM."""
    return render_inertia(request, "Imports/Crm", {
        "section": "crm",
        "camposOdoo": campos_odoo_crm(),
    })

@login_required
@permissions_all_required('can_view_imports', 'can_view_imports_support')
def support_import_view(request):
    """Pestana de importacion de soporte."""
    return render_inertia(request, "Imports/Support", {
        "section": "support",
        "camposOdoo": campos_odoo_support(),
    })

@login_required
@permissions_all_required('can_view_imports', 'can_view_import_history')
def history_view(request):
    """Historial de acciones: las 200 ultimas importaciones y calculos."""
    history_data = [log.to_dict() for log in ImportActionLog.objects.all()[:200]]
    return render_inertia(request, "Imports/History", {
        "history": history_data,
        "section": "history"
    })


@login_required
@permissions_all_required('can_view_imports', 'can_view_import_history')
def api_history_list(request):
    """El mismo historial, en JSON, para recargarlo sin cambiar de pagina."""
    data = [log.to_dict() for log in ImportActionLog.objects.all()[:200]]
    return JsonResponse({"history": data})


# --- ACCIONES Y PROCESAMIENTO CON REGISTRO DE HISTORIAL ---
#
# El orden de los decoradores importa: `@ratelimit` va **debajo** de
# `@permission_required`, de modo que una peticion sin permiso se rechaza antes
# de consumir cuota. Al reves, cualquier cuenta podia agotar el cubo de los
# calculos (2/m) pidiendo algo que ni siquiera tiene permitido.

@login_required
@permission_required('can_import_subs', 'can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_subscriptions(request):
    """Importa el export de suscripciones.

    Dos respuestas 409 que no son un fallo del fichero:
    `ProductosSinCatalogo` (hay productos que el catalogo no reconoce; **no se
    escribio nada**, la comprobacion corre antes del truncate) y `CatalogoVacio`
    (no hay ni un plan registrado, que es un problema de configuracion).
    """
    file_name = request.FILES.get("csv_file").name if "csv_file" in request.FILES else "Desconocido"
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_SUBS_HEADERS)
    if error:
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', 'Error en la estructura del archivo CSV.')
        return error
    try:
        rows = import_subscriptions_csv(tmp_path)
        msg = f"Suscripciones: {rows} filas importadas correctamente."
        register_import_log(request.user, 'subs_subscriptions', file_name, rows, 'success', msg, f"Procesamiento exitoso de {rows} registros.")
        return JsonResponse({"status": "success", "message": msg})
    except ProductosSinCatalogo as e:
        # No se escribio nada: la comprobacion corre antes del truncate. Se
        # responde con los productos y las ordenes afectadas para que el
        # cliente ofrezca crearlos en el catalogo o ignorarlos, en vez de
        # obligar a volver a subir el fichero a ciegas.
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'warning', str(e), str(e))
        return JsonResponse({
            "status": "catalogo",
            "message": str(e),
            "productos": e.productos,
            "ordenes": e.ordenes,
        }, status=409)
    except CatalogoVacio as e:
        # Distinto del anterior a proposito: aqui no falla el fichero sino la
        # configuracion, y confundirlos mandaba a revisar el export.
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', str(e), str(e))
        return JsonResponse({"status": "error", "message": str(e)}, status=409)
    except Exception:
        # El detalle va al log del servidor, no al cliente: una excepcion de
        # psycopg2 nombra el esquema, la tabla y las columnas implicadas.
        logger.exception("Error al importar suscripciones")
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', "Fallo al importar.", ERROR_GENERICO)
        return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_import_subs', 'can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_gratis(request):
    """Importa el export de planes gratuitos y detecta desde cuando lo son."""
    file_name = request.FILES.get("csv_file").name if "csv_file" in request.FILES else "Desconocido"
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_GRATIS_HEADERS)
    if error:
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', 'Error en la estructura del archivo de planes gratuitos.')
        return error
    try:
        rows = import_gratis_csv(tmp_path)
        msg = f"Planes gratuitos: {rows} suscripciones importadas y fechadas."
        register_import_log(request.user, 'subs_subscriptions', file_name, rows, 'success', msg, f"Deteccion de inicio de plan gratuito sobre {rows} suscripciones.")
        return JsonResponse({"status": "success", "message": msg})
    except Exception:
        # El detalle va al log del servidor, no al cliente: una excepcion de
        # psycopg2 nombra el esquema, la tabla y las columnas implicadas.
        logger.exception("Error al importar planes gratuitos")
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', "Fallo al importar planes gratuitos.", ERROR_GENERICO)
        return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_import_subs', 'can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_logs(request):
    """Importa el export de logs de suscripciones."""
    file_name = request.FILES.get("csv_file").name if "csv_file" in request.FILES else "Desconocido"
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_LOGS_HEADERS)
    if error:
        register_import_log(request.user, 'subs_logs', file_name, 0, 'error', 'Error en la estructura del archivo de Logs.')
        return error
    try:
        rows = import_logs_csv(tmp_path)
        msg = f"Logs de Suscripciones: {rows} filas importadas."
        register_import_log(request.user, 'subs_logs', file_name, rows, 'success', msg, f"Carga masiva de logs finalizada con {rows} filas.")
        return JsonResponse({"status": "success", "message": msg})
    except Exception:
        # El detalle va al log del servidor, no al cliente: una excepcion de
        # psycopg2 nombra el esquema, la tabla y las columnas implicadas.
        logger.exception("Error al importar logs de suscripciones")
        register_import_log(request.user, 'subs_logs', file_name, 0, 'error', "Fallo en carga de logs.", ERROR_GENERICO)
        return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_import_crm', 'can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_crm(request):
    """Importa el export de CRM, que se desdobla en oportunidades y movimientos."""
    file_name = request.FILES.get("csv_file").name if "csv_file" in request.FILES else "Desconocido"
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_CRM_HEADERS)
    if error:
        register_import_log(request.user, 'crm', file_name, 0, 'error', 'Estructura inválida para Odoo CRM.')
        return error
    try:
        rows_clients, rows_logs = import_crm_csv(tmp_path)
        msg = f"CRM: Importados {rows_clients} clientes y {rows_logs} logs exitosamente."
        register_import_log(request.user, 'crm', file_name, rows_clients, 'success', msg, f"Clientes: {rows_clients} | Logs: {rows_logs}")
        return JsonResponse({"status": "success", "message": msg})
    except Exception:
        # El detalle va al log del servidor, no al cliente: una excepcion de
        # psycopg2 nombra el esquema, la tabla y las columnas implicadas.
        logger.exception("Error al importar el export de CRM")
        register_import_log(request.user, 'crm', file_name, 0, 'error', "Fallo en importación CRM.", ERROR_GENERICO)
        return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_import_support', 'can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_support(request):
    """Importa el export de tickets de soporte."""
    file_name = request.FILES.get("csv_file").name if "csv_file" in request.FILES else "Desconocido"
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_SUPPORT_HEADERS)
    if error:
        register_import_log(request.user, 'support', file_name, 0, 'error', 'Error en la estructura del CSV de Support.')
        return error
    try:
        rows = import_support_csv(tmp_path)
        msg = f"Technical Support: {rows} tickets importados correctamente."
        register_import_log(request.user, 'support', file_name, rows, 'success', msg, f"Carga realizada exitosamente con {rows} registros.")
        return JsonResponse({"status": "success", "message": msg})
    except Exception:
        # El detalle va al log del servidor, no al cliente: una excepcion de
        # psycopg2 nombra el esquema, la tabla y las columnas implicadas.
        logger.exception("Error al importar tickets de soporte")
        register_import_log(request.user, 'support', file_name, 0, 'error', "Fallo al importar tickets.", ERROR_GENERICO)
        return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


# --- LANZAMIENTO Y SEGUIMIENTO DE ANALISIS ---
#
# Los analisis no se ejecutan aqui: tardan minutos y morian contra el timeout
# del proxy (504) o contra el de gunicorn, dejando el periodo a medio escribir.
# La vista crea un AnalysisJob, lo encola en Redis y devuelve 202 con su id; el
# worker lo ejecuta y va escribiendo log y progreso en esa fila, que el cliente
# sondea con `api_job_detail`.

def _job_visible(request, job):
    """Quien lanzo el analisis, quien puede ver el historial, y los superusuarios."""
    if request.user.is_superuser or job.user_id == request.user.id:
        return True
    profile = getattr(request.user, 'profile', None)
    return bool(profile and profile.has_permission('can_view_import_history'))


@login_required
@permission_required('can_run_subs_analysis', 'can_run_calculations')
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_run_analysis(request):
    """Encola el analisis mensual de churn de un mes."""
    return lanzar_analisis(request, 'subs_analysis')


@login_required
@permission_required('can_run_crm_analysis', 'can_run_calculations')
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_run_crm_analysis(request):
    """Encola el analisis de CRM de un mes."""
    return lanzar_analisis(request, 'crm_analysis')


@login_required
@permission_required('can_run_support_analysis', 'can_run_calculations')
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_run_support_analysis(request):
    """Encola el analisis de soporte de un mes."""
    return lanzar_analisis(request, 'support_analysis')


@login_required
def api_job_detail(request, job_id):
    """Estado vivo de una ejecucion. Lo sondea la consola de la interfaz.

    Sin `@ratelimit` a proposito: el sondeo es cada pocos segundos durante todo
    el analisis y el limite de las acciones de calculo (2/m) lo cortaria.
    """
    job = AnalysisJob.objects.filter(pk=job_id).first()
    if job is None or not _job_visible(request, job):
        return JsonResponse(
            {"status": "error", "message": "Ejecución no encontrada."}, status=404
        )
    return JsonResponse(job.to_dict())


def _job_cancelable(request, job):
    """Quien lanzo el analisis, quien puede lanzar analisis, y los superusuarios.

    Cancelar es una accion, no una lectura: no basta con poder ver el job. Se
    exige el permiso con el que se habrian podido lanzar (`can_run_calculations`,
    el que ya agrupa esa capacidad), de modo que quien puede empezar un calculo
    puede pararlo.
    """
    if request.user.is_superuser or job.user_id == request.user.id:
        return True
    profile = getattr(request.user, 'profile', None)
    return bool(profile and profile.has_permission('can_run_calculations'))


@login_required
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_job_cancel(request, job_id):
    """Cancela una ejecucion encolada o en curso.

    No manda nada a Celery: cerrar la fila basta. Si el analisis todavia esperaba
    turno, la tarea lo descarta al recogerlo; si ya estaba calculando, su consola
    lo ve en el siguiente punto de control -a lo sumo un par de segundos- y se
    detiene. Matar el proceso del worker seria lo unico mas rapido, y dejaria a
    medias el `COPY` o el `ALTER TABLE` que estuviera corriendo.

    El limite es mas suelto que el de los endpoints de calculo (2/m): cancelar no
    dispara trabajo, y cortar una cola de varios trabajos son varias llamadas
    seguidas. Tampoco lleva `@permission_required` encima del limite como el
    resto: aqui el permiso depende del job -su dueno tambien puede- y eso no se
    puede decidir en un decorador.
    """
    job = AnalysisJob.objects.filter(pk=job_id).first()
    if job is None or not _job_visible(request, job):
        return JsonResponse(
            {"status": "error", "message": "Ejecución no encontrada."}, status=404
        )

    if not _job_cancelable(request, job):
        return JsonResponse(
            {"status": "error", "message": "No tienes permiso para cancelar esta ejecución."},
            status=403,
        )

    if not job.esta_abierto:
        return JsonResponse({
            "status": "error",
            "message": f"La ejecución ya terminó ({job.get_status_display()}).",
            "job": job.to_dict(),
        }, status=409)

    cancelar_job(job, request.user.username)
    return JsonResponse({
        "status": "cancelled",
        "message": (
            "Cancelación solicitada. El análisis se detiene en su próximo punto"
            " de control."
            if job.started_at else
            "Análisis cancelado antes de empezar."
        ),
        "job": job.to_dict(),
    })


@login_required
def api_jobs_queue(request):
    """Todo lo que hay en la cola ahora mismo, para el aviso flotante.

    Devuelve tanto lo que se esta calculando como lo que espera turno. Es un
    endpoint de sondeo continuo desde cualquier pagina, asi que va sin
    `@ratelimit` y sin permisos de modulo: solo enseña los trabajos que el
    usuario ya podria ver de todas formas (los suyos, o todos si puede abrir el
    historial de importaciones).
    """
    visibles = [job for job in jobs_abiertos() if _job_visible(request, job)]
    return JsonResponse({
        "jobs": [job.to_dict() for job in visibles],
        "en_ejecucion": sum(1 for j in visibles if j.status == AnalysisJob.EN_CURSO),
        "en_cola": sum(1 for j in visibles if j.status == AnalysisJob.PENDIENTE),
    })


@login_required
def api_job_active(request):
    """Ejecucion abierta de un modulo, para reengancharse tras recargar.

    Un analisis dura minutos: si el usuario recarga o vuelve mas tarde, la
    pagina necesita reencontrar el job en vez de dar la ejecucion por perdida.
    """
    module = request.GET.get("module") or ''
    if module not in dict(ImportActionLog.MODULE_CHOICES):
        return JsonResponse({"status": "error", "message": "Módulo inválido."}, status=400)

    job = job_en_curso(module)
    if job is None or not _job_visible(request, job):
        return JsonResponse({"job": None})
    return JsonResponse({"job": job.to_dict()})
