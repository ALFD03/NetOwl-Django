"""
Vistas delgadas — conectan el frontend Django con la API del backend.

Cada función recibe una petición HTTP (request), delega la lógica
de negocio a los módulos de backend (data_api, analyzer, database,
imports, models) y devuelve una respuesta JSON o una plantilla HTML.

Dependencias:
  - Django (django.http, django.shortcuts)
  - backend.data_api          — consultas analíticas precalculadas
  - backend.analyzer           — ejecutor del análisis de churn
  - backend.database           — conexión a base de datos
  - backend.imports            — importación de CSV
  - backend.models             — modelo Periodo
  - json, io, os, sys, tempfile (estándar)
"""

import json
import io
import os
import sys
import tempfile

from django.http import JsonResponse
from django.shortcuts import render

from backend.data_api import (
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data, get_tiempos_globales,
)
from backend.analyzer import ChurnRateAnalyzer
from backend.database import DBConnector
from backend.imports import import_logs_csv, import_subscriptions_csv
from backend.models import Periodo


def dashboard(request, periodo=None):
    """
    Renderiza la plantilla SPA (Single Page Application) del dashboard.

    Todas las rutas que no comienzan con /api/ caen aquí; el enrutamiento
    interno se maneja del lado del cliente con JavaScript.

    Args:
        request:  HttpRequest de Django.
        periodo:  Opcional. Cadena con el periodo (YYYY-MM) para vistas
                  que incluyen un periodo en la URL.

    Returns:
        HttpResponse con el HTML de la plantilla "analyzer/dashboard.html".
    """
    return render(request, "analyzer/dashboard.html")


def api_dashboard_data(request):
    """
    Endpoint que devuelve los datos agregados para el dashboard.

    Consulta la función `get_dashboard_data()` del backend y retorna
    el resultado como JSON.

    Args:
        request: HttpRequest de Django (GET).

    Returns:
        JsonResponse con los datos del dashboard (por ejemplo, totales
        de suscriptores, altas, bajas, tasas de churn, etc.).
    """
    return JsonResponse(get_dashboard_data())


def api_analytics_data(request):
    """
    Endpoint que devuelve datos analíticos filtrados por periodos.

    Lee el parámetro GET "periods" (lista separada por comas de periodos
    en formato YYYY-MM). Si no se envía, retorna datos para todos los
    periodos disponibles.

    Args:
        request: HttpRequest de Django (GET con ?periods=...).

    Returns:
        JsonResponse con los datos analíticos para los periodos
        solicitados (métricas de churn por metodo, evolución temporal, etc.).
    """
    # Extraer y sanitizar el parámetro de periodos desde la query string
    periods_param = request.GET.get("periods")
    periodos = [p.strip() for p in periods_param.split(",") if p.strip()] if periods_param else None
    return JsonResponse(get_analytics_data(periodos))


def api_periods_list(request):
    """
    Endpoint que devuelve la lista de periodos disponibles en la BD.

    Args:
        request: HttpRequest de Django (GET).

    Returns:
        JsonResponse con la clave "periods" cuyo valor es una lista
        de cadenas en formato YYYY-MM.
    """
    return JsonResponse({"periods": get_periodos()})


def api_results_list(request):
    """
    Endpoint que devuelve el historial completo de resultados de churn.

    Aplana la estructura anidada devuelta por `get_cierre_churn()` para
    facilitar el consumo desde el frontend. Cada elemento contiene el
    periodo de reporte junto con los datos del método.

    Args:
        request: HttpRequest de Django (GET).

    Returns:
        JsonResponse con la clave "periods" y una lista plana de
        objetos {periodo, metodo, ...}.
    """
    data = get_cierre_churn()
    flat = []
    for p in data:
        # Aplanar: cada método dentro de un periodo se convierte en un item independiente
        for m in p["metodos"]:
            flat.append({"periodo": p["periodo_reporte"], **m})
    return JsonResponse({"periods": flat})


def api_results_detail(request, periodo):
    """
    Endpoint que devuelve el detalle de resultados para un periodo específico.

    Combina la información del cierre de churn, las dimensiones y los
    tiempos globales en una sola respuesta.

    Args:
        request: HttpRequest de Django (GET).
        periodo: Cadena con el periodo en formato YYYY-MM.

    Returns:
        JsonResponse con:
          - "periodo":    el periodo solicitado.
          - "summaries":  lista de métodos con sus métricas de churn.
          - "dimensions": desglose por dimensiones (plan, país, etc.).
    """
    cierre = get_cierre_churn([periodo])
    dims = get_dimensiones([periodo])
    summaries = cierre[0]["metodos"] if cierre else []
    # Obtener promedios de días activo/cancelado y añadirlos a cada método
    tiempos = get_tiempos_globales([periodo])
    t = tiempos.get(periodo, {})
    for m in summaries:
        m["prom_dias_activo"] = t.get("prom_dias_activo", 0)
        m["prom_dias_cancelado"] = t.get("prom_dias_cancelado", 0)
    dimensions = dims[0]["dimensiones"] if dims else {}
    return JsonResponse({
        "periodo": periodo,
        "summaries": summaries,
        "dimensions": dimensions,
    })


