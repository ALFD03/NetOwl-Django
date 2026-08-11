# NetOwl-Django/frontend/support/views.py

from django.shortcuts import render
from django.http import JsonResponse
from inertia import render as render_inertia
from django.contrib.auth.decorators import login_required
from frontend.config.decorators import permission_required
from backend.support.queries import (
    get_support_periodos,
    get_support_cierre_historico,
    get_support_metric_totals,
    get_support_analytics_structured,
    get_support_tickets_list
)

TEMPLATE_PREFIX = "support/"

@login_required
@permission_required('can_view_support')
def dashboard(request):
    periodo = request.GET.get("period")
    metrics = get_support_metric_totals(periodo)
    return render_inertia(request, "Support/Dashboard", {
        "metrics": metrics,
        "section": "dashboard"
    })

@login_required
@permission_required('can_view_support_analytics')
def analytics(request):
    periodo = request.GET.get("period")
    analytics_data = get_support_analytics_structured(periodo)
    periodos = get_support_periodos()
    return render_inertia(request, "Support/Analytics", {
        "analyticsData": analytics_data,
        "periods": periodos,
        "section": "analytics"
    })

@login_required
@permission_required('can_view_support_results')
def results(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    historico = get_support_cierre_historico(periodos)
    return render_inertia(request, "Support/Results", {
        "historico": historico,
        "section": "results"
    })

# --- ENDPOINTS API ---

@login_required
@permission_required('can_view_support')
def api_periods_list(request):
    return JsonResponse({"periods": get_support_periodos()})

@login_required
@permission_required('can_view_support')
def api_global_metrics(request):
    periodo = request.GET.get("period")
    return JsonResponse(get_support_metric_totals(periodo))

@login_required
@permission_required('can_view_support')
def api_cierre_historico(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse({"historico": get_support_cierre_historico(periodos)})

@login_required
@permission_required('can_view_support_analytics')
def api_dimension_metrics(request):
    periodo = request.GET.get("period")
    return JsonResponse(get_support_analytics_structured(periodo))

@login_required
@permission_required('can_view_support_results')
def api_tickets_list(request):
    grupo = request.GET.get("grupo")
    periodo = request.GET.get("period")
    limit = int(request.GET.get("limit", 500))
    return JsonResponse({"tickets": get_support_tickets_list(limit=limit, grupo=grupo, periodo=periodo)})