import io
import json
import os
import tempfile
from contextlib import redirect_stdout, redirect_stderr
from inertia import render as render_inertia

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from django.contrib.auth.decorators import login_required
from frontend.config.decorators import permission_required

# Conectores y lógica de negocio del CRM
from backend.crm import (
    run_crm_analysis,
    import_crm_csv,
    get_crm_periodos,
    get_crm_cierre_historico,
    get_crm_metric_totals,
    get_crm_dimensiones,
)
from backend.utils import validate_csv_structure

TEMPLATE_PREFIX = "crm/"

REQUIRED_CRM_HEADERS = {
    "ID": "id",
    "Oportunidad": "oportunidad",
    "Cliente": "cliente",
    "Cliente/Municipio": "cliente_municipio",
    "Campaña": "campana",
    "Sucursal": "sucursal",
    "Vendedor": "vendedor",
    "Medio": "medio",
    "Medio/Supervisor": "medio_supervisor",
    "Equipo de ventas": "equipo_ventas",
    "Etapa": "etapa",
    "Motivo de pérdida": "motivo_perdida",
    "Devolver oportunidad": "devolver_oportunidad",
    "Ganado": "ganado",
    "Activo": "activo",
    "Creado el": "creado_el",
    "Fecha de cierre": "fecha_cierre",
    "Última actualización de la etapa": "ultima_actualizacion",
    "Duración Total (horas)": "duracion_total_horas",
    "Entradas de Tiempo/Iniciativa/ID": "entradas_de_tiempo_iniciativa_id",
    "Entradas de Tiempo/Duración (horas)": "entradas_de_tiempo_duracion_horas",
    "Entradas de Tiempo/Creado el": "entradas_de_tiempo_creado_el",
    "Entradas de Tiempo/Etapa Anterior": "entradas_de_tiempo_etapa_anterior",
    "Entradas de Tiempo/Nueva Etapa": "entradas_de_tiempo_nueva_etapa",
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


# --- VISTAS INERTIA PROTEGIDAS ---

@login_required
@permission_required('can_view_crm')
def dashboard(request):
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
    periodo = request.GET.get("period")
    dimension = request.GET.get("dimension", "sucursal")
    periodos = get_crm_periodos()
    
    target_period = periodo or (periodos[0] if periodos else None)
    dimensions_data = get_crm_dimensiones(periodos=[target_period] if target_period else None, dimension=dimension)

    return render_inertia(request, "CRM/Analytics", {
        "dimensionsData": dimensions_data,
        "periods": periodos,
        "selectedPeriod": target_period or "",
        "selectedDimension": dimension,
        "section": "analytics"
    })


@login_required
@permission_required('can_view_crm_results')
def results(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    historico = get_crm_cierre_historico(periodos)
    return render_inertia(request, "CRM/Results", {
        "historico": historico,
        "section": "results"
    })


@login_required
@permission_required('can_import_data')
def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})


# --- ENDPOINTS API ---

@login_required
@permission_required('can_view_crm')
def api_periods_list(request):
    return JsonResponse({"periods": get_crm_periodos()})


@login_required
@permission_required('can_view_crm')
def api_global_metrics(request):
    periodo = request.GET.get("period")
    return JsonResponse(get_crm_metric_totals(periodo))


@login_required
@permission_required('can_view_crm_results')
def api_cierre_historico(request):
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse({"historico": get_crm_cierre_historico(periodos)})


@login_required
@permission_required('can_view_crm_analytics')
def api_dimension_metrics(request):
    periodo = request.GET.get("period")
    dimension = request.GET.get("dimension")
    target_period = [periodo] if periodo else None
    return JsonResponse({"dimensiones": get_crm_dimensiones(periodos=target_period, dimension=dimension)})


@login_required
@permission_required('can_import_data')
@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
def api_import_crm(request):
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_CRM_HEADERS)
    if error:
        return error
    try:
        rows_clients, rows_logs = import_crm_csv(tmp_path)
        return JsonResponse({
            "status": "success",
            "message": f"CRM: {rows_clients} clientes y {rows_logs} logs importados correctamente.",
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)


@login_required
@permission_required('can_run_calculations')
@ratelimit(key='ip', rate='2/m', block=True)
@require_POST
def api_run_analysis(request):
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON inválido"}, status=400)

    # Validación estricta y obligatoria del periodo
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Periodo inválido. Se requiere el formato YYYY-MM."}, status=400)

    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        try:
            run_crm_analysis(mes)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)

    return JsonResponse({
        "status": "success",
        "message": f"Análisis CRM completado para el periodo {mes}.",
        "periodo_label": mes,
        "log_output": out.getvalue()
    })