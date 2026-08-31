import json
import io
import logging
from contextlib import redirect_stdout, redirect_stderr

from django.shortcuts import render
from inertia import render as render_inertia
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit

from frontend.config.decorators import permission_required
from frontend.subscriptions.views import (
    handle_csv_upload, cleanup_tempfile,
    REQUIRED_SUBS_HEADERS, REQUIRED_LOGS_HEADERS
)
from frontend.crm.views import REQUIRED_CRM_HEADERS
from backend.subscriptions import (
    import_subscriptions_csv, import_logs_csv, import_gratis_csv, MetricsAnalyzer,
    build_day_metrics,
)
from backend.subscriptions.free_plans import REQUIRED_GRATIS_HEADERS
from backend.crm import import_crm_csv, run_crm_analysis
from backend.database import DBConnector
from backend.models import Periodo
from .models import ImportActionLog
from backend.support import import_support_csv, run_support_analysis
from backend.support.config import REQUIRED_SUPPORT_HEADERS


logger = logging.getLogger(__name__)

TEMPLATE_PREFIX = "imports/"


def register_import_log(user, module, file_name='N/A', rows=0, status='success', message='', details=''):
    try:
        ImportActionLog.objects.create(
            user=user if user.is_authenticated else None,
            username=user.username if user.is_authenticated else 'Sistema',
            module=module,
            file_name=file_name or 'N/A',
            rows_processed=rows,
            status=status,
            message=message,
            details=details
        )
    except Exception as e:
        logger.exception("Error al registrar acción en historial: %s", str(e))


@login_required
@permission_required('can_view_imports')
def subscriptions_import_view(request):
    return render_inertia(request, "Imports/Subscriptions", {"section": "subscriptions"})

@login_required
@permission_required('can_view_imports')
def crm_import_view(request):
    return render_inertia(request, "Imports/Crm", {"section": "crm"})

@login_required
@permission_required('can_view_imports')
def support_import_view(request):
    return render_inertia(request, "Imports/Support", {"section": "support"})

@login_required
@permission_required('can_view_imports')
def history_view(request):
    logs = ImportActionLog.objects.all()[:200]
    history_data = []
    for l in logs:
        history_data.append({
            "id": l.id,
            "timestamp": l.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "username": l.username,
            "module": l.module,
            "module_display": l.get_module_display(),
            "file_name": l.file_name,
            "rows_processed": l.rows_processed,
            "status": l.status,
            "status_display": l.get_status_display(),
            "message": l.message,
            "details": l.details,
        })
    return render_inertia(request, "Imports/History", {
        "history": history_data,
        "section": "history"
    })


@login_required
@permission_required('can_view_imports')
def api_history_list(request):
    logs = ImportActionLog.objects.all()[:200]
    data = []
    for l in logs:
        data.append({
            "id": l.id,
            "timestamp": l.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "username": l.username,
            "module": l.module,
            "module_display": l.get_module_display(),
            "file_name": l.file_name,
            "rows_processed": l.rows_processed,
            "status": l.status,
            "status_display": l.get_status_display(),
            "message": l.message,
            "details": l.details,
        })
    return JsonResponse({"history": data})


# --- ACCIONES Y PROCESAMIENTO CON REGISTRO DE HISTORIAL ---

