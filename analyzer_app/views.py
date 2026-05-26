"""
Vistas (controladores) de la aplicación analyzer_app.

Cada función recibe un objeto HttpRequest y devuelve una HttpResponse,
generalmente renderizando un template HTML. Cubre cuatro funcionalidades
principales:

    1. Dashboard: formulario de selección de mes, ejecución del análisis
       de churn y visualización de resultados recientes.
    2. Importación de CSVs: suscripciones y logs de llamadas.
    3. Listado histórico de resultados.
    4. Detalle de un período específico (resumen + dimensiones).

Dependencias:
    - django.contrib.messages (notificaciones flash al usuario)
    - pandas (lectura de tablas desde DB)
    - Backend: ChurnRateAnalyzer, DBConnector, import_*, Periodo
    - Formularios: CSVUploadForm, MonthForm
"""

import io
import os
import sys
import tempfile
from datetime import datetime

import pandas as pd
from django.contrib import messages
from django.shortcuts import redirect, render

from .backend.analyzer import ChurnRateAnalyzer
from .backend.database import DBConnector
from .backend.imports import import_logs_csv, import_subscriptions_csv
from .backend.models import Periodo
from .forms import CSVUploadForm, MonthForm


def dashboard(request):
    """
    Vista principal del dashboard.

    En GET: muestra el formulario de selección de mes y los últimos 10
    resultados disponibles en la tabla 'cierre_churn_historico'.

    En POST: ejecuta el análisis de churn para el mes seleccionado,
    captura la salida de consola del backend y la muestra al usuario,
    junto con las métricas resumidas de dicho período.

    Args:
        request (HttpRequest): Solicitud HTTP entrante.

    Returns:
        HttpResponse: Página renderizada con formulario, resultados y
                      mensajes de información/error.
    """
    initial_data = {"month": datetime.now().strftime("%Y-%m")}
    form = MonthForm(initial=initial_data)
    result_output = None
    periodo_label = None
    summaries = []

    if request.method == "POST":
        form = MonthForm(request.POST)
        if form.is_valid():
            mes = form.cleaned_data["month"]
            try:
                periodo = Periodo.build(f"{mes}-01")
                periodo_label = periodo.label()

                # Redirige la salida estándar (stdout/stderr) a un buffer
                # para capturar los logs generados por ChurnRateAnalyzer.run()
                capture = io.StringIO()
                old_out = sys.stdout
                old_err = sys.stderr
                sys.stdout = capture
                sys.stderr = capture
                try:
                    analyzer = ChurnRateAnalyzer(DBConnector(), periodo)
                    analyzer.run()
                except Exception as e:
                    messages.error(request, f"Error en análisis: {e}")
                finally:
                    result_output = capture.getvalue()
                    sys.stdout = old_out
                    sys.stderr = old_err

                summaries = _fetch_summary_for_period(periodo_label)

                if not summaries:
                    messages.warning(
                        request,
                        "Análisis ejecutado pero no se encontraron métricas en la BD.",
                    )
            except ValueError as e:
                messages.error(request, str(e))

    results_df = _fetch_recent_results()

    return render(request, "analyzer/dashboard.html", {
        "form": form,
        "periodo_label": periodo_label,
        "summaries": summaries,
        "results": results_df,
    })


def import_subscriptions(request):
    """
    Vista para importar un archivo CSV de suscripciones.

    El archivo se guarda temporalmente en disco, se procesa mediante
    import_subscriptions_csv() (que realiza limpieza y normalización),
    y se redirige al dashboard. En caso de error, se muestra un mensaje
    flash con la descripción.

    Args:
        request (HttpRequest): Solicitud HTTP (GET o POST).

    Returns:
        HttpResponse: Página de carga (GET) o redirección al dashboard (POST).
    """
    if request.method == "POST":
        form = CSVUploadForm(request.POST, request.FILES)
        if form.is_valid():
            csv_file = request.FILES["csv_file"]
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
                    for chunk in csv_file.chunks():
                        tmp.write(chunk)
                    tmp_path = tmp.name
                rows = import_subscriptions_csv(tmp_path)
                messages.success(
                    request, f"Subscripciones: {rows} filas importadas y limpiadas."
                )
                return redirect("dashboard")
            except Exception as e:
                messages.error(request, f"Error importando Subscripciones: {e}")
            finally:
                if tmp_path:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
    else:
        form = CSVUploadForm()

    return render(request, "analyzer/import_csv.html", {
        "form": form,
        "import_type": "Subscripciones",
    })


