"""Vistas del reporte ETA para la reguladora.

Ocho de las veintisiete vistas del modulo de suscripciones eran de ETA, casi
la mitad del archivo, y son un bloque cerrado: parametrizacion de planes y
suscripciones individuales, calculo del reporte y bloqueo del periodo. Se
separan aqui para que `views.py` vuelva a ser legible de un vistazo. Las rutas
no cambian: `urls.py` sigue exponiendo los mismos nombres.
"""

import json
import logging

from inertia import render as render_inertia

from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from services.config.decorators import permission_required

from core.database import DBConnector
from services.subscriptions.analytics import ETAReportManager, get_periodos
from core.utils import clean_json_props

logger = logging.getLogger(__name__)


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
    manager = ETAReportManager(DBConnector())
    props = manager.get_config_page_data(request.GET.get("period"))
    props["section"] = "eta_config"
    return render_inertia(request, "Subscriptions/EtaManagement", clean_json_props(props))


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