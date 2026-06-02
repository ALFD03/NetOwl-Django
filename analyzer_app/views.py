"""
Vistas (controladores) de la aplicación analyzer_app.

Cada función recibe un objeto HttpRequest y devuelve una HttpResponse,
generalmente renderizando un template HTML. Cubre cinco funcionalidades
principales:

    1. Dashboard: formulario de selección de mes, ejecución del análisis
       de churn y visualización de resultados recientes.
    2. Importación de CSVs: suscripciones y logs de llamadas.
    3. Listado histórico de resultados.
    4. Detalle de un período específico (resumen + dimensiones).
    5. Analytics: vista analítica avanzada con KPIs y desgloses dimensional.

Dependencias:
    - django.contrib.messages (notificaciones flash al usuario)
    - pandas (lectura de tablas desde DB)
    - Backend: ChurnRateAnalyzer, DBConnector, import_*, Periodo
    - Formularios: CSVUploadForm, MonthForm
"""

import io
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta

import pandas as pd
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import redirect, render

from .backend.analyzer import ChurnRateAnalyzer
from .backend.database import DBConnector
from .backend.imports import import_logs_csv, import_subscriptions_csv
from .backend.models import Periodo
from .forms import CSVUploadForm, MonthForm


def dashboard(request, periodo=None):
    """
    Vista principal que sirve el contenedor SPA (Shell).
    El router de JS lee la ruta de la URL y activa la pestaña correcta.
    """
    return render(request, "analyzer/dashboard.html")


def _format_result_row(row):
    """Formatea una fila de resultado de cierre_churn_historico para serialización JSON."""
    return {
        "periodo": row.get("periodo_reporte") or row.get("periodo"),
        "metodo": row.get("metodo"),
        "activos_inicio": int(row.get("activos_inicio") or 0),
        "activos_final": int(row.get("activos_final") or 0),
        "nuevos_mes": int(row.get("nuevos_mes") or 0),
        "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
        "arpu": float(row.get("arpu") or 0),
    }


def api_dashboard_data(request):
    """Retorna los datos principales del dashboard ejecutivo como JSON."""
    db = DBConnector()
    results = _fetch_recent_results()
    formatted_results = [_format_result_row(r) for r in results]
    # Permite filtrar por periodo (query param 'period') para la comparativa
    requested_period = request.GET.get('period')

    # Obtener comparación para el período solicitado o último período disponible
    comparison = {}
    latest_period = None
    if formatted_results:
        latest_period = formatted_results[0]["periodo"]
    if requested_period:
        latest_period = requested_period
        try:
            df = db.read_table("cierre_churn_historico")
            if not df.empty:
                df_p = df[df["periodo_reporte"] == latest_period]
                for _, row in df_p.iterrows():
                    met = row["metodo"].lower()  # 'operativo' o 'financiero'
                    comparison[met] = {
                        "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
                        "total_billing": float(row.get("total_billing") or 0),
                        "arpu": float(row.get("arpu") or 0)
                    }
        except Exception:
            pass

    # Obtener tendencia de nuevos (últimos 6 meses)
    nuevos_trend = {"labels": [], "values": []}
    try:
        df = db.read_table("cierre_churn_historico")
        if not df.empty:
            df_m = df[df["metodo"] == "Financiero"]
            df_m = df_m.sort_values("periodo_reporte", ascending=False).head(6)
            df_m = df_m.sort_values("periodo_reporte", ascending=True)
            nuevos_trend["labels"] = list(df_m["periodo_reporte"])
            nuevos_trend["values"] = [int(val) for val in df_m["nuevos_mes"]]
    except Exception:
        pass

    return JsonResponse({
        "results": formatted_results,
        "latest_period": latest_period,
        "method_comparison": comparison,
        "nuevos_trend": nuevos_trend
    })


