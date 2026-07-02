import io
import os
from contextlib import redirect_stdout, redirect_stderr

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django_ratelimit.decorators import ratelimit

from frontend.config.decorators import analyst_or_admin_required, handle_csv_upload, cleanup_tempfile
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
LOGIN_URL = settings.LOGIN_URL


@login_required(login_url=LOGIN_URL)
def dashboard(request):
    return render(request, f"{TEMPLATE_PREFIX}dashboard.html", {"section": "dashboard"})


@login_required(login_url=LOGIN_URL)
def analytics(request):
    return render(request, f"{TEMPLATE_PREFIX}analytics.html", {"section": "analytics"})


@login_required(login_url=LOGIN_URL)
def results(request):
    return render(request, f"{TEMPLATE_PREFIX}results.html", {"section": "results"})


@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})


@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
@ratelimit(key="ip", rate="10/m", method="POST")
@require_POST
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


@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
@ratelimit(key="ip", rate="10/m", method="POST")
@require_POST
def api_run_analysis(request):
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        try:
            run_crm_analysis()
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)
    return JsonResponse({"status": "success", "log_output": out.getvalue()})


# --- Per-Metric API endpoints ---

@login_required(login_url=LOGIN_URL)
def api_metric_totals(request):
    return JsonResponse(get_metric_totals(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_metric_tiempo_instalacion(request):
    return JsonResponse(get_metric_tiempo_instalacion(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_metric_tiempo_por_etapa(request):
    return JsonResponse(get_metric_tiempo_por_etapa(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_metric_efectividad(request):
    return JsonResponse(get_metric_efectividad(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_metric_etapa8(request):
    return JsonResponse(get_metric_etapa8(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_metric_perdido(request):
    return JsonResponse(get_metric_perdido(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_metric_rescate(request):
    return JsonResponse(get_metric_rescate(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_totals(request):
    return JsonResponse(get_dimension_totals(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_tiempo_instalacion(request):
    return JsonResponse(get_dimension_tiempo_instalacion(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_tiempo_por_etapa(request):
    return JsonResponse(get_dimension_tiempo_por_etapa(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_efectividad(request):
    return JsonResponse(get_dimension_efectividad(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_etapa8(request):
    return JsonResponse(get_dimension_etapa8(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_perdido(request):
    return JsonResponse(get_dimension_perdido(), safe=False)


@login_required(login_url=LOGIN_URL)
def api_dimension_rescate(request):
    return JsonResponse(get_dimension_rescate(), safe=False)