def import_logs(request):
    """
    Vista para importar un archivo CSV de logs de llamadas.

    Similar a import_subscriptions, pero procesa el archivo mediante
    import_logs_csv(). No realiza limpieza de datos duplicados, solo
    carga los registros tal cual.

    Args:
        request (HttpRequest): Solicitud HTTP (GET o POST).

    Returns:
        HttpResponse: Página de carga (GET) o redirección al dashboard (POST).
    """
    if request.method == "POST":
        form = CSVUploadForm(request.POST, request.FILES)
        if form.is_valid():
            csv_file = request.FILES["csv_file"]
            tmp_path = None
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
                    for chunk in csv_file.chunks():
                        tmp.write(chunk)
                    tmp_path = tmp.name
                rows = import_logs_csv(tmp_path)
                messages.success(
                    request, f"Logs: {rows} filas importadas."
                )
                return redirect("dashboard")
            except Exception as e:
                messages.error(request, f"Error importando Logs: {e}")
            finally:
                if tmp_path:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
    else:
        form = CSVUploadForm()

    return render(request, "analyzer/import_csv.html", {
        "form": form,
        "import_type": "Logs",
    })


def results_list(request):
    """
    Vista que muestra el listado completo de todos los períodos analizados.

    Obtiene todos los registros de la tabla 'cierre_churn_historico'
    ordenados del más reciente al más antiguo.

    Args:
        request (HttpRequest): Solicitud HTTP.

    Returns:
        HttpResponse: Página con la tabla histórica completa.
    """
    rows = _fetch_all_results()
    return render(request, "analyzer/results_list.html", {"periods": rows})


def results_detail(request, periodo):
    """
    Vista de detalle para un período de análisis específico.

    Consulta dos tablas:
        - cierre_churn_historico : métricas resumidas del período.
        - master_churn_dimensiones : desglose por dimensiones (plan,
          zona, etc.) para ese mismo período.

    Si una tabla no existe o está vacía, se omite silenciosamente.

    Args:
        request (HttpRequest): Solicitud HTTP.
        periodo (str): Identificador del período (ej. "2025-01").

    Returns:
        HttpResponse: Página con el detalle del período.
    """
    db = DBConnector()
    summaries = []
    dimensions = []

    try:
        df_summary = db.read_table("cierre_churn_historico")
        if not df_summary.empty:
            df_summary = df_summary[df_summary["periodo_reporte"] == periodo]
            summaries = df_summary.to_dict("records")
    except Exception:
        pass

    try:
        df_dim = db.read_table("master_churn_dimensiones")
        if not df_dim.empty:
            df_dim = df_dim[df_dim["periodo_reporte"] == periodo]
            dimensions = df_dim.to_dict("records")
    except Exception:
        pass

    return render(request, "analyzer/results_detail.html", {
        "periodo": periodo,
        "summaries": summaries,
        "dimensions": dimensions,
    })


def _fetch_recent_results():
    """
    Consulta los últimos 10 períodos analizados (función auxiliar).

    Returns:
        list[dict]: Lista de diccionarios con los registros más recientes
                    de la tabla 'cierre_churn_historico', o lista vacía
                    si hay error o no hay datos.
    """
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        df = df.sort_values("periodo_reporte", ascending=False)
        return df.head(10).to_dict("records")
    except Exception:
        return []


def _fetch_all_results():
    """
    Consulta todos los períodos analizados (función auxiliar).

    Returns:
        list[dict]: Lista completa de diccionarios con todos los registros
                    de la tabla 'cierre_churn_historico', ordenados del
                    más reciente al más antiguo.
    """
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        df = df.sort_values("periodo_reporte", ascending=False)
        return df.to_dict("records")
    except Exception:
        return []


def _fetch_summary_for_period(periodo_label):
    """
    Consulta las métricas resumidas de un período específico (función auxiliar).

    Args:
        periodo_label (str): Etiqueta del período (ej. "2025-01").

    Returns:
        list[dict]: Registros de 'cierre_churn_historico' filtrados por
                    período, o lista vacía si no hay datos o hay error.
    """
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        df = df[df["periodo_reporte"] == periodo_label]
        return df.to_dict("records")
    except Exception:
        return []