@login_required
@ratelimit(key='ip', rate='5/m', block=True)
@permission_required('can_import_data')
@require_POST
def api_import_subscriptions(request):
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
    except Exception as e:
        err_msg = str(e)
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', f"Fallo al importar: {err_msg}", err_msg)
        return JsonResponse({"status": "error", "message": err_msg}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@ratelimit(key='ip', rate='5/m', block=True)
@permission_required('can_import_data')
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
    except Exception as e:
        err_msg = str(e)
        register_import_log(request.user, 'subs_subscriptions', file_name, 0, 'error', f"Fallo al importar planes gratuitos: {err_msg}", err_msg)
        return JsonResponse({"status": "error", "message": err_msg}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@ratelimit(key='ip', rate='5/m', block=True)
@permission_required('can_import_data')
@require_POST
def api_import_logs(request):
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
    except Exception as e:
        err_msg = str(e)
        register_import_log(request.user, 'subs_logs', file_name, 0, 'error', f"Fallo en carga de logs: {err_msg}", err_msg)
        return JsonResponse({"status": "error", "message": err_msg}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_crm(request):
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
    except Exception as e:
        err_msg = str(e)
        register_import_log(request.user, 'crm', file_name, 0, 'error', f"Fallo en importación CRM: {err_msg}", err_msg)
        return JsonResponse({"status": "error", "message": err_msg}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_run_calculations')
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_run_crm_analysis(request):
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON inválido"}, status=400)

    # Validación estricta obligatoria
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Periodo inválido. Seleccione un mes con formato YYYY-MM."}, status=400)

    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        try:
            run_crm_analysis(mes)
        except Exception as e:
            err_text = f"Error durante el cálculo de métricas CRM para {mes}: {str(e)}"
            register_import_log(request.user, 'crm_analysis', f"Periodo {mes}", 0, 'error', err_text, out.getvalue())
            return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)

    msg = f"Análisis de CRM completado exitosamente para el periodo {mes}."
    register_import_log(request.user, 'crm_analysis', f"Periodo {mes}", 0, 'success', msg, out.getvalue())
    return JsonResponse({"status": "success", "message": msg, "periodo_label": mes, "log_output": out.getvalue()})


@login_required
@ratelimit(key='ip', rate='2/m', block=True)
@permission_required('can_run_calculations')
@require_POST
def api_run_analysis(request):
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON inválido"}, status=400)
        
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Periodo inválido (YYYY-MM)"}, status=400)
        
    try:
        periodo = Periodo.build(f"{mes}-01")
        periodo_label = periodo.label()
        out = io.StringIO()
        dias = 0
        with redirect_stdout(out), redirect_stderr(out):
            try:
                db = DBConnector()
                analyzer = MetricsAnalyzer(db, periodo)
                analyzer.run()
                # Mismo analyzer: los datos ya estan cargados, asi que el cierre
                # del mes y las metricas de cada dia salen de una sola lectura.
                dias = build_day_metrics(mes, db=db, analyzer=analyzer)["dias_calculados"]
            except Exception as e:
                err_txt = f"Fallo en ejecucion de analisis para {periodo_label}: {str(e)}"
                register_import_log(request.user, 'subs_analysis', f"Periodo {mes}", 0, 'error', err_txt, out.getvalue())
                return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)

        msg = f"Análisis de Churn completado para el periodo {periodo_label} ({dias} días calculados)."
        register_import_log(request.user, 'subs_analysis', f"Periodo {mes}", dias, 'success', msg, out.getvalue())
        return JsonResponse({
            "status": "success",
            "periodo_label": periodo_label,
            "dias_calculados": dias,
            "log_output": out.getvalue(),
        })
    except Exception as e:
        register_import_log(request.user, 'subs_analysis', f"Periodo {mes}", 0, 'error', str(e))
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    

@login_required
@ratelimit(key='ip', rate='5/m', block=True)
@permission_required('can_import_data')
@require_POST
def api_import_support(request):
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
    except Exception as e:
        err_msg = str(e)
        register_import_log(request.user, 'support', file_name, 0, 'error', f"Fallo al importar tickets: {err_msg}", err_msg)
        return JsonResponse({"status": "error", "message": err_msg}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_run_calculations')
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_run_support_analysis(request):
    try:
        data = json.loads(request.body)
        periodo = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON inválido"}, status=400)

    if not periodo or len(periodo) != 7:
        return JsonResponse({"status": "error", "message": "Periodo inválido (YYYY-MM)."}, status=400)

    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        try:
            run_support_analysis(periodo)
        except Exception as e:
            err_text = f"Error durante el cálculo de métricas Support: {str(e)}"
            register_import_log(request.user, 'support_analysis', f"Periodo {periodo}", 0, 'error', err_text, out.getvalue())
            return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)

    msg = f"Análisis de Technical Support completado para {periodo}."
    register_import_log(request.user, 'support_analysis', f"Periodo {periodo}", 0, 'success', msg, out.getvalue())
    return JsonResponse({"status": "success", "message": msg, "periodo_label": periodo, "log_output": out.getvalue()})