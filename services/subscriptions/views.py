"""Vistas del modulo de suscripciones.

Las de ETA viven en `views_eta.py`; los endpoints de importacion y de
lanzamiento de analisis, en la app `imports`, que es su unica duena.
"""

import logging

from inertia import render as render_inertia

from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from django.contrib.auth.decorators import login_required
from services.config.decorators import permission_required

from services.subscriptions.analytics import (
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data,
    get_sales_report_data,
    get_business_units_data, get_zonas_config,
    get_day_metrics,
)
from services.subscriptions.analytics.lifetime import (
    run_lifecycle_analysis, get_lifecycle_results, get_lifetime_dimensiones,
)
from services.subscriptions.analytics.lifetime.queries import get_survival_report
from core.utils import clean_json_props

logger = logging.getLogger(__name__)


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
    return JsonResponse(get_survival_report(request.GET.get("dim")))

@login_required
@permission_required('can_view_subs_sales')
def api_sales_report(request):
    periodo = request.GET.get("period")
    dia = request.GET.get("dia")
    return JsonResponse(get_sales_report_data(periodo, int(dia) if dia else None))


# --- APIS DE ESCRITURA Y CÁLCULOS ESPECIALES ---

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
@permission_required('can_view_subs_sales')
def api_business_units_report(request):
    periodo = request.GET.get("period")
    dia = request.GET.get("dia")
    return JsonResponse(get_business_units_data(periodo, int(dia) if dia else None))



