"""Vistas del reporte ETA para la reguladora.

Ocho de las veintisiete vistas del modulo de suscripciones eran de ETA, casi
la mitad del archivo, y son un bloque cerrado. Se separan aqui para que
`views.py` vuelva a ser legible de un vistazo.

Lo unico que ETA parametriza hoy son las **suscripciones individuales**: las
excepciones por orden, que son genuinamente de cada contrato y no tienen
equivalente en el catalogo. La clasificacion de un plan se edita en
`/subscriptions/config/` (ver `views_catalogos.py`), que es la unica fuente.
"""

import json
import logging

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from inertia import render as render_inertia

from core.database import DBConnector
from core.utils import clean_json_props, es_periodo
from services.config.decorators import permission_required
from services.subscriptions.analytics import ETAReportManager, get_periodos
from services.subscriptions.analytics.bcv import TasaNoDisponible

logger = logging.getLogger(__name__)

ERROR_GENERICO = "Error interno del servidor. Consulte el registro de la aplicación."


def error_interno(contexto: str) -> JsonResponse:
    """Registra la excepcion y responde sin exponer el mensaje original.

    `str(e)` de una excepcion de psycopg2 lleva dentro el esquema, la tabla y
    las columnas implicadas; eso llegaba tal cual al navegador.
    """
    logger.exception(contexto)
    return JsonResponse({"status": "error", "message": ERROR_GENERICO}, status=500)


@login_required
@permission_required('can_view_eta')
def eta_report(request):
    """Calcula y muestra el reporte de la reguladora de un periodo."""
    available = get_periodos()
    periodos_disponibles = sorted(list(set([p[:7] for p in available])), reverse=True)
    
    # Sin validar, `?period=%` llegaba al `LIKE %s` de `calculate_eta_report`
    # (ver analytics/eta_report.py) y el informe agregaba todos los periodos.
    periodo_req = request.GET.get("period")
    if periodo_req and not es_periodo(periodo_req):
        periodo_req = None
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
    """Pantalla de parametrizacion: excepciones individuales y pendientes."""
    manager = ETAReportManager(DBConnector())
    props = manager.get_config_page_data(request.GET.get("period"))
    props["section"] = "eta_config"
    return render_inertia(request, "Subscriptions/EtaManagement", clean_json_props(props))


@login_required
@permission_required('can_view_eta')
@ratelimit(key='ip', rate='30/m', block=True)
def api_eta_report_data(request):
    """API para recargar datos sin refrescar la página.

    `?force=true` salta el reporte ya guardado y relanza el pipeline completo
    —barrido de la tabla de cierres, de suscripciones y de `subscriptions-b`,
    mas una decena de matrices de pandas—, asi que exige `can_manage_eta` y no
    el permiso de lectura: recalcular no es leer. Sin esa distincion, cualquier
    cuenta con acceso al reporte podia fijar la CPU con un bucle de GET.
    """
    periodo = request.GET.get("period")
    if periodo and not es_periodo(periodo):
        return JsonResponse(
            {"status": "error", "message": "Periodo inválido (se espera YYYY-MM)."},
            status=400,
        )

    force = request.GET.get("force", "false").lower() == "true"
    if force:
        perfil = getattr(request.user, 'profile', None)
        if not (request.user.is_superuser or (perfil and perfil.has_permission('can_manage_eta'))):
            return JsonResponse(
                {
                    "status": "error",
                    "message": "Recalcular el reporte requiere el privilegio: can_manage_eta.",
                },
                status=403,
            )

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
    except Exception:
        return error_interno("Error en cálculo de reporte ETA")


@login_required
@permission_required('can_manage_eta')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_eta_report_lock(request):
    """Bloquea o desbloquea un periodo.

    Al bloquear se recalcula una ultima vez y se guarda: a partir de ahi el mes
    queda congelado aunque los datos de origen cambien. Ese recalculo es el
    pipeline entero, de ahi el limite de peticiones.
    """
    try:
        data = json.loads(request.body)
        periodo = data.get("period")
        lock = bool(data.get("lock", False))
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON invalido"}, status=400)

    if not es_periodo(periodo):
        return JsonResponse(
            {"status": "error", "message": "Periodo inválido (se espera YYYY-MM)."},
            status=400,
        )

    db = DBConnector()
    manager = ETAReportManager(db)
    try:
        manager.set_lock_status(periodo, lock)
        if lock:
            manager.calculate_eta_report(periodo, force_recalc=True)
    except Exception:
        return error_interno("Error al bloquear el periodo del reporte ETA")
    return JsonResponse({"status": "success", "esta_bloqueado": lock, "message": f"Periodo {periodo} actualizado."})


