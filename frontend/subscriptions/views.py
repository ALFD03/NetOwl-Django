# --- START OF FILE NetOwl-Django/frontend/subscriptions/views.py ---
import json
import io
import logging
import os
import tempfile
from contextlib import redirect_stdout, redirect_stderr
from inertia import render as render_inertia


logger = logging.getLogger(__name__)

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from django.contrib.auth.decorators import login_required
from frontend.config.decorators import permission_required

# Conectores y lógica de negocio del backend
from backend.database import DBConnector
from backend.models import Periodo
from backend.subscriptions import (
    MetricsAnalyzer,
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data,
    import_logs_csv, import_subscriptions_csv, get_sales_report_data,
    ETAReportManager, get_business_units_data, get_zonas_config,
    get_day_metrics,
)
from backend.subscriptions.lifetime import (
    run_lifecycle_analysis, get_lifecycle_results, get_lifetime_dimensiones,
)
from backend.utils import clean_json_props, validate_csv_structure

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
    if not csv_file.name.endswith(".csv"):
        return None, JsonResponse({"status": "error", "message": "Solo se permiten archivos con extensión .csv"}, status=400)
    if csv_file.size > settings.MAX_UPLOAD_SIZE:
        return None, JsonResponse({"status": "error", "message": "El archivo excede el tamaño máximo permitido"}, status=400)
    
    tmp_path = None
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
        tmp_path = tmp.name
        for chunk in csv_file.chunks():
            tmp.write(chunk)
        tmp.close()
        
        if required_headers:
            is_valid, err_msg = validate_csv_structure(tmp_path, required_headers)
            if not is_valid:
                cleanup_tempfile(tmp_path)
                return None, JsonResponse({"status": "error", "message": err_msg}, status=400)
    except Exception as e:
        if tmp_path:
            cleanup_tempfile(tmp_path)
        return None, JsonResponse({"status": "error", "message": f"Error al procesar el archivo: {str(e)}"}, status=500)
        
    return tmp_path, None

def cleanup_tempfile(tmp_path):
    if tmp_path:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        
# --- VISTAS HTML PROTEGIDAS POR PERMISO GRANULAR ---

@login_required
@permission_required('can_view_subscriptions')
def dashboard(request):
    periodos_data = get_cierre_churn()
    dims_data = get_dimensiones()
    
    # Extraer y aplanar todas las zonas de todos los períodos
    todas_las_zonas = []
    if dims_data:
        for periodo in dims_data:
            zonas = periodo.get("dimensiones", {}).get("zona", [])
            todas_las_zonas.extend(zonas)
            
    return render_inertia(request, "Subscriptions/Dashboard", {
        "periodos": periodos_data,
        "dimensiones": {
            "zona": todas_las_zonas # React recibirá los 7 objetos por zona
        },
        "section": "dashboard"
    })

@login_required
@permission_required('can_view_subs_analytics')
def analytics(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    data = get_analytics_data(periodos)
    # El mes completo viaja en los props: seleccionar un dia en la barra es
    # una lectura de cliente, no un recalculo.
    mes = (request.GET.get("period") or "")[:7]
    if not mes:
        lista = data.get("periodos", [])
        mes = (lista[0].get("periodo_reporte", "")[:7] if lista else "")
    return render_inertia(request, "Subscriptions/Analytics", {
        "periodos": data.get("periodos", []),
        "dimensiones": data.get("dimensiones", []),
        "dayMetrics": get_day_metrics(mes),
        "section": "analytics"
    })

@login_required
@permission_required('can_import_data')
def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})

@login_required
@permission_required('can_view_subs_results')
def results(request, periodo=None):
    cierres = get_cierre_churn([periodo] if periodo else None)
    return render_inertia(request, "Subscriptions/Results", {
        "periodos": cierres,
        "selected_periodo": periodo,
        "section": "results"
    })

@login_required
@permission_required('can_view_subs_lifetime')
def lifetime(request):
    try:
        results_data = get_lifecycle_results()
        dims_data = get_lifetime_dimensiones()
        
        # Garantía absoluta de que no son None
        if results_data is None: results_data = {}
        if dims_data is None: dims_data = {}
        
    except Exception as e:
        logger.error(f"Error cargando Lifetime view: {e}")
        results_data = {}
        dims_data = {}

    return render_inertia(request, "Subscriptions/Lifetime", {
        "lifecycle": results_data,
        "dimensiones": dims_data,
        "section": "lifetime"
    })

@login_required
@permission_required('can_view_subs_sales')
def sales_report(request):
    periodo = request.GET.get("period")
    try:
        dia = int(request.GET.get("dia") or 0) or None
    except ValueError:
        dia = None
    data = get_sales_report_data(periodo, dia)
    return render_inertia(request, "Subscriptions/SalesReport", {
        "reportData": data,
        "dayMetrics": get_day_metrics((data.get("period") or "")[:7]),
        "zonasConfig": get_zonas_config(),
        "section": "sales_report"
    })

