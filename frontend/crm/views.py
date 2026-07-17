import io
import os
import tempfile  # <-- Requerido para crear el archivo temporal de subida
from contextlib import redirect_stdout, redirect_stderr

from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.views.decorators.http import require_POST
from django_ratelimit.decorators import ratelimit
from django.contrib.auth.decorators import login_required
from frontend.config.decorators import admin_required, analyst_or_admin_required

# Conectores y lógica de negocio del CRM
from backend.crm import (
    run_crm_analysis,
    import_crm_csv,
    get_metric_totals,
    get_metric_tiempo_instalacion,
    get_metric_tiempo_por_etapa,
    get_metric_efectividad,
    get_metric_etapa8,
    get_metric_perdido,
    get_metric_rescate,
    get_dimension_totals,
    get_dimension_tiempo_instalacion,
    get_dimension_tiempo_por_etapa,
    get_dimension_efectividad,
    get_dimension_etapa8,
    get_dimension_perdido,
    get_dimension_rescate,
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


# === HELPERS LOCALES PARA EL MANEJO DE SUBIDAS (PÚBLICOS) ===
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
        tmp_path = tmp.name  # Guardamos la ruta inmediatamente
        
        for chunk in csv_file.chunks():
            tmp.write(chunk)
        tmp.close()
        
        if required_headers:
            is_valid, err_msg = validate_csv_structure(tmp_path, required_headers)
            if not is_valid:
                cleanup_tempfile(tmp_path)  # Limpieza en caso de validación fallida
                return None, JsonResponse({"status": "error", "message": err_msg}, status=400)
                
    except Exception as e:
        if tmp_path:
            cleanup_tempfile(tmp_path)  # Limpieza garantizada en caso de excepción de escritura
        return None, JsonResponse({"status": "error", "message": f"Error al procesar el archivo: {str(e)}"}, status=500)
        
    return tmp_path, None

def cleanup_tempfile(tmp_path):
    if tmp_path:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

@login_required
def dashboard(request):
    return render(request, f"{TEMPLATE_PREFIX}dashboard.html", {"section": "dashboard"})

@login_required
def analytics(request):
    return render(request, f"{TEMPLATE_PREFIX}analytics.html", {"section": "analytics"})

@login_required
def results(request):
    return render(request, f"{TEMPLATE_PREFIX}results.html", {"section": "results"})

@login_required
@analyst_or_admin_required
def imports(request):
    return render(request, f"{TEMPLATE_PREFIX}imports.html", {"section": "imports"})

@login_required
@analyst_or_admin_required
@ratelimit(key='ip', rate='5/m', block=True)
def api_import_crm(request):
    tmp_path, error = handle_csv_upload(request, required_headers=REQUIRED_CRM_HEADERS)
    if error:
        return error
    try:
        rows_clients, rows_logs = import_crm_csv(tmp_path)
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(out):
            try:
                run_crm_analysis()
            except Exception as e:
                return JsonResponse({
                    "status": "success",
                    "message": f"Clientes: {rows_clients} | Logs: {rows_logs} filas importadas. ERROR en analisis: {str(e)}",
                    "log_output": out.getvalue(),
                })
        return JsonResponse({
            "status": "success",
            "message": f"Clientes: {rows_clients} | Logs: {rows_logs} filas importadas. Analisis completado.",
            "log_output": out.getvalue(),
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        cleanup_tempfile(tmp_path)

@login_required
@analyst_or_admin_required
@ratelimit(key='ip', rate='2/m', block=True)
def api_run_analysis(request):
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        try:
            run_crm_analysis()
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e), "log_output": out.getvalue()}, status=500)
    return JsonResponse({"status": "success", "log_output": out.getvalue()})

# --- Per-Metric API endpoints ---
@login_required
def api_metric_totals(request):
    return JsonResponse(get_metric_totals(), safe=False)

@login_required
def api_metric_tiempo_instalacion(request):
    return JsonResponse(get_metric_tiempo_instalacion(), safe=False)

@login_required
def api_metric_tiempo_por_etapa(request):
    return JsonResponse(get_metric_tiempo_por_etapa(), safe=False)

@login_required
def api_metric_efectividad(request):
    return JsonResponse(get_metric_efectividad(), safe=False)

@login_required
def api_metric_etapa8(request):
    return JsonResponse(get_metric_etapa8(), safe=False)

@login_required
def api_metric_perdido(request):
    return JsonResponse(get_metric_perdido(), safe=False)

@login_required
def api_metric_rescate(request):
    return JsonResponse(get_metric_rescate(), safe=False)

@login_required
def api_dimension_totals(request):
    return JsonResponse(get_dimension_totals(), safe=False)

@login_required
def api_dimension_tiempo_instalacion(request):
    return JsonResponse(get_dimension_tiempo_instalacion(), safe=False)

@login_required
def api_dimension_tiempo_por_etapa(request):
    return JsonResponse(get_dimension_tiempo_por_etapa(), safe=False)

@login_required
def api_dimension_efectividad(request):
    return JsonResponse(get_dimension_efectividad(), safe=False)

@login_required
def api_dimension_etapa8(request):
    return JsonResponse(get_dimension_etapa8(), safe=False)

@login_required
def api_dimension_perdido(request):
    return JsonResponse(get_dimension_perdido(), safe=False)

@login_required
def api_dimension_rescate(request):
    return JsonResponse(get_dimension_rescate(), safe=False)
