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
import logging
import os
import sys
import tempfile

logger = logging.getLogger(__name__)

import pandas as pd
from django.http import JsonResponse
from django.shortcuts import render

from backend.analyzer import (
    ChurnRateAnalyzer,
    get_cierre_churn, get_dimensiones, get_periodos,
    get_dashboard_data, get_analytics_data,
)
from backend.database import DBConnector
from backend.imports import import_logs_csv, import_subscriptions_csv
from backend.lifetime import (
    run_lifecycle_analysis, get_lifecycle_results, get_lifetime_dimensiones,
)
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
        solicitados.
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

    Returns:
        JsonResponse con la clave "periods" y una lista plana de
        objetos {periodo, ...}.
    """
    return JsonResponse({"periods": get_cierre_churn()})


def api_results_detail(request, periodo):
    """
    Endpoint que devuelve el detalle de resultados para un periodo específico.

    Args:
        request: HttpRequest de Django (GET).
        periodo: Cadena con el periodo en formato YYYY-MM.

    Returns:
        JsonResponse con ``periodo``, ``summary`` (dict único),
        ``dimensions``.
    """
    cierre = get_cierre_churn([periodo])
    dims = get_dimensiones([periodo])
    summary = cierre[0] if cierre else {}
    dimensions = dims[0]["dimensiones"] if dims else {}
    return JsonResponse({
        "periodo": periodo,
        "summary": summary,
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


def api_survival_data(request):
    """
    Endpoint para la página de supervivencia Kaplan-Meier.

    Retorna curvas KM globales (desde el analisis de ciclo de vida)
    y curvas por dimension opcionalmente filtradas.

    Args:
        request: HttpRequest de Django (GET con ?dim=zona opcional).
        periodo: Ignorado (se retornan datos globales).

    Returns:
        JsonResponse con ``curva_activo``, ``curva_reactivacion``,
        ``stats``, ``curvas_dimension``.
    """
    lc = get_lifecycle_results()
    if not lc:
        return JsonResponse({
            "periodo": "global",
            "curva_activo": [],
            "curva_reactivacion": [],
            "stats": {},
            "curvas_dimension": {},
        })

    dim = request.GET.get("dim")
    curvas_dim = {}
    if dim:
        DIM_MAP = {
            "zona": "zona",
            "sucursal": "sucursal",
            "producto": "producto",
            "municipio": "municipio",
            "campana": "campanna",
        }
        db_dim = DIM_MAP.get(dim)
        if db_dim:
            try:
                dim_data = get_lifetime_dimensiones(db_dim)
                for d, valores in dim_data.items():
                    for val, info in valores.items():
                        curva = info.get("curva_activo", [])
                        if curva:
                            curvas_dim[val] = curva
            except Exception:
                logger.exception("Error reading lifetime dimension curves for dim=%s", dim)
                curvas_dim = {}

    curva_activo = lc.get("curva_activo", [])
    total = lc.get("n_total_activo", 0)
    n_evento = lc.get("n_evento_activo", 0)
    n_censurado = lc.get("n_censurado_activo", 0)

    return JsonResponse({
        "periodo": "global",
        "curva_activo": curva_activo,
        "curva_reactivacion": lc.get("curva_reactivacion", []),
        "stats": {
            "mediana_activo": lc.get("mediana_activo"),
            "promedio_activo": lc.get("promedio_activo"),
            "p25_activo": lc.get("p25_activo"),
            "p75_activo": lc.get("p75_activo"),
            "mediana_reactivacion": lc.get("mediana_reactivacion"),
            "p25_reactivacion": lc.get("p25_reactivacion"),
            "p75_reactivacion": lc.get("p75_reactivacion"),
            "promedio_reactivacion": lc.get("promedio_reactivacion"),
            "total_suscriptores": total,
            "total_eventos": n_evento,
            "n_censurado_activo": n_censurado,
            "tasa_censura": round(n_censurado / total, 4) if total and total > 0 else None,
            "tiempo_maximo": max((p["tiempo"] for p in (curva_activo or [])), default=None),
        },
        "curvas_dimension": curvas_dim,
    })


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


def api_lifecycle_run(request):
    """Ejecuta el analisis de ciclo de vida global (POST)."""
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Metodo no permitido"}, status=405)
    try:
        metrics = run_lifecycle_analysis()
        return JsonResponse({
            "status": "success",
            "message": "Analisis de ciclo de vida completado",
            "mediana_activo": metrics.get("mediana_activo"),
            "promedio_activo": metrics.get("promedio_activo"),
            "p25_activo": metrics.get("p25_activo"),
            "p75_activo": metrics.get("p75_activo"),
            "mediana_reactivacion": metrics.get("mediana_reactivacion"),
            "p25_reactivacion": metrics.get("p25_reactivacion"),
            "p75_reactivacion": metrics.get("p75_reactivacion"),
            "promedio_reactivacion": metrics.get("promedio_reactivacion"),
        })
    except Exception as e:
        logger.exception("Error en lifecycle run")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def api_lifecycle_results(request):
    """Recupera los resultados del analisis de ciclo de vida (GET)."""
    data = get_lifecycle_results()
    if not data:
        return JsonResponse({"status": "empty", "message": "Ejecute el analisis de ciclo de vida primero"})
    dimensiones = get_lifetime_dimensiones()
    return JsonResponse({"status": "success", "data": data, "dimensiones": dimensiones})
