# frontend/support/views.py

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from inertia import render as render_inertia

from backend.support.queries import (
    get_support_analytics_structured,
    get_support_breakdown,
    get_support_cierre_historico,
    get_support_metric_totals,
    get_support_periodos,
    get_support_tickets_list,
)
from backend.utils import clean_json_props
from frontend.config.decorators import permission_required


# --- VISTAS INERTIA PROTEGIDAS ---

@login_required
@permission_required('can_view_support')
def dashboard(request):
    return render_inertia(request, "Support/Dashboard", clean_json_props({
        "metrics": get_support_metric_totals(),
        "section": "dashboard",
    }))


@login_required
@permission_required('can_view_support_analytics')
def analytics(request):
    periodos = get_support_periodos()
    analytics_data = get_support_analytics_structured(request.GET.get("period"))

    return render_inertia(request, "Support/Analytics", clean_json_props({
        "analyticsData": analytics_data,
        "periods": periodos,
        "selectedPeriod": analytics_data.get("periodo", ""),
        "section": "analytics",
    }))


@login_required
@permission_required('can_view_support_results')
def results(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None

    return render_inertia(request, "Support/Results", clean_json_props({
        "historico": get_support_cierre_historico(periodos),
        "section": "results",
    }))


# --- ENDPOINTS API ---

@login_required
@permission_required('can_view_support')
def api_periods_list(request):
    return JsonResponse({"periods": get_support_periodos()})


@login_required
@permission_required('can_view_support')
def api_global_metrics(request):
    return JsonResponse(clean_json_props(get_support_metric_totals()))


@login_required
@permission_required('can_view_support')
def api_cierre_historico(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse({
        "historico": clean_json_props(get_support_cierre_historico(periodos))
    })


@login_required
@permission_required('can_view_support_analytics')
def api_dimension_metrics(request):
    periodo = request.GET.get("period")
    if not periodo:
        return JsonResponse({"status": "error", "message": "Falta el periodo."}, status=400)

    return JsonResponse({
        "dimensiones": clean_json_props(get_support_analytics_structured(periodo))
    })


@login_required
@permission_required('can_view_support_analytics')
def api_breakdown(request):
    """El drill-down de un valor dimensional: sus tipos, razones y soluciones."""
    periodo = request.GET.get("period")
    dimension = request.GET.get("dimension")
    valor = request.GET.get("valor")

    if not (periodo and dimension and valor):
        return JsonResponse(
            {"status": "error", "message": "Se requieren period, dimension y valor."},
            status=400,
        )

    return JsonResponse(clean_json_props(get_support_breakdown(
        periodo=periodo,
        dimension=dimension,
        valor=valor,
        grupo=request.GET.get("grupo") or None,
    )))


@login_required
@permission_required('can_view_support_results')
def api_tickets_list(request):
    return JsonResponse({"tickets": clean_json_props(get_support_tickets_list(
        limit=min(int(request.GET.get("limit", 500)), 5000),
        grupo=request.GET.get("grupo"),
        periodo=request.GET.get("period"),
    ))})
