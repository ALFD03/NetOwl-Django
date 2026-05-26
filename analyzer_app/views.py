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
    rows = _fetch_all_results()
    return render(request, "analyzer/results_list.html", {"periods": rows})


def results_detail(request, periodo):
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
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        df = df[df["periodo_reporte"] == periodo_label]
        return df.to_dict("records")
    except Exception:
        return []
