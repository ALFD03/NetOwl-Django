"""Vistas delgadas - solo conectan frontend con backend/data_api.py."""
import json
import io
import os
import sys
import tempfile

from django.http import JsonResponse
from django.shortcuts import render

from backend.data_api import (
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data,
)
from backend.analyzer import ChurnRateAnalyzer
from backend.database import DBConnector
from backend.imports import import_logs_csv, import_subscriptions_csv
from backend.models import Periodo


def dashboard(request, periodo=None):
    """Sirve el contenedor SPA."""
    return render(request, "analyzer/dashboard.html")


def api_dashboard_data(request):
    """Datos para el dashboard."""
    return JsonResponse(get_dashboard_data())


def api_analytics_data(request):
    """Datos para analytics con filtro multiselect por periodos."""
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse(get_analytics_data(periodos))


def api_periods_list(request):
    """Lista de periodos disponibles."""
    return JsonResponse({"periods": get_periodos()})


def api_results_list(request):
    """Historial completo de resultados."""
    data = get_cierre_churn()
    flat = []
    for p in data:
        for m in p["metodos"]:
            flat.append({"periodo": p["periodo_reporte"], **m})
    return JsonResponse({"periods": flat})


def api_results_detail(request, periodo):
    """Detalle de un periodo especifico."""
    cierre = get_cierre_churn([periodo])
    dims = get_dimensiones([periodo])
    summaries = cierre[0]["metodos"] if cierre else []
    dimensions = dims[0]["dimensiones"] if dims else {}
    return JsonResponse({
        "periodo": periodo,
        "summaries": summaries,
        "dimensions": dimensions,
    })


def api_run_analysis(request):
    """Ejecuta el analisis de churn."""
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON invalido"}, status=400)
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Periodo invalido (YYYY-MM)"}, status=400)
    try:
        periodo = Periodo.build(f"{mes}-01")
        periodo_label = periodo.label()
        capture = io.StringIO()
        old_out, old_err = sys.stdout, sys.stderr
        sys.stdout = capture
        sys.stderr = capture
        try:
            analyzer = ChurnRateAnalyzer(DBConnector(), periodo)
            analyzer.run()
        except Exception as e:
            sys.stdout, sys.stderr = old_out, old_err
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
        finally:
            result_output = capture.getvalue()
            sys.stdout, sys.stderr = old_out, old_err
        return JsonResponse({
            "status": "success",
            "periodo_label": periodo_label,
            "log_output": result_output,
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def api_import_subscriptions(request):
    """Importa suscripciones CSV."""
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
        rows = import_subscriptions_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Subscripciones: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def api_import_logs(request):
    """Importa logs CSV."""
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
        rows = import_logs_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Logs: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
