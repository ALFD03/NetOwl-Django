import io
import os
import tempfile  # <-- Requerido para crear el archivo temporal de subida
from contextlib import redirect_stdout, redirect_stderr

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST

# Conectores y lógica de negocio del CRM
from backend.crm import (
    run_crm_analysis,
    import_crm_csv,
    get_metric_totals,
    get_metric_tiempo_instalacion,
    get_metric_tiempo_por_etapa,
    get_metric_efectividad,
    get_metric_etapa8,
    get_metric_perdido,
    get_metric_rescate,
    get_dimension_totals,
    get_dimension_tiempo_instalacion,
    get_dimension_tiempo_por_etapa,
    get_dimension_efectividad,
    get_dimension_etapa8,
    get_dimension_perdido,
    get_dimension_rescate,
)

TEMPLATE_PREFIX = "crm/"


# === HELPERS LOCALES PARA EL MANEJO DE SUBIDAS (PÚBLICOS) ===
def handle_csv_upload(request):
    if "csv_file" not in request.FILES:
        return None, JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
    csv_file = request.FILES["csv_file"]
    if not csv_file.name.endswith(".csv"):
        return None, JsonResponse({"status": "error", "message": "Solo archivos .csv"}, status=400)
    if csv_file.size > settings.MAX_UPLOAD_SIZE:
        return None, JsonResponse({"status": "error", "message": "Archivo muy grande"}, status=400)
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        for chunk in csv_file.chunks():
            tmp.write(chunk)
        tmp_path = tmp.name
        tmp.close()
    except Exception as e:
        return None, JsonResponse({"status": "error", "message": str(e)}, status=500)
    return tmp_path, None


def cleanup_tempfile(tmp_path):
    if tmp_path:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

def dashboard(request):
    return render(request, f"{TEMPLATE_PREFIX}dashboard.html", {"section": "dashboard"})

def analytics(request):
    return render(request, f"{TEMPLATE_PREFIX}analytics.html", {"section": "analytics"})

def results(request):
    return render(request, f"{TEMPLATE_PREFIX}results.html", {"section": "results"})

def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})

def api_import_crm(request):
    tmp_path, error = handle_csv_upload(request)
    if error:
        return error
    try:
        rows_clients, rows_logs = import_crm_csv(tmp_path)
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(out):
            try:
                run_crm_analysis()
            except Exception as e:
                return JsonResponse({
                    "status": "success",
                    "message": f"Clientes: {rows_clients} | Logs: {rows_logs} filas importadas. ERROR en analisis: {str(e)}",
                    "log_output": out.getvalue(),
                })
        return JsonResponse({
            "status": "success",
            "message": f"Clientes: {rows_clients} | Logs: {rows_logs} filas importadas. Analisis completado.",
            "log_output": out.getvalue(),
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)

def api_run_analysis(request):
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        try:
            run_crm_analysis()
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)
    return JsonResponse({"status": "success", "log_output": out.getvalue()})

# --- Per-Metric API endpoints ---
def api_metric_totals(request):
    return JsonResponse(get_metric_totals(), safe=False)

def api_metric_tiempo_instalacion(request):
    return JsonResponse(get_metric_tiempo_instalacion(), safe=False)

def api_metric_tiempo_por_etapa(request):
    return JsonResponse(get_metric_tiempo_por_etapa(), safe=False)

def api_metric_efectividad(request):
    return JsonResponse(get_metric_efectividad(), safe=False)

def api_metric_etapa8(request):
    return JsonResponse(get_metric_etapa8(), safe=False)

def api_metric_perdido(request):
    return JsonResponse(get_metric_perdido(), safe=False)

def api_metric_rescate(request):
    return JsonResponse(get_metric_rescate(), safe=False)

def api_dimension_totals(request):
    return JsonResponse(get_dimension_totals(), safe=False)

def api_dimension_tiempo_instalacion(request):
    return JsonResponse(get_dimension_tiempo_instalacion(), safe=False)

def api_dimension_tiempo_por_etapa(request):
    return JsonResponse(get_dimension_tiempo_por_etapa(), safe=False)

def api_dimension_efectividad(request):
    return JsonResponse(get_dimension_efectividad(), safe=False)

def api_dimension_etapa8(request):
    return JsonResponse(get_dimension_etapa8(), safe=False)

def api_dimension_perdido(request):
    return JsonResponse(get_dimension_perdido(), safe=False)

def api_dimension_rescate(request):
    return JsonResponse(get_dimension_rescate(), safe=False)