def api_run_analysis(request):
    """
    Ejecuta el análisis de churn para un periodo dado.

    Recibe un JSON con el campo "month" (YYYY-MM). Construye un objeto
    Periodo, instancia el analizador y lo ejecuta. Captura toda la salida
    estándar y de error generada durante el análisis para devolverla al
    frontend.

    Args:
        request: HttpRequest de Django (POST con body JSON).

    Returns:
        JsonResponse con:
          - "status":        "success" o "error".
          - "periodo_label": etiqueta legible del periodo (solo en éxito).
          - "log_output":    texto capturado de stdout/stderr (solo en éxito).
          - "message":       mensaje de error (solo en error).

    Raises:
        JsonResponse con status 400 si el JSON es inválido o falta el mes.
        JsonResponse con status 405 si el método HTTP no es POST.
        JsonResponse con status 500 si ocurre un error durante el análisis.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "JSON invalido"}, status=400)
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Periodo invalido (YYYY-MM)"}, status=400)
    try:
        periodo = Periodo.build(f"{mes}-01")
        periodo_label = periodo.label()
        # Redirigir stdout/stderr a un buffer para capturar los logs del análisis
        capture = io.StringIO()
        old_out, old_err = sys.stdout, sys.stderr
        sys.stdout = capture
        sys.stderr = capture
        try:
            analyzer = ChurnRateAnalyzer(DBConnector(), periodo)
            analyzer.run()
        except Exception as e:
            # Restaurar los streams originales antes de responder con error
            sys.stdout, sys.stderr = old_out, old_err
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
        finally:
            # Obtener el contenido capturado y restaurar los streams originales
            result_output = capture.getvalue()
            sys.stdout, sys.stderr = old_out, old_err
        return JsonResponse({
            "status": "success",
            "periodo_label": periodo_label,
            "log_output": result_output,
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def api_import_subscriptions(request):
    """
    Importa un archivo CSV de suscripciones a la base de datos.

    Recibe el archivo mediante multipart/form-data, lo escribe en un
    archivo temporal, invoca `import_subscriptions_csv` del backend y
    elimina el temporal al finalizar.

    Args:
        request: HttpRequest de Django (POST con archivo en
                 request.FILES["csv_file"]).

    Returns:
        JsonResponse con:
          - "status":  "success" o "error".
          - "message": descripción del resultado (número de filas
                       importadas o mensaje de error).

    Raises:
        JsonResponse con status 405 si el método no es POST.
        JsonResponse con status 400 si no se envía el archivo.
        JsonResponse con status 500 si ocurre un error de importación.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    if "csv_file" not in request.FILES:
        return JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
    csv_file = request.FILES["csv_file"]
    tmp_path = None
    try:
        # Guardar el archivo subido en un temporal para procesarlo
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            for chunk in csv_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        rows = import_subscriptions_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Subscripciones: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        # Asegurar la limpieza del archivo temporal
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def api_import_logs(request):
    """
    Importa un archivo CSV de logs a la base de datos.

    Funciona de manera análoga a `api_import_subscriptions` pero invoca
    `import_logs_csv` del backend.

    Args:
        request: HttpRequest de Django (POST con archivo en
                 request.FILES["csv_file"]).

    Returns:
        JsonResponse con:
          - "status":  "success" o "error".
          - "message": descripción del resultado (número de filas
                       importadas o mensaje de error).

    Raises:
        JsonResponse con status 405 si el método no es POST.
        JsonResponse con status 400 si no se envía el archivo.
        JsonResponse con status 500 si ocurre un error de importación.
    """
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    if "csv_file" not in request.FILES:
        return JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
    csv_file = request.FILES["csv_file"]
    tmp_path = None
    try:
        # Guardar el archivo subido en un temporal para procesarlo
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            for chunk in csv_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        rows = import_logs_csv(tmp_path)
        return JsonResponse({"status": "success", "message": f"Logs: {rows} filas importadas."})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
    finally:
        # Asegurar la limpieza del archivo temporal
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
