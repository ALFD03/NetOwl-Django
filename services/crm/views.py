"""Vistas del modulo CRM.

Los endpoints de importacion y de lanzamiento de analisis viven en la app
`imports`, que es su unica duena.
"""

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from inertia import render as render_inertia

from core.utils import clean_json_props
from services.config.decorators import permission_required
from services.crm.analytics import (
    get_crm_cierre_historico,
    get_crm_dimensiones,
    get_crm_metric_totals,
    get_crm_periodos,
)

# --- VISTAS INERTIA PROTEGIDAS ---

@login_required
@permission_required('can_view_crm')
def dashboard(request):
    """Portada de CRM: el promedio global y su serie historica."""
    periodo = request.GET.get("period")
    metrics = get_crm_metric_totals(periodo)
    periodos = get_crm_periodos()
    return render_inertia(request, "CRM/Dashboard", {
        "metrics": metrics,
        "periods": periodos,
        "selectedPeriod": periodo or (periodos[0] if periodos else ""),
        "section": "dashboard"
    })


@login_required
@permission_required('can_view_crm_analytics')
def analytics(request):
    """Analytics: todas las dimensiones del periodo y su fila de cierre.

    Viajan enteras en los props porque el selector de dimension es de cliente:
    cambiarlo no debe costar una vuelta al servidor.
    """
    periodo = request.GET.get("period")
    periodos = get_crm_periodos()

    target_period = periodo or (periodos[0] if periodos else None)

    # Se envían TODAS las dimensiones del periodo: el selector de dimensión es
    # client-side, así que cambiarlo no debe costar una vuelta al servidor.
    dimensions_data = get_crm_dimensiones(periodos=[target_period] if target_period else None)

    # Fila de cierre del periodo: es el denominador global que usan los pesos
    # simples y la fuente de las tarjetas y timelines de la cabecera.
    cierre = get_crm_cierre_historico([target_period]) if target_period else []

    return render_inertia(request, "CRM/Analytics", clean_json_props({
        "dimensionsData": dimensions_data,
        "globalData": cierre[0] if cierre else {},
        "periods": periodos,
        "selectedPeriod": target_period or "",
        "section": "analytics"
    }))


@login_required
@permission_required('can_view_crm_results')
def results(request):
    """Tabla de cierres por periodo."""
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    historico = get_crm_cierre_historico(periodos)
    return render_inertia(request, "CRM/Results", {
        "historico": historico,
        "section": "results"
    })


# --- ENDPOINTS API ---

@login_required
@permission_required('can_view_crm')
def api_periods_list(request):
    """Los periodos con cierre calculado."""
    return JsonResponse({"periods": get_crm_periodos()})


@login_required
@permission_required('can_view_crm')
def api_global_metrics(request):
    """El promedio global y la serie historica, en JSON."""
    periodo = request.GET.get("period")
    return JsonResponse(get_crm_metric_totals(periodo))


@login_required
@permission_required('can_view_crm_results')
def api_cierre_historico(request):
    """Los cierres de los periodos pedidos."""
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse({"historico": get_crm_cierre_historico(periodos)})


@login_required
@permission_required('can_view_crm_analytics', 'can_view_crm_results')
def api_dimension_metrics(request):
    """Las metricas de una dimension y un periodo."""
    periodo = request.GET.get("period")
    dimension = request.GET.get("dimension")
    target_period = [periodo] if periodo else None
    dimensiones = get_crm_dimensiones(periodos=target_period, dimension=dimension)
    return JsonResponse({"dimensiones": clean_json_props(dimensiones)})


