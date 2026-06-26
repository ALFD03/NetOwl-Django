import io
import sys
import tempfile
import os

from django.http import JsonResponse
from django.shortcuts import render

from backend.crm import (
    run_crm_analysis,
    get_crm_cierre,
    get_crm_dashboard_data,
    get_crm_analytics_data,
    get_crm_periodos,
    get_crm_results_detail,
    import_crm_csv,
)

TEMPLATE_PREFIX = "crm/"


def dashboard(request):
    return render(request, f"{TEMPLATE_PREFIX}dashboard.html", {"section": "dashboard"})


def analytics(request):
    return render(request, f"{TEMPLATE_PREFIX}analytics.html", {"section": "analytics"})


def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})


def results(request, periodo=None):
    return render(request, f"{TEMPLATE_PREFIX}results.html", {"section": "results"})


def api_dashboard_data(request):
    return JsonResponse(get_crm_dashboard_data())


def api_analytics_data(request):
    return JsonResponse(get_crm_analytics_data())


def api_periods_list(request):
    return JsonResponse({"periods": get_crm_periodos()})


def api_results_list(request):
    return JsonResponse({"periods": get_crm_cierre()})


def api_results_detail(request, periodo=None):
    detail = get_crm_results_detail()
    return JsonResponse(detail)


def api_import_crm(request):
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    if "csv_file" not in request.FILES:
        return JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
    
    csv_file = request.FILES["csv_file"]
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            for chunk in csv_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        
        rows_clients, rows_logs = import_crm_csv(tmp_path)
        
        # Auto-trigger analysis after import
        capture = io.StringIO()
        old_out, old_err = sys.stdout, sys.stderr
        sys.stdout = capture
        sys.stderr = capture
        try:
            run_crm_analysis()
        except Exception as e:
            sys.stdout, sys.stderr = old_out, old_err
            return JsonResponse({
                "status": "success",
                "message": f"Clientes: {rows_clients} | Logs: {rows_logs} filas importadas. ERROR en analisis: {str(e)}"
            })
        finally:
            result_output = capture.getvalue()
            sys.stdout, sys.stderr = old_out, old_err
        
        return JsonResponse({
            "status": "success",
            "message": f"Clientes: {rows_clients} | Logs: {rows_logs} filas importadas. Analisis completado.",
            "log_output": result_output,
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def api_run_analysis(request):
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    capture = io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = capture
    sys.stderr = capture
    try:
        run_crm_analysis()
    except Exception as e:
        sys.stdout, sys.stderr = old_out, old_err
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        result_output = capture.getvalue()
        sys.stdout, sys.stderr = old_out, old_err
    return JsonResponse({"status": "success", "log_output": result_output})