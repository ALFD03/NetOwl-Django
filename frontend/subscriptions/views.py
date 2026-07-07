import json
import io
import logging
import os
from contextlib import redirect_stdout, redirect_stderr

logger = logging.getLogger(__name__)

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django_ratelimit.decorators import ratelimit

from frontend.config.decorators import analyst_or_admin_required, handle_csv_upload, cleanup_tempfile
from backend.database import DBConnector
from backend.models import Periodo
from backend.subscriptions import (
    MetricsAnalyzer,
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data,
    import_logs_csv, import_subscriptions_csv,
)
from backend.subscriptions.lifetime import (
    run_lifecycle_analysis, get_lifecycle_results, get_lifetime_dimensiones,
)

TEMPLATE_PREFIX = "subscriptions/"
LOGIN_URL = settings.LOGIN_URL

@login_required(login_url=LOGIN_URL)
def dashboard(request):
    return render(request, f"{TEMPLATE_PREFIX}dashboard.html", {"section": "dashboard"})

@login_required(login_url=LOGIN_URL)
def analytics(request):
    return render(request, f"{TEMPLATE_PREFIX}analytics.html", {"section": "analytics"})

@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})

@login_required(login_url=LOGIN_URL)
def results(request, periodo=None):
    return render(request, f"{TEMPLATE_PREFIX}results.html", {"section": "results"})

@login_required(login_url=LOGIN_URL)
def lifetime(request):
    return render(request, f"{TEMPLATE_PREFIX}lifetime.html", {"section": "lifetime"})

@login_required(login_url=LOGIN_URL)
def api_dashboard_data(request):
    return JsonResponse(get_dashboard_data())

@login_required(login_url=LOGIN_URL)
def api_analytics_data(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse(get_analytics_data(periodos))

@login_required(login_url=LOGIN_URL)
def api_periods_list(request):
    return JsonResponse({"periods": get_periodos()})

@login_required(login_url=LOGIN_URL)
def api_results_list(request):
    return JsonResponse({"periods": get_cierre_churn()})

@login_required(login_url=LOGIN_URL)
def api_results_detail(request, periodo):
    cierre = get_cierre_churn([periodo])
    dims = get_dimensiones([periodo])
    summary = cierre[0] if cierre else {}
    dimensions = dims[0]["dimensiones"] if dims else {}
    return JsonResponse({
        "periodo": periodo,
        "summary": summary,
        "dimensions": dimensions,
    })

@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
@ratelimit(key="ip", rate="10/m", method="POST")
@require_POST
def api_run_analysis(request):
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        logger.exception("Invalid JSON in request body")
        return JsonResponse({"status": "error", "message": "JSON invalido"}, status=400)
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Periodo invalido (YYYY-MM)"}, status=400)
    try:
        periodo = Periodo.build(f"{mes}-01")
        periodo_label = periodo.label()
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(out):
            try:
                analyzer = MetricsAnalyzer(DBConnector(), periodo)
                analyzer.run()
            except Exception as e:
                return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)
        return JsonResponse({
            "status": "success",
            "periodo_label": periodo_label,
            "log_output": out.getvalue(),
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required(login_url=LOGIN_URL)
def api_survival_data(request):
    lc = get_lifecycle_results()
    if not lc:
        return JsonResponse({
            "periodo": "global",
            "curva_activo": [],
            "curva_reactivacion": [],
            "stats": {},
            "curvas_dimension": {},
        })

    dim = request.GET.get("dim")
    curvas_dim = {"activo": {}, "reactivacion": {}}
    if dim:
        DIM_MAP = {
            "zona": "zona", "sucursal": "sucursal",
            "municipio": "municipio", "campana": "campanna",
            "producto": "producto",
        }
        db_dim = DIM_MAP.get(dim)
        if db_dim:
            try:
                dim_data = get_lifetime_dimensiones(db_dim)
                for d, valores in dim_data.items():
                    for val, info in valores.items():
                        ca = info.get("curva_activo", [])
                        if ca:
                            curvas_dim["activo"][val] = ca
                        cr = info.get("curva_reactivacion", [])
                        if cr:
                            curvas_dim["reactivacion"][val] = cr
            except Exception:
                logger.exception("Error reading lifetime dimension curves for dim=%s", dim)
                curvas_dim = {"activo": {}, "reactivacion": {}}

    curva_activo = lc.get("curva_activo", [])
    total = lc.get("n_total_activo", 0)
    n_evento = lc.get("n_evento_activo", 0)
    n_censurado = lc.get("n_censurado_activo", 0)

    return JsonResponse({
        "periodo": "global",
        "curva_activo": curva_activo,
        "curva_reactivacion": lc.get("curva_reactivacion", []),
        "stats": {
            "mediana_activo": lc.get("mediana_activo"),
            "promedio_activo": lc.get("promedio_activo"),
            "p25_activo": lc.get("p25_activo"),
            "p75_activo": lc.get("p75_activo"),
            "mediana_reactivacion": lc.get("mediana_reactivacion"),
            "p25_reactivacion": lc.get("p25_reactivacion"),
            "p75_reactivacion": lc.get("p75_reactivacion"),
            "promedio_reactivacion": lc.get("promedio_reactivacion"),
            "total_suscriptores": total,
            "total_eventos": n_evento,
            "n_censurado_activo": n_censurado,
            "tasa_censura": round(n_censurado / total, 4) if total and total > 0 else None,
            "tiempo_maximo": max((p["tiempo"] for p in (curva_activo or [])), default=None),
        },
        "curvas_dimension": curvas_dim,
    })

@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
@ratelimit(key="ip", rate="10/m", method="POST")
@require_POST
def api_import_subscriptions(request):
    tmp_path, error = handle_csv_upload(request)
    if error:
        return error
    try:
        rows = import_subscriptions_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Subscripciones: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)

@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
@ratelimit(key="ip", rate="10/m", method="POST")
@require_POST
def api_import_logs(request):
    tmp_path, error = handle_csv_upload(request)
    if error:
        return error
    try:
        rows = import_logs_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Logs: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)

@login_required(login_url=LOGIN_URL)
@analyst_or_admin_required
@ratelimit(key="ip", rate="10/m", method="POST")
@require_POST
def api_lifecycle_run(request):
    try:
        metrics = run_lifecycle_analysis()
        return JsonResponse({
            "status": "success",
            "message": "Analisis de ciclo de vida completado",
            "mediana_activo": metrics.get("mediana_activo"),
            "promedio_activo": metrics.get("promedio_activo"),
            "p25_activo": metrics.get("p25_activo"),
            "p75_activo": metrics.get("p75_activo"),
            "mediana_reactivacion": metrics.get("mediana_reactivacion"),
            "p25_reactivacion": metrics.get("p25_reactivacion"),
            "p75_reactivacion": metrics.get("p75_reactivacion"),
            "promedio_reactivacion": metrics.get("promedio_reactivacion"),
        })
    except Exception as e:
        logger.exception("Error en lifecycle run")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required(login_url=LOGIN_URL)
def api_lifecycle_results(request):
    data = get_lifecycle_results()
    if not data:
        return JsonResponse({"status": "empty", "message": "Ejecute el analisis de ciclo de vida primero"})
    dimensiones = get_lifetime_dimensiones()
    return JsonResponse({"status": "success", "data": data, "dimensiones": dimensiones})