def api_periods_list(request):
    """Retorna la lista de periodos disponibles (valores distintos de periodo_reporte)."""
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return JsonResponse({"periods": []})
        periods = sorted(df["periodo_reporte"].unique().tolist(), reverse=True)
        return JsonResponse({"periods": periods})
    except Exception:
        return JsonResponse({"periods": []})


def api_run_analysis(request):
    """Ejecuta el análisis de churn de forma asíncrona y captura los logs en tiempo real."""
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Método no permitido"}, status=405)
    
    try:
        data = json.loads(request.body)
        mes = data.get("month")
    except Exception:
        return JsonResponse({"status": "error", "message": "Datos JSON inválidos"}, status=400)
        
    if not mes or len(mes) != 7:
        return JsonResponse({"status": "error", "message": "Período inválido. Debe tener formato YYYY-MM"}, status=400)
        
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
            sys.stdout = old_out
            sys.stderr = old_err
            return JsonResponse({"status": "error", "message": f"Error ejecutando análisis: {str(e)}"}, status=500)
        finally:
            result_output = capture.getvalue()
            sys.stdout = old_out
            sys.stderr = old_err

        summaries = _fetch_summary_for_period(periodo_label)
        formatted_summaries = [_format_result_row(s) for s in summaries]

        return JsonResponse({
            "status": "success",
            "periodo_label": periodo_label,
            "log_output": result_output,
            "summaries": formatted_summaries
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def api_analytics_data(request):
    """Retorna los datos de análisis avanzado, KPIs y dimensiones como JSON."""
    # Soporta filtrado por varios periodos (query param 'periods' con formato CSV)
    periods_param = request.GET.get('periods')
    db = DBConnector()

    if periods_param:
        periods_list = [p.strip() for p in periods_param.split(',') if p.strip()]
        # Calcular KPIs agregados sobre los periodos seleccionados
        try:
            df = db.read_table("cierre_churn_historico")
            if df.empty:
                kpis = _get_empty_kpis()
            else:
                df_f = df[df["periodo_reporte"].isin(periods_list)]
                if df_f.empty:
                    kpis = _get_empty_kpis()
                else:
                    churn_avg = float(df_f["churn_neto_pct"].mean())
                    arpu_avg = float(df_f["arpu"].mean())
                    winback_avg = float(df_f["tasa_winback_pct"].mean())
                    adiciones_sum = float(df_f["adiciones_netas"].sum()) if "adiciones_netas" in df_f.columns else 0.0
                    kpis = {
                        "churn_neto": {"valor": churn_avg, "tendencia": 0, "formato": "porcentaje"},
                        "arpu": {"valor": arpu_avg, "tendencia": 0, "formato": "moneda"},
                        "winback": {"valor": winback_avg, "tendencia": 0, "formato": "porcentaje"},
                        "adiciones_netas": {"valor": adiciones_sum, "tendencia": 0, "formato": "numero"}
                    }
        except Exception:
            kpis = _get_empty_kpis()
    else:
        kpis = _fetch_main_kpis()
    # Sanitizar KPIs para evitar errores de tipo en la conversión a JSON
    for k in kpis:
        if kpis[k]["valor"] is not None:
            kpis[k]["valor"] = float(kpis[k]["valor"])
        if kpis[k]["tendencia"] is not None:
            kpis[k]["tendencia"] = float(kpis[k]["tendencia"])

    # La tabla y las gráficas se mantienen sin filtrar según requerimiento del usuario
    table_data = _fetch_analytics_table_data()
    formatted_table_data = []
    for row in table_data:
        formatted_table_data.append({
            "periodo": row.get("periodo"),
            "metodo": row.get("metodo"),
            "activos_inicio": int(row.get("activos_inicio") or 0),
            "activos_final": int(row.get("activos_final") or 0),
            "nuevos": int(row.get("nuevos") or 0),
            "churn_neto": float(row.get("churn_neto") or 0),
            "arpu": float(row.get("arpu") or 0),
            "winback": float(row.get("winback") or 0)
        })

    # Las dimensiones pueden venir filtradas por periodo cuando se pasa 'periods'
    formatted_dimensions = {}
    if periods_param:
        try:
            df_dim = db.read_table("master_churn_dimensiones")
            if not df_dim.empty:
                df_dim = df_dim[df_dim["periodo_reporte"].isin(periods_list)]
                for _, row in df_dim.iterrows():
                    tipo = row.get("tipo_dimension") or row.get("dimension")
                    if tipo not in formatted_dimensions:
                        formatted_dimensions[tipo] = []
                    formatted_dimensions[tipo].append({
                        "valor": row.get("valor_dimension") or row.get("valor"),
                        "activos": int(row.get("activos_final") or row.get("activos") or 0),
                        "churn": float(row.get("churn_neto_pct") or row.get("churn") or 0),
                        "arpu": float(row.get("arpu") or 0)
                    })
        except Exception:
            pass
    else:
        dimensions_raw = _fetch_dimensions_data()
        for dim_name, items in dimensions_raw.items():
            formatted_dimensions[dim_name] = []
            for item in items:
                formatted_dimensions[dim_name].append({
                    "valor": item.get("valor"),
                    "activos": int(item.get("activos") or 0),
                    "churn": float(item.get("churn") or 0),
                    "arpu": float(item.get("arpu") or 0)
                })

    trend_data = _fetch_trend_data()
    formatted_trend = {
        "labels": trend_data.get("labels", []),
        "churn_neto": []
    }
    for dataset in trend_data.get("churn_neto", []):
        formatted_trend["churn_neto"].append({
            "label": dataset.get("label"),
            "data": [float(v) for v in dataset.get("data", [])]
        })

    return JsonResponse({
        "kpis": kpis,
        "table_data": formatted_table_data,
        "dimensions_data": formatted_dimensions,
        "trend_data": formatted_trend
    })


def api_results_list(request):
    """Retorna la lista de todos los resultados históricos como JSON."""
    rows = _fetch_all_results()
    formatted = [_format_result_row(r) for r in rows]
    return JsonResponse({"periods": formatted})


def api_results_detail(request, periodo):
    """Retorna el detalle (resumen y desgloses dimensionales) de un período como JSON."""
    db = DBConnector()
    summaries = []
    dimensions = []

    try:
        df_summary = db.read_table("cierre_churn_historico")
        if not df_summary.empty:
            df_summary = df_summary[df_summary["periodo_reporte"] == periodo]
            for _, row in df_summary.iterrows():
                row_dict = row.to_dict()
                summaries.append({
                    "periodo": row_dict.get("periodo_reporte"),
                    "metodo": row_dict.get("metodo"),
                    "activos_inicio": int(row_dict.get("activos_inicio") or 0),
                    "activos_final": int(row_dict.get("activos_final") or 0),
                    "nuevos_mes": int(row_dict.get("nuevos_mes") or 0),
                    "churn_neto_pct": float(row_dict.get("churn_neto_pct") or 0),
                    "churn_bruto_pct": float(row_dict.get("churn_bruto_pct") or 0),
                    "arpu": float(row_dict.get("arpu") or 0),
                    "reactivaciones": int(row_dict.get("reactivaciones") or 0),
                    "corte_impagado": int(row_dict.get("corte_impagado") or 0),
                    "total_inactivos": int(row_dict.get("total_inactivos") or 0),
                    "tasa_winback_pct": float(row_dict.get("tasa_winback_pct") or 0),
                    "total_billing": float(row_dict.get("total_billing") or 0)
                })
    except Exception:
        pass

    try:
        df_dim = db.read_table("master_churn_dimensiones")
        if not df_dim.empty:
            df_dim = df_dim[df_dim["periodo_reporte"] == periodo]
            for _, row in df_dim.iterrows():
                row_dict = row.to_dict()
                # Aceptar nombres de columnas alternativos según la persistencia
                dimensions.append({
                    "dimension": row_dict.get("dimension"),
                    "valor": row_dict.get("valor"),
                    "activos": int(row_dict.get("activos_final") or row_dict.get("activos") or 0),
                    "churn": float(row_dict.get("churn_neto_pct") or row_dict.get("churn") or 0),
                    "arpu": float(row_dict.get("arpu") or 0)
                })
    except Exception:
        pass

    return JsonResponse({
        "periodo": periodo,
        "summaries": summaries,
        "dimensions": dimensions
    })


def api_import_subscriptions(request):
    """Endpoint API para importar suscripciones por CSV."""
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Método no permitido"}, status=405)
    
    if "csv_file" not in request.FILES:
        return JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
        
    csv_file = request.FILES["csv_file"]
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            for chunk in csv_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        rows = import_subscriptions_csv(tmp_path)
        return JsonResponse({
            "status": "success",
            "message": f"Subscripciones: {rows} filas importadas y limpiadas con éxito."
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": f"Error importando Subscripciones: {str(e)}"}, status=500)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def api_import_logs(request):
    """Endpoint API para importar logs de llamadas por CSV."""
    if request.method != "POST":
        return JsonResponse({"status": "error", "message": "Método no permitido"}, status=405)
        
    if "csv_file" not in request.FILES:
        return JsonResponse({"status": "error", "message": "Archivo no enviado"}, status=400)
        
    csv_file = request.FILES["csv_file"]
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            for chunk in csv_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        rows = import_logs_csv(tmp_path)
        return JsonResponse({
            "status": "success",
            "message": f"Logs: {rows} filas importadas con éxito."
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": f"Error importando Logs: {str(e)}"}, status=500)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


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


def _fetch_main_kpis():
    """
    Obtiene los KPIs principales para la vista de analytics.
    
    Returns:
        dict: Diccionario con los KPIs principales y sus indicadores de tendencia.
    """
    db = DBConnector()
    try:
        # Obtener el último período disponible
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return _get_empty_kpis()
            
        # Obtener el período más reciente
        latest_period = df["periodo_reporte"].max()
        latest_data = df[df["periodo_reporte"] == latest_period].iloc[0]
        
        # Obtener datos del período anterior para calcular tendencia
        periods_sorted = df["periodo_reporte"].unique()
        periods_sorted.sort()
        if len(periods_sorted) >= 2:
            prev_period = periods_sorted[-2]
            prev_data = df[df["periodo_reporte"] == prev_period].iloc[0]
        else:
            prev_data = latest_data
            
        # Calcular tendencias
        def calculate_trend(current, previous):
            if previous == 0:
                return 0
            return ((current - previous) / previous) * 100
            
        return {
            "churn_neto": {
                "valor": latest_data["churn_neto_pct"],
                "tendencia": calculate_trend(latest_data["churn_neto_pct"], prev_data["churn_neto_pct"]),
                "formato": "porcentaje"
            },
            "arpu": {
                "valor": latest_data["arpu"],
                "tendencia": calculate_trend(latest_data["arpu"], prev_data["arpu"]),
                "formato": "moneda"
            },
            "winback": {
                "valor": latest_data["tasa_winback_pct"],
                "tendencia": calculate_trend(latest_data["tasa_winback_pct"], prev_data["tasa_winback_pct"]),
                "formato": "porcentaje"
            },
            "adiciones_netas": {
                "valor": latest_data["adiciones_netas"],
                "tendencia": calculate_trend(latest_data["adiciones_netas"], prev_data["adiciones_netas"]),
                "formato": "numero"
            }
        }
    except Exception as e:
        return _get_empty_kpis()


def _get_empty_kpis():
    """Retorna KPIs vacíos cuando no hay datos disponibles."""
    return {
        "churn_neto": {"valor": 0, "tendencia": 0, "formato": "porcentaje"},
        "arpu": {"valor": 0, "tendencia": 0, "formato": "moneda"},
        "winback": {"valor": 0, "tendencia": 0, "formato": "porcentaje"},
        "adiciones_netas": {"valor": 0, "tendencia": 0, "formato": "numero"}
    }


def _fetch_analytics_table_data():
    """
    Obtiene los datos para la tabla principal de analytics.
    
    Returns:
        list[dict]: Lista de registros para mostrar en la tabla.
    """
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
            
        # Obtener los últimos 12 meses
        df = df.sort_values("periodo_reporte", ascending=False).head(12)
        
        # Convertir a formato adecuado para la tabla
        records = []
        for _, row in df.iterrows():
            records.append({
                "periodo": row["periodo_reporte"],
                "metodo": row["metodo"],
                "activos_inicio": row["activos_inicio"],
                "activos_final": row["activos_final"],
                "nuevos": row["nuevos_mes"],
                "churn_neto": row["churn_neto_pct"],
                "arpu": row["arpu"],
                "winback": row["tasa_winback_pct"]
            })
            
        return records
    except Exception:
        return []


def _fetch_dimensions_data():
    """
    Obtiene los datos de desglose por dimensiones.
    
    Returns:
        dict: Diccionario con datos por cada dimensión.
    """
    db = DBConnector()
    dimensions = {}
    
    try:
        # Intentar obtener datos de la tabla de dimensiones
        df_dim = db.read_table("master_churn_dimensiones")
        if not df_dim.empty:
            # Obtener el último período
            latest_period = df_dim["periodo_reporte"].max()
            df_dim = df_dim[df_dim["periodo_reporte"] == latest_period]
            
            # Agrupar por tipo de dimensión
            for dimension_type in df_dim["tipo_dimension"].unique():
                dim_data = df_dim[df_dim["tipo_dimension"] == dimension_type]
                dimensions[dimension_type] = []
                
                for _, row in dim_data.iterrows():
                    dimensions[dimension_type].append({
                        "valor": row["valor_dimension"],
                        "activos": row["activos"],
                        "churn": row["churn_pct"],
                        "arpu": row["arpu"]
                    })
                    
            # Ordenar cada dimensión por churn descendente
            for dim_type in dimensions:
                dimensions[dim_type].sort(key=lambda x: x["churn"], reverse=True)
    except Exception:
        # Si falla, devolver estructura vacía
        pass
        
    # Asegurar que tengamos las dimensiones esperadas
    expected_dimensions = ["zona", "sucursal", "municipio", "campana", "producto"]
    for dim in expected_dimensions:
        if dim not in dimensions:
            dimensions[dim] = []
            
    return dimensions


def _fetch_trend_data():
    """
    Obtiene datos de tendencia para gráficos.
    
    Returns:
        dict: Diccionario con datos de tendencia para diversos métricas.
    """
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return _get_empty_trend_data()
            
        # Obtener los últimos 6 meses
        df = df.sort_values("periodo_reporte", ascending=False).head(6)
        df = df.sort_values("periodo_reporte", ascending=True)  # Orden cronológico
        
        # Preparar datos para gráfico de líneas
        labels = [row["periodo_reporte"] for _, row in df.iterrows()]
        
        # Datos de churn neto por método
        churn_neto_data = []
        for metodo in df["metodo"].unique():
            metodo_data = df[df["metodo"] == metodo]
            valores = [row["churn_neto_pct"] for _, row in metodo_data.iterrows()]
            churn_neto_data.append({
                "label": metodo,
                "data": valores
            })
            
        return {
            "labels": labels,
            "churn_neto": churn_neto_data
        }
    except Exception:
        return _get_empty_trend_data()


def _get_empty_trend_data():
    """Retorna datos de tendencia vacíos."""
    return {
        "labels": [],
        "churn_neto": []
    }