@login_required
@permission_required('can_view_subs_sales')
def business_units(request):
    periodo = request.GET.get("period")
    try:
        dia = int(request.GET.get("dia") or 0) or None
    except ValueError:
        dia = None
    data = get_business_units_data(periodo, dia)
    return render_inertia(request, "Subscriptions/BusinessUnits", {
        "buData": data,
        "dayMetrics": get_day_metrics((data.get("period") or "")[:7]),
        "zonasConfig": get_zonas_config(),
        "section": "business_units"
    })

@login_required
@permission_required('can_view_eta')
def eta_report(request):
    available = get_periodos()
    periodos_disponibles = sorted(list(set([p[:7] for p in available])), reverse=True)
    
    periodo_req = request.GET.get("period")
    if not periodo_req and periodos_disponibles:
        periodo_req = periodos_disponibles[0]
    elif not periodo_req:
        periodo_req = "2024-01"

    db = DBConnector()
    manager = ETAReportManager(db)
    
    # EJECUCIÓN INMEDIATA
    data = manager.calculate_eta_report(periodo_req)
    
    # Aseguramos que los metadatos viajen en el primer render
    data["periods"] = periodos_disponibles
    data["periodo"] = periodo_req
    
    return render_inertia(request, "Subscriptions/EtaReport", {
        "etaData": data,
        "section": "eta_report"
    })

@login_required
@permission_required('can_manage_eta')
def eta_config_view(request):
    db = DBConnector()
    manager = ETAReportManager(db)
    
    available = get_periodos()
    periodos_disponibles = sorted(list(set([p[:7] for p in available])), reverse=True)
    
    periodo_req = request.GET.get("period")
    if not periodo_req and periodos_disponibles:
        periodo_req = periodos_disponibles[0]

    unmapped_plans = []
    unmapped_subs = []

    if periodo_req:
        report_data = manager.calculate_eta_report(periodo_req, force_recalc=True)
        if report_data.get("status") == "unmapped_elements":
            unmapped_plans = report_data.get("unmapped_plans", [])
            unmapped_subs = report_data.get("unmapped_subs", [])

    if not unmapped_plans:
        unmapped_plans = manager.get_discovered_unmapped_plans()
    if not unmapped_subs:
        unmapped_subs = manager.get_discovered_unmapped_subs()

    df_planes = db.read_table("analyzer_eta_config_planes")
    planes_records = []
    if not df_planes.empty:
        df_planes = df_planes.replace({float('nan'): None})
        if "updated_at" in df_planes.columns:
            df_planes["updated_at"] = df_planes["updated_at"].astype(str)
        planes_records = df_planes.to_dict('records')

    # Blindaje de todos los props con clean_json_props
    props = {
        "individualConfigs": manager.get_configured_individual_subs() or [],
        "planesConfigs": planes_records,
        "discoveredPlans": unmapped_plans or [],
        "discoveredSubs": unmapped_subs or [],
        "allKnownPlans": manager.get_all_known_plans() or [],
        "currentPeriod": periodo_req or "",
        "periods": periodos_disponibles,
        "section": "eta_config"
    }

    return render_inertia(request, "Subscriptions/EtaManagement", clean_json_props(props))


# --- APIS DE LECTURA DE DATOS ---

@login_required
@permission_required('can_view_subscriptions')
def api_dashboard_data(request):
    return JsonResponse(get_dashboard_data())