@login_required
@permission_required('can_manage_eta')
@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
def api_eta_report_save_sub_config(request):
    """Guarda la excepcion individual de una orden."""
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
            "es_dedicado": bool(data.get("es_dedicado", False)),
            # La renta de este contrato. Sin ella, su fila del formulario sale
            # sin renta basica: el catalogo comercial no puede darla, porque
            # cada enlace dedicado negocia la suya.
            "precio": float(data.get("precio", 0)),
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return JsonResponse(
            {"status": "error", "message": "Cuerpo de la petición inválido."}, status=400
        )

    if not orden:
        return JsonResponse({"status": "error", "message": "El campo orden es requerido"}, status=400)

    db = DBConnector()
    manager = ETAReportManager(db)
    try:
        manager.save_sub_individual_config(orden, config)
        return JsonResponse({"status": "success", "message": f"Suscripción {orden} guardada."})
    except Exception:
        return error_interno("Error al guardar la excepción individual de ETA")


@login_required
@permission_required('can_manage_eta')
@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
def api_eta_report_delete_sub_config(request):
    """Borra la excepcion individual de una orden."""
    try:
        data = json.loads(request.body)
        orden = data.get("orden")
        if not orden:
            return JsonResponse({"status": "error", "message": "ID de orden requerido"}, status=400)
        
        db = DBConnector()
        manager = ETAReportManager(db)
        manager.delete_sub_individual_config(orden)
        return JsonResponse({"status": "success", "message": f"Suscripción '{orden}' eliminada."})
    except Exception:
        return error_interno("Error al eliminar la excepción individual de ETA")


@login_required
@permission_required('can_manage_eta')
@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
def api_eta_report_tasa(request):
    """Fija la tasa del BCV con que se declara la renta basica del periodo.

    Se guarda por periodo: la renta se declara a la tasa del mes, y exportar un
    mes viejo con la tasa de hoy daria cifras que nadie declaro. No recalcula
    el reporte —los formularios guardan el precio en divisa y la conversion es
    del exportador—, asi que se puede corregir tambien en un periodo bloqueado.

    Mientras se teclea a mano. Cuando exista la consulta automatica al BCV solo
    cambia de donde sale el numero.
    """
    try:
        data = json.loads(request.body)
        periodo = data.get("period")
        tasa = float(data.get("tasa", 0))
    except (json.JSONDecodeError, TypeError, ValueError):
        return JsonResponse(
            {"status": "error", "message": "Cuerpo de la petición inválido."}, status=400
        )

    if not es_periodo(periodo):
        return JsonResponse(
            {"status": "error", "message": "Periodo inválido (se espera YYYY-MM)."},
            status=400,
        )

    # Una tasa negativa no es un dato raro sino un error de tecleo, y produciria
    # rentas negativas en un formulario oficial. Cero si vale: significa
    # "todavia sin fijar" y el exportador lo distingue de una tasa real.
    if tasa < 0:
        return JsonResponse(
            {"status": "error", "message": "La tasa no puede ser negativa."}, status=400
        )

    manager = ETAReportManager(DBConnector())
    fuente = "Escrita a mano"
    try:
        manager.set_tasa_bcv(periodo, tasa, fuente)
    except Exception:
        return error_interno("Error al guardar la tasa del BCV")
    return JsonResponse({"status": "success", "tasa_bcv": tasa, "tasa_bcv_fuente": fuente})


@login_required
@permission_required('can_manage_eta')
@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
def api_eta_report_tasa_consultar(request):
    """Vuelve a pedirle al BCV la tasa del periodo y la guarda.

    El reporte ya la consulta solo la primera vez que hace falta, asi que esto
    es para los dos casos en que aquello no basta: el servicio estaba caido
    cuando se miro el mes, o alguien escribio una tasa a mano y quiere volver a
    la del BCV. Por eso pisa lo que hubiera guardado.

    El limite es mas estrecho que el de las demas escrituras porque cada
    llamada sale a un tercero, y hasta siete veces si el mes empieza en puente.
    """
    try:
        periodo = json.loads(request.body).get("period")
    except (json.JSONDecodeError, TypeError):
        return JsonResponse(
            {"status": "error", "message": "Cuerpo de la petición inválido."}, status=400
        )

    if not es_periodo(periodo):
        return JsonResponse(
            {"status": "error", "message": "Periodo inválido (se espera YYYY-MM)."},
            status=400,
        )

    manager = ETAReportManager(DBConnector())
    try:
        tasa, fuente = manager.consultar_tasa_bcv(periodo)
    except TasaNoDisponible as e:
        # 502 y no 500: el fallo es del tercero, no nuestro, y el mensaje esta
        # escrito para leerse —dice si no se pudo contactar o si el BCV no
        # publico esos dias— asi que se enseña tal cual.
        return JsonResponse({"status": "error", "message": str(e)}, status=502)
    except Exception:
        return error_interno("Error al consultar la tasa del BCV")

    return JsonResponse({"status": "success", "tasa_bcv": tasa, "tasa_bcv_fuente": fuente})
