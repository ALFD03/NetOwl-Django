"""Vistas del modulo CRM.

Los endpoints de importacion y de lanzamiento de analisis viven en la app
`imports`, que es su unica duena.
"""

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from inertia import render as render_inertia

from core.utils import clean_json_props, entero_de_peticion, limpiar_periodos
from services.config.decorators import permission_required
from services.crm.analytics import (
    get_crm_cierre_historico,
    get_crm_day_payload,
    get_crm_day_series,
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

    `?dia=` elige un corte acumulado del mes en vez del cierre. Sale de
    `crm_day_metrics`, ya calculado por el analisis, y trae las mismas dos
    props, asi que la pagina no distingue una cosa de la otra. Sin `?dia=` se
    ensena el ultimo corte calculado, que en un mes cerrado es el cierre y en el
    mes en curso es la foto mas reciente.

    En los props viaja ademas la **serie ligera** del mes: el bloque global de
    los treinta y un dias, sin desgloses. Con ella el cliente resuelve solo las
    tarjetas del dia, el acumulado, la variacion contra el dia anterior y las
    lineas de tendencia, asi que mover la barra no espera a nadie. Lo unico que
    se pide por dia es el desglose dimensional, y va por
    `api/day-metrics/`, que el cliente cachea.
    """
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    periodos = get_crm_periodos()

    target_period = periodo or (periodos[0] if periodos else None)

    serie = get_crm_day_series(target_period) if target_period else {}
    disponibles = serie.get("dias_disponibles", [])
    # Sin `?dia=`, el ultimo corte: el mas reciente y el unico que se puede
    # ensenar sin mentir.
    dia_activo = dia if dia in disponibles else (disponibles[-1] if disponibles else 0)
    corte = get_crm_day_payload(target_period, dia_activo) if dia_activo else None

    if corte:
        dimensions_data = corte.get("dimensiones", [])
        global_data = corte.get("global", {})
    else:
        # Sin cortes diarios calculados, el cierre del mes: es lo que habia antes
        # de que existiera la barra y sigue siendo la respuesta correcta.
        dimensions_data = get_crm_dimensiones(
            periodos=[target_period] if target_period else None
        )
        cierre = get_crm_cierre_historico([target_period]) if target_period else []
        global_data = cierre[0] if cierre else {}

    return render_inertia(request, "CRM/Analytics", clean_json_props({
        "dimensionsData": dimensions_data,
        "globalData": global_data,
        "dayMetrics": {
            "periodo_mes": serie.get("periodo_mes", target_period or ""),
            "dias_disponibles": disponibles,
            "dia": dia_activo,
            "serie": serie.get("serie", {}),
        },
        "periods": periodos,
        "selectedPeriod": target_period or "",
        "section": "analytics"
    }))


@login_required
@permission_required('can_view_crm_results')
def results(request):
    """Tabla de cierres por periodo."""
    # `limpiar_periodos` valida la forma YYYY-MM y corta la lista: se partia
    # por comas sin ningun tope y cada elemento se convierte en un marcador del
    # `IN (...)`, asi que una sola peticion podia pedir cien mil.
    periodos = limpiar_periodos(request.GET.get("periods"))
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
    # `limpiar_periodos` valida la forma YYYY-MM y corta la lista: se partia
    # por comas sin ningun tope y cada elemento se convierte en un marcador del
    # `IN (...)`, asi que una sola peticion podia pedir cien mil.
    periodos = limpiar_periodos(request.GET.get("periods"))
    return JsonResponse({"historico": get_crm_cierre_historico(periodos)})


@login_required
@permission_required('can_view_crm_analytics')
def api_day_metrics(request):
    """El corte completo de un dia: `{global, dimensiones}`.

    Existe para que la barra de dias no pase por Inertia: el cliente pide el dia
    que le falta, lo cachea y adelanta los vecinos, de modo que moverse por el
    mes deja de esperar a la base. No calcula nada —lee una celda de
    `crm_day_metrics`, ya escrita por el analisis—.
    """
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    if not periodo or not dia:
        return JsonResponse(
            {"status": "error", "message": "Se requieren period y dia."}, status=400
        )

    corte = get_crm_day_payload(periodo, dia)
    if corte is None:
        return JsonResponse({"status": "empty", "dia": dia}, status=404)

    return JsonResponse(clean_json_props({"dia": dia, **corte}))


@login_required
@permission_required('can_view_crm_analytics', 'can_view_crm_results')
def api_dimension_metrics(request):
    """Las metricas de una dimension y un periodo."""
    periodo = request.GET.get("period")
    dimension = request.GET.get("dimension")
    target_period = [periodo] if periodo else None
    dimensiones = get_crm_dimensiones(periodos=target_period, dimension=dimension)
    return JsonResponse({"dimensiones": clean_json_props(dimensiones)})