@login_required
@permission_required('can_view_subs_analytics')
def api_analytics_data(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse(get_analytics_data(periodos))

@login_required
@permission_required('can_view_subscriptions')
def api_periods_list(request):
    return JsonResponse({"periods": get_periodos()})

@login_required
@permission_required('can_view_subs_results')
def api_results_list(request):
    return JsonResponse({"periods": get_cierre_churn()})

@login_required
@permission_required('can_view_subs_results')
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

@login_required
@permission_required('can_view_subs_lifetime')
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

@login_required
@permission_required('can_view_subs_sales')
def api_sales_report(request):
    periodo = request.GET.get("period")
    dia = request.GET.get("dia")
    return JsonResponse(get_sales_report_data(periodo, int(dia) if dia else None))

@login_required
@permission_required('can_view_eta')
def api_eta_report_data(request):
    """API para recargar datos sin refrescar la página"""
    periodo = request.GET.get("period")
    force = request.GET.get("force", "false").lower() == "true"
    
    available = get_periodos()
    periodos_disponibles = sorted(list(set([p[:7] for p in available])), reverse=True)

    if not periodo and periodos_disponibles:
        periodo = periodos_disponibles[0]
    
    if not periodo:
        return JsonResponse({"status": "empty", "message": "No hay periodos calculados."})

    db = DBConnector()
    manager = ETAReportManager(db)
    try:
        report_data = manager.calculate_eta_report(periodo, force_recalc=force)
        # Asegurar que la API también devuelva la lista actualizada
        report_data["periods"] = periodos_disponibles
        report_data["individual_configs"] = manager.get_configured_individual_subs()
        return JsonResponse(report_data)
    except Exception as e:
        logger.exception("Error en cálculo de reporte ETA")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

# --- APIS DE ESCRITURA Y CÁLCULOS ESPECIALES ---

@login_required
@ratelimit(key='ip', rate='2/m', block=True)
@permission_required('can_run_calculations')
@require_POST
def api_run_analysis(request):
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

@login_required
@ratelimit(key='ip', rate='5/m', block=True)
@permission_required('can_import_data')
@require_POST
def api_import_subscriptions(request):
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

@login_required
@ratelimit(key='ip', rate='5/m', block=True)
@permission_required('can_import_data')
@require_POST
def api_import_logs(request):
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

@login_required
@ratelimit(key='ip', rate='2/m', block=True)
@permission_required('can_run_lifetime') # <-- CONTROL ESPECÍFICO DE EJECUCIÓN DE LIFETIME
@require_POST
def api_lifecycle_run(request):
    try:
        metrics = run_lifecycle_analysis()
        return JsonResponse({"status": "success", "message": "Análisis de ciclo de vida completado", **metrics})
    except Exception as e:
        logger.exception("Error en lifecycle run")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_view_subs_lifetime')
def api_lifecycle_results(request):
    data = get_lifecycle_results()
    if not data:
        return JsonResponse({"status": "empty", "message": "Ejecute el análisis de ciclo de vida primero"})
    dimensiones = get_lifetime_dimensiones()
    return JsonResponse({"status": "success", "data": data, "dimensiones": dimensiones})

@login_required
@permission_required('can_manage_eta')
@require_POST
def api_eta_report_lock(request):
    try:
        data = json.loads(request.body)
        periodo = data.get("period")
        lock = bool(data.get("lock", False))
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON invalido"}, status=400)

    db = DBConnector()
    manager = ETAReportManager(db)
    manager.set_lock_status(periodo, lock)
    if lock:
        manager.calculate_eta_report(periodo, force_recalc=True)
    return JsonResponse({"status": "success", "esta_bloqueado": lock, "message": f"Periodo {periodo} actualizado."})

@login_required
@permission_required('can_manage_eta')
@require_POST
def api_eta_report_save_plan_config(request):
    try:
        data = json.loads(request.body)
        plan_name = data.get("plan_name")
        config = {
            "reportar": bool(data.get("reportar", True)),
            "tecnologia": data.get("tecnologia"),
            "tipo_persona": data.get("tipo_persona"),
            "tiene_tv": bool(data.get("tiene_tv", False)),
            "datas_mbps": float(data.get("datas_mbps", 0))
        }
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

    db = DBConnector()
    manager = ETAReportManager(db)
    try:
        manager.save_plan_custom_config(plan_name, config)
        return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_manage_eta')
@require_POST
def api_eta_report_save_sub_config(request):
    try:
        data = json.loads(request.body)
        orden = data.get("orden")
        config = {
            "cliente": data.get("cliente", ""),
            "producto": data.get("producto", ""),
            "reportar": bool(data.get("reportar", True)),
            "tecnologia": data.get("tecnologia"),
            "tipo_persona": data.get("tipo_persona"),
            "tiene_tv": bool(data.get("tiene_tv", False)),
            "datas_mbps": float(data.get("datas_mbps", 0)),
            "es_transporte": bool(data.get("es_transporte", False)),
            "es_dedicado": bool(data.get("es_dedicado", False))
        }
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

    if not orden:
        return JsonResponse({"status": "error", "message": "El campo orden es requerido"}, status=400)

    db = DBConnector()
    manager = ETAReportManager(db)
    try:
        manager.save_sub_individual_config(orden, config)
        return JsonResponse({"status": "success", "message": f"Suscripción {orden} guardada."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)

@login_required
@permission_required('can_view_subs_sales')
def api_business_units_report(request):
    periodo = request.GET.get("period")
    dia = request.GET.get("dia")
    return JsonResponse(get_business_units_data(periodo, int(dia) if dia else None))

@login_required
@permission_required('can_manage_eta')
@require_POST
def api_eta_report_delete_plan_config(request):
    try:
        data = json.loads(request.body)
        plan_name = data.get("plan_name")
        if not plan_name:
            return JsonResponse({"status": "error", "message": "Nombre de plan requerido"}, status=400)
        
        db = DBConnector()
        manager = ETAReportManager(db)
        manager.delete_plan_custom_config(plan_name)
        return JsonResponse({"status": "success", "message": f"Plan '{plan_name}' eliminado."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@login_required
@permission_required('can_manage_eta')
@require_POST
def api_eta_report_delete_sub_config(request):
    try:
        data = json.loads(request.body)
        orden = data.get("orden")
        if not orden:
            return JsonResponse({"status": "error", "message": "ID de orden requerido"}, status=400)
        
        db = DBConnector()
        manager = ETAReportManager(db)
        manager.delete_sub_individual_config(orden)
        return JsonResponse({"status": "success", "message": f"Suscripción '{orden}' eliminada."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)