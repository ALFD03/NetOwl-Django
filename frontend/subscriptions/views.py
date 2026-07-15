import json
import io
import logging
import os
import tempfile  # <-- Requerido para crear el archivo temporal de subida
from contextlib import redirect_stdout, redirect_stderr

logger = logging.getLogger(__name__)

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit

# Conectores y lógica de negocio del backend
from backend.database import DBConnector
from backend.models import Periodo
from backend.subscriptions import (
    MetricsAnalyzer,
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data,
    import_logs_csv, import_subscriptions_csv, get_sales_report_data,
)
from backend.subscriptions.lifetime import (
    run_lifecycle_analysis, get_lifecycle_results, get_lifetime_dimensiones,
)
from backend.utils import validate_csv_structure

TEMPLATE_PREFIX = "subscriptions/"

REQUIRED_SUBS_HEADERS = {
    "Líneas de la orden/Referencia de la orden": "orden_producto",
    "Líneas de la orden/Producto/Nombre": "producto",
    "Líneas de la orden/Cliente": "cliente",
    "Líneas de la orden/Cliente/CI/RIF": "ci",
    "Sucursal": "sucursal",
    "Zona": "zona",
    "Líneas de la orden/Cliente/Municipio": "municipio",
    "Tipo de Servicio": "tipo",
    "Estado de la Suscripción": "estado",
    "Campaña": "campanna",
    "Próxima Fecha de Factura": "fecha_factura",
    "Fecha de inicio": "fecha_inicio",
    "Tarifa": "tarifa",
    "Subtotal": "total",
}

REQUIRED_LOGS_HEADERS = {
    "Logs de Cambios/Suscripción": "orden",
    "Logs de Cambios/Fecha de Cambio": "fecha_log",
    "Logs de Cambios/Nota": "log",
    "Logs de Cambios/Estado Interno de Suscripción": "estado",
}

def handle_csv_upload(request, required_headers=None):
    if "csv_file" not in request.FILES:
        return None, JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
    
    csv_file = request.FILES["csv_file"]
    
    # 1. Validación básica de tipo por extensión
    if not csv_file.name.endswith(".csv"):
        return None, JsonResponse({"status": "error", "message": "Solo se permiten archivos con extensión .csv"}, status=400)
    
    # 2. Validación de tamaño
    if csv_file.size > settings.MAX_UPLOAD_SIZE:
        return None, JsonResponse({"status": "error", "message": "El archivo excede el tamaño máximo permitido"}, status=400)
    
    # Guardar en un archivo temporal seguro
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        for chunk in csv_file.chunks():
            tmp.write(chunk)
        tmp_path = tmp.name
        tmp.close()
        
        # 3. Validación avanzada de estructura de cabeceras
        if required_headers:
            is_valid, err_msg = validate_csv_structure(tmp_path, required_headers)
            if not is_valid:
                cleanup_tempfile(tmp_path)
                return None, JsonResponse({"status": "error", "message": err_msg}, status=400)
                
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

def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})

def results(request, periodo=None):
    return render(request, f"{TEMPLATE_PREFIX}results.html", {"section": "results"})

def lifetime(request):
    return render(request, f"{TEMPLATE_PREFIX}lifetime.html", {"section": "lifetime"})

def sales_report(request):
    return render(request, f"{TEMPLATE_PREFIX}sales_report.html", {"section": "sales_report"})

def api_dashboard_data(request):
    return JsonResponse(get_dashboard_data())

def api_analytics_data(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse(get_analytics_data(periodos))

def api_periods_list(request):
    return JsonResponse({"periods": get_periodos()})

def api_results_list(request):
    return JsonResponse({"periods": get_cierre_churn()})

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


@ratelimit(key='ip', rate='2/m', block=True)
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
            "zona_sucursal": "zona_sucursal",
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

@ratelimit(key='ip', rate='5/m', block=True)
def api_import_subscriptions(request):
    # Pasamos las cabeceras requeridas de suscripciones para que handle_csv_upload las valide
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_SUBS_HEADERS)
    if error:
        return error
    try:
        rows = import_subscriptions_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Subscripciones: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)

@ratelimit(key='ip', rate='5/m', block=True)
def api_import_logs(request):
    # Pasamos las cabeceras requeridas de logs
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_LOGS_HEADERS)
    if error:
        return error
    try:
        rows = import_logs_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Logs: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)

@ratelimit(key='ip', rate='2/m', block=True)
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

def api_lifecycle_results(request):
    data = get_lifecycle_results()
    if not data:
        return JsonResponse({"status": "empty", "message": "Ejecute el analisis de ciclo de vida primero"})
    dimensiones = get_lifetime_dimensiones()
    return JsonResponse({"status": "success", "data": data, "dimensiones": dimensiones})

def api_sales_report(request):
    periodo = request.GET.get("period")
    return JsonResponse(get_sales_report_data(periodo))
