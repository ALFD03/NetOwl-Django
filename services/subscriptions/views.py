"""Vistas del modulo de suscripciones.

Las de ETA viven en `views_eta.py`; los endpoints de importacion y de
lanzamiento de analisis, en la app `imports`, que es su unica duena.
"""

import logging

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core.utils import entero_de_peticion, limpiar_periodos
from services.config.decorators import permission_required
from services.imports.jobs import lanzar_analisis
from services.subscriptions.analytics import (
    get_analytics_data,
    get_bajas_detalle,
    get_business_units_data,
    get_cierre_churn,
    get_dashboard_data,
    get_day_metrics,
    get_dimensiones,
    get_objetivos_config,
    get_periodos,
    get_sales_report_data,
    get_zonas_config,
    limpiar_nodos,
)
from services.subscriptions.analytics.lifetime import (
    get_lifetime_detalle,
    get_lifetime_mes,
    get_meses_lifetime,
)

logger = logging.getLogger(__name__)


# --- VISTAS HTML PROTEGIDAS POR PERMISO GRANULAR ---

@login_required
@permission_required('can_view_subscriptions')
def dashboard(request):
    """Portada del modulo: los cierres de todos los periodos y las zonas."""
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
        "objetivos": get_objetivos_config(),
        "section": "dashboard"
    })

@login_required
@permission_required('can_view_subs_analytics')
def analytics(request):
    """Analytics: cierres, dimensiones y el mes completo de metricas diarias.

    El mes viaja entero en los props para que elegir un dia en la barra sea una
    lectura de cliente y no un recalculo.
    """
    # `limpiar_periodos` valida la forma YYYY-MM y corta la lista: se partia
    # por comas sin ningun tope y cada elemento se convierte en un marcador del
    # `IN (...)`, asi que una sola peticion podia pedir cien mil.
    periodos = limpiar_periodos(request.GET.get("periods"))
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
        "objetivos": get_objetivos_config(),
        "section": "analytics"
    })

@login_required
@permission_required('can_view_subs_results')
def results(request, periodo=None):
    """Tabla de resultados por periodo, con detalle opcional de uno concreto."""
    cierres = get_cierre_churn([periodo] if periodo else None)
    return render_inertia(request, "Subscriptions/Results", {
        "periodos": cierres,
        "selected_periodo": periodo,
        "objetivos": get_objetivos_config(),
        "section": "results"
    })

@login_required
@permission_required('can_view_subs_lifetime')
def lifetime(request):
    """Cuanto duraron activas las suscripciones que se dieron de baja en un mes.

    `?period=YYYY-MM` elige el mes; sin el, o con uno no calculado, se muestra
    el mas reciente. La pagina abre aunque el analisis nunca se haya ejecutado:
    sin meses, `lifetime` llega en `null`.
    """
    try:
        meses = get_meses_lifetime()
    except Exception:
        logger.exception("Error leyendo los meses de lifetime")
        meses = []
    periodo = request.GET.get("period")
    if periodo not in meses:
        periodo = meses[0] if meses else None

    return render_inertia(request, "Subscriptions/Lifetime", {
        "meses": meses,
        "periodo": periodo,
        "lifetime": get_lifetime_mes(periodo),
        "section": "lifetime"
    })

@login_required
@permission_required('can_view_subs_sales')
def sales_report(request):
    """Reporte de ventas: Site -> Tecnologia -> Nodos, con subtotales."""
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    data = get_sales_report_data(periodo, dia)
    return render_inertia(request, "Subscriptions/SalesReport", {
        "reportData": data,
        "dayMetrics": get_day_metrics((data.get("period") or "")[:7]),
        "zonasConfig": get_zonas_config(),
        "objetivos": get_objetivos_config(),
        "section": "sales_report"
    })

