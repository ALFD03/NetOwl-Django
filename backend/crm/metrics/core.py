from __future__ import annotations
import math
import pandas as pd
from typing import Any, Dict

from .tiempo import compute_tiempos_cierre, compute_tiempo_por_etapa
from .efectividad import compute_efectividad
from .probabilidad import compute_distribucion_perdidos, compute_distribucion_etapa8


def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    elif type(obj).__module__ == 'numpy':
        return obj.item() if hasattr(obj, 'item') else obj
    return obj


def compute_crm_metrics_for_period(
    df_creados: pd.DataFrame,
    df_ganados: pd.DataFrame,
    df_perdidos: pd.DataFrame,
    df_pendientes: pd.DataFrame,
    df_logs_e8: pd.DataFrame,
    df_logs_all: pd.DataFrame,
    df_clients: pd.DataFrame,
    df_logs_hist: pd.DataFrame | None = None,
    df_perdidas_cierre: pd.DataFrame | None = None,
) -> Dict[str, Any]:
    """Métricas de un periodo.

    `df_logs_all` son los movimientos del periodo y `df_logs_hist` los mismos
    clientes con todo su historial, necesario para saber cómo terminaron las
    salidas que se resuelven en un periodo posterior.

    `df_perdidas_cierre` son las oportunidades perdidas con cierre en el
    periodo. La pérdida no existe en el log —sólo como estado del cliente— así
    que la efectividad la recibe aparte para poder atribuirla.
    """
    total_oportunidades = len(df_creados)
    total_ganados = len(df_ganados)
    total_perdidos = len(df_perdidos)
    total_pendientes = len(df_pendientes)

    # Tasas Principales
    if total_oportunidades > 0:
        pct_instalacion = round((total_ganados / total_oportunidades) * 100, 2)
        pct_perdida = round((total_perdidos / total_oportunidades) * 100, 2)
        pct_pendientes = round((total_pendientes / total_oportunidades) * 100, 2)
        count_e8 = len(df_logs_e8)
        pct_devueltos_e8 = round((count_e8 / total_oportunidades) * 100, 2)
    else:
        pct_instalacion = pct_perdida = pct_pendientes = pct_devueltos_e8 = 0.0
        count_e8 = 0

    # Tiempos estadísticos
    tiempos = compute_tiempos_cierre(df_ganados, df_perdidos)
    stats_inst = tiempos["instalacion"]
    stats_perd = tiempos["perdida"]
    stats_cierre = tiempos["cierre"]

    # Tiempo por etapa
    tiempo_por_etapa = compute_tiempo_por_etapa(df_logs_all)

    # Efectividad
    efectividad = compute_efectividad(df_logs_all, df_logs_hist, df_clients, df_perdidas_cierre)

    # Distribuciones
    dist_perdidos = compute_distribucion_perdidos(df_perdidos)
    dist_e8 = compute_distribucion_etapa8(df_logs_e8, df_clients)

    metrics = {
        "total_oportunidades": total_oportunidades,
        "ganados": total_ganados,
        "perdidos": total_perdidos,
        "pendientes": total_pendientes,
        "pct_instalacion": pct_instalacion,
        "pct_perdida": pct_perdida,
        "pct_pendientes": pct_pendientes,
        "count_devueltos_e8": count_e8,
        "pct_devueltos_e8": pct_devueltos_e8,

        # Tiempos de Instalación
        "horas_promedio_inst": stats_inst["promedio"],
        "horas_mediana_inst": stats_inst["mediana"],
        "horas_p25_inst": stats_inst["p25"],
        "horas_p75_inst": stats_inst["p75"],
        "horas_min_inst": stats_inst["min"],
        "horas_max_inst": stats_inst["max"],
        "horas_std_inst": stats_inst["std"],
        "pct_excede_prom_inst": stats_inst["pct_excede_promedio"],

        # Tiempos de Pérdida
        "horas_promedio_perd": stats_perd["promedio"],
        "horas_mediana_perd": stats_perd["mediana"],
        "horas_p25_perd": stats_perd["p25"],
        "horas_p75_perd": stats_perd["p75"],
        "horas_min_perd": stats_perd["min"],
        "horas_max_perd": stats_perd["max"],
        "horas_std_perd": stats_perd["std"],
        "pct_excede_prom_perd": stats_perd["pct_excede_promedio"],

        # Tiempo de Cierre (ganados + perdidos)
        "horas_promedio_cierre": stats_cierre["promedio"],
        "horas_mediana_cierre": stats_cierre["mediana"],
        "horas_p25_cierre": stats_cierre["p25"],
        "horas_p75_cierre": stats_cierre["p75"],
        "horas_min_cierre": stats_cierre["min"],
        "horas_max_cierre": stats_cierre["max"],
        "horas_std_cierre": stats_cierre["std"],
        "pct_excede_prom_cierre": stats_cierre["pct_excede_promedio"],

        # Detalles
        "tiempo_por_etapa": tiempo_por_etapa,
        "efectividad": efectividad,
        "distribucion_perdidos": dist_perdidos,
        "distribucion_e8": dist_e8,
    }

    return _clean_nan(metrics)