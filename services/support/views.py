"""Vistas del modulo de soporte.

Los endpoints de importacion y de lanzamiento de analisis viven en la app
`imports`, que es su unica duena.
"""

# frontend/support/views.py

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from inertia import render as render_inertia

from core.utils import clean_json_props, entero_de_peticion, limpiar_periodos
from services.config.decorators import permission_required
from services.support.analytics.day_metrics import (
    get_support_day_payload,
    get_support_day_series,
)
from services.support.analytics.queries import (
    get_support_analytics_structured,
    get_support_breakdown,
    get_support_cierre_historico,
    get_support_metric_totals,
    get_support_periodos,
    get_support_tickets_list,
)

# --- VISTAS INERTIA PROTEGIDAS ---

@login_required
@permission_required('can_view_support')
def dashboard(request):
    """Portada: el promedio de todos los periodos evaluados."""
    return render_inertia(request, "Support/Dashboard", clean_json_props({
        "metrics": get_support_metric_totals(),
        "section": "dashboard",
    }))


@login_required
@permission_required('can_view_support_analytics')
def analytics(request):
    """Analytics de un periodo: grupos, dimensiones e incidencia por zona.

    Las dimensiones llegan enteras porque el selector es de cliente; solo el
    drill-down de un valor concreto pide datos nuevos.

    `?dia=` cambia el bloque por el corte acumulado del mes hasta ese dia, ya
    calculado en `support_day_metrics`. Sin el se ensena el ultimo corte, que en
    un mes cerrado coincide con el cierre.

    En los props viaja ademas la **serie ligera** del mes: el bloque global de
    los treinta y un dias -el total y el de cada grupo de trabajo-, sin
    desgloses. Con ella el cliente resuelve solo las tarjetas del dia, el
    acumulado, la variacion contra el dia anterior y las lineas de tendencia, y
    ademas sigue al selector de grupo sin ir al servidor. Lo unico que
    se pide por dia es el desglose por grupo, y va por `api/day-metrics/`, que el
    cliente cachea.
    """
    periodos = get_support_periodos()
    analytics_data = get_support_analytics_structured(request.GET.get("period"))
    periodo = analytics_data.get("periodo", "")

    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    serie = get_support_day_series(periodo) if periodo else {}
    disponibles = serie.get("dias_disponibles", [])
    dia_activo = dia if dia in disponibles else (disponibles[-1] if disponibles else 0)

    corte = get_support_day_payload(periodo, dia_activo) if dia_activo else None
    if corte:
        analytics_data = {**analytics_data, **corte}

    return render_inertia(request, "Support/Analytics", clean_json_props({
        "analyticsData": analytics_data,
        "dayMetrics": {
            "periodo_mes": serie.get("periodo_mes", periodo),
            "dias_disponibles": disponibles,
            "dia": dia_activo,
            "serie": serie.get("serie", {}),
            # Abierta por grupo de trabajo: la pagina esta filtrada por grupo y
            # las tarjetas del dia tienen que seguir al selector.
            "serie_grupos": serie.get("serie_grupos", {}),
        },
        "periods": periodos,
        "selectedPeriod": periodo,
        "section": "analytics",
    }))


@login_required
@permission_required('can_view_support_results')
def results(request):
    """Tabla de cierres por periodo."""
    # `limpiar_periodos` valida la forma YYYY-MM y corta la lista: se partia
    # por comas sin ningun tope y cada elemento se convierte en un marcador del
    # `IN (...)`, asi que una sola peticion podia pedir cien mil.
    periodos = limpiar_periodos(request.GET.get("periods"))

    return render_inertia(request, "Support/Results", clean_json_props({
        "historico": get_support_cierre_historico(periodos),
        "section": "results",
    }))


# --- ENDPOINTS API ---

@login_required
@permission_required('can_view_support')
def api_periods_list(request):
    """Los periodos con cierre calculado."""
    return JsonResponse({"periods": get_support_periodos()})


@login_required
@permission_required('can_view_support')
def api_global_metrics(request):
    """El promedio de todos los periodos, en JSON."""
    return JsonResponse(clean_json_props(get_support_metric_totals()))


@login_required
@permission_required('can_view_support')
def api_cierre_historico(request):
    """Los cierres de los periodos pedidos."""
    # `limpiar_periodos` valida la forma YYYY-MM y corta la lista: se partia
    # por comas sin ningun tope y cada elemento se convierte en un marcador del
    # `IN (...)`, asi que una sola peticion podia pedir cien mil.
    periodos = limpiar_periodos(request.GET.get("periods"))
    return JsonResponse({
        "historico": clean_json_props(get_support_cierre_historico(periodos))
    })


@login_required
@permission_required('can_view_support_analytics')
def api_dimension_metrics(request):
    """Todo el bloque estructurado de un periodo."""
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
@permission_required('can_view_support_analytics')
def api_day_metrics(request):
    """El corte completo de un dia: `{global, grupos, incidencia_zonas}`.

    Existe para que la barra de dias no pase por Inertia: el cliente pide el dia
    que le falta, lo cachea y adelanta los vecinos, de modo que moverse por el
    mes deja de esperar a la base. No calcula nada —lee una celda de
    `support_day_metrics`, ya escrita por el analisis—.
    """
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    if not periodo or not dia:
        return JsonResponse(
            {"status": "error", "message": "Se requieren period y dia."}, status=400
        )

    corte = get_support_day_payload(periodo, dia)
    if corte is None:
        return JsonResponse({"status": "empty", "dia": dia}, status=404)

    return JsonResponse(clean_json_props({"dia": dia, **corte}))


@login_required
@permission_required('can_view_support_results')
def api_tickets_list(request):
    """Listado de tickets, con tope de 5.000."""
    return JsonResponse({"tickets": clean_json_props(get_support_tickets_list(
        limit=entero_de_peticion(request, "limit", por_defecto=500, minimo=1, maximo=5000),
        grupo=request.GET.get("grupo"),
        periodo=request.GET.get("period"),
    ))})