@login_required
@permission_required('can_view_subs_sales')
def business_units(request):
    """Reporte por coordinador, mas el resumen FTTH global y el bloque RF."""
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    data = get_business_units_data(periodo, dia)
    return render_inertia(request, "Subscriptions/BusinessUnits", {
        "buData": data,
        "dayMetrics": get_day_metrics((data.get("period") or "")[:7]),
        "zonasConfig": get_zonas_config(),
        "objetivos": get_objetivos_config(),
        "section": "business_units"
    })




# --- APIS DE LECTURA DE DATOS ---

@login_required
@permission_required('can_view_subscriptions')
def api_dashboard_data(request):
    """Los datos del dashboard en JSON."""
    return JsonResponse(get_dashboard_data())

@login_required
@permission_required('can_view_subs_analytics')
def api_analytics_data(request):
    """Cierres y dimensiones de los periodos pedidos."""
    # `limpiar_periodos` valida la forma YYYY-MM y corta la lista: se partia
    # por comas sin ningun tope y cada elemento se convierte en un marcador del
    # `IN (...)`, asi que una sola peticion podia pedir cien mil.
    periodos = limpiar_periodos(request.GET.get("periods"))
    return JsonResponse(get_analytics_data(periodos))

@login_required
@permission_required('can_view_subscriptions')
def api_periods_list(request):
    """Los periodos con cierre calculado."""
    return JsonResponse({"periods": get_periodos()})

@login_required
@permission_required('can_view_subs_results')
def api_results_list(request):
    """Los cierres completos, para la tabla de resultados."""
    return JsonResponse({"periods": get_cierre_churn()})

@login_required
@permission_required('can_view_subs_results')
def api_results_detail(request, periodo):
    """El cierre y las dimensiones de un periodo concreto."""
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
def api_lifetime_detalle(request):
    """Las bajas de un mes con sus duraciones, una por orden, para exportar."""
    periodo = request.GET.get("period")
    return JsonResponse({"period": periodo, "bajas": get_lifetime_detalle(periodo)})

@login_required
@permission_required('can_view_subs_sales')
def api_sales_report(request):
    """El reporte de ventas de un periodo (y opcionalmente de un dia)."""
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    return JsonResponse(get_sales_report_data(periodo, dia))

@login_required
@permission_required('can_view_subs_results', 'can_view_subs_sales')
def api_bajas_detalle(request):
    """Las bajas de un periodo con la ficha de cada cliente, para exportar.

    `?nodo=` repetido acota a esos nodos `"Zona - Sucursal"`; sin el devuelve
    las del periodo entero. Los manda el cliente porque los tres reportes
    agrupan distinto -site, coordinador, nodo suelto- y cada uno ya sabe que
    nodos tiene en pantalla.

    El filtro es por nodo y no por zona: la misma zona puede estar repartida
    entre dos sucursales y son dos filas distintas del reporte.

    No admite `?dia=`: `analyzer_day_metrics` guarda agregados por dia, no las
    ordenes que los componen, asi que el detalle es siempre el del cierre del mes.
    """
    nodos = limpiar_nodos(request.GET.getlist("nodo"))
    return JsonResponse(get_bajas_detalle(request.GET.get("period"), nodos))



# --- APIS DE ESCRITURA Y CÁLCULOS ESPECIALES ---

@login_required
@permission_required('can_run_lifetime') # <-- CONTROL ESPECÍFICO DE EJECUCIÓN DE LIFETIME
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_lifecycle_run(request):
    """Encola el calculo del lifetime de todos los meses; el worker lo ejecuta.

    Carga y limpia el log entero como el analisis mensual, asi que sufria el
    mismo timeout. Se sigue con los endpoints de
    `imports` (`/imports/api/jobs/<id>/`), que son comunes a todos los modulos.
    """
    return lanzar_analisis(request, 'subs_lifetime', requiere_periodo=False)





@login_required
@permission_required('can_view_subs_sales')
def api_business_units_report(request):
    """El reporte por unidades de negocio de un periodo (y de un dia)."""
    periodo = request.GET.get("period")
    dia = entero_de_peticion(request, "dia", minimo=1, maximo=31)
    return JsonResponse(get_business_units_data(periodo, dia))



