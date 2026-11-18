"""Composicion del bloque de metricas de un periodo de CRM.

Junta lo que calculan los tres modulos especializados -efectividad,
probabilidad y tiempo- con los volumenes y las tasas basicas. Es una funcion
pura: la misma sirve para el total del mes y para cada rebanada dimensional.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from core.utils import clean_json_props

from .effectiveness import compute_effectiveness
from .probability import (
    compute_lost_distribution,
    compute_stage8_distribution,
    compute_stage8_probability,
)
from .tiempo import compute_close_times, compute_time_by_stage


def compute_crm_metrics_for_period(
    df_created: pd.DataFrame,
    df_ganados: pd.DataFrame,
    df_perdidos: pd.DataFrame,
    df_pending: pd.DataFrame,
    df_logs_e8: pd.DataFrame,
    df_logs_all: pd.DataFrame,
    df_clients: pd.DataFrame,
    df_logs_hist: pd.DataFrame | None = None,
    df_close_losses: pd.DataFrame | None = None,
    df_stays: pd.DataFrame | None = None,
    ahora: pd.Timestamp | None = None,
    df_at_risk: pd.DataFrame | None = None,
) -> dict[str, Any]:
    """Métricas de un periodo.

    `df_logs_all` son los movimientos del periodo y `df_logs_hist` los mismos
    clientes con todo su historial, necesario para saber cómo terminaron las
    salidas que se resuelven en un periodo posterior.

    `df_close_losses` son las oportunidades perdidas con cierre en el
    periodo. La pérdida no existe en el log —sólo como estado del cliente— así
    que la efectividad la recibe aparte para poder atribuirla.

    `df_stays` son las estancias que todavía no han producido una salida,
    medidas contra la fecha de cierre o contra `ahora`. Sin ellas el tiempo por
    etapa sólo ve lo que ya salió, que es el sesgo que las hace necesarias.

    `df_at_risk` son las oportunidades con vida en el periodo: las creadas en
    él más las arrastradas de meses anteriores que seguían abiertas. Es el
    denominador del riesgo de devolución, que no es una tasa de cohorte sino de
    lo que el embudo tenía entre manos ese mes. Sin él se cae a `df_created`,
    que es la cohorte y da otra cosa.
    """
    total_oportunidades = len(df_created)
    total_ganados = len(df_ganados)
    total_perdidos = len(df_perdidos)
    total_pending = len(df_pending)

    # Tasas Principales
    if total_oportunidades > 0:
        pct_instalacion = round((total_ganados / total_oportunidades) * 100, 2)
        pct_perdida = round((total_perdidos / total_oportunidades) * 100, 2)
        pct_pendientes = round((total_pending / total_oportunidades) * 100, 2)
    else:
        pct_instalacion = pct_perdida = pct_pendientes = 0.0

    # Riesgo de caer a la etapa 8 en el periodo: transiciones del mes sobre todo
    # lo que estuvo vivo, sin los motivos ajenos a la gestión.
    population = df_at_risk if df_at_risk is not None else df_created
    prob_e8 = compute_stage8_probability(population, df_logs_e8, df_clients)

    # Tiempos estadísticos
    tiempos = compute_close_times(df_ganados, df_perdidos)
    stats_inst = tiempos["instalacion"]
    stats_perd = tiempos["perdida"]
    close_stats = tiempos["cierre"]

    # Tiempo por etapa
    tiempo_por_etapa = compute_time_by_stage(df_logs_all, df_stays, ahora)

    # Efectividad
    efectividad = compute_effectiveness(df_logs_all, df_logs_hist, df_clients, df_close_losses)

    # Distribuciones
    dist_perdidos = compute_lost_distribution(df_perdidos)
    dist_e8 = compute_stage8_distribution(df_logs_e8, df_clients)

    metrics = {
        "total_oportunidades": total_oportunidades,
        "ganados": total_ganados,
        "perdidos": total_perdidos,
        "pendientes": total_pending,
        "pct_instalacion": pct_instalacion,
        "pct_perdida": pct_perdida,
        "pct_pendientes": pct_pendientes,
        **prob_e8,

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
        "horas_promedio_cierre": close_stats["promedio"],
        "horas_mediana_cierre": close_stats["mediana"],
        "horas_p25_cierre": close_stats["p25"],
        "horas_p75_cierre": close_stats["p75"],
        "horas_min_cierre": close_stats["min"],
        "horas_max_cierre": close_stats["max"],
        "horas_std_cierre": close_stats["std"],
        "pct_excede_prom_cierre": close_stats["pct_excede_promedio"],

        # Detalles
        "tiempo_por_etapa": tiempo_por_etapa,
        "efectividad": efectividad,
        "distribucion_perdidos": dist_perdidos,
        "distribucion_e8": dist_e8,
    }

    return clean_json_props(metrics)


# Las metricas del cierre que promedia el dashboard. Las primeras diez salen con
# el sufijo `_promedio`; los tiempos conservan su nombre.
_AVERAGED_WITH_SUFFIX = (
    "total_oportunidades", "ganados", "perdidos", "pendientes",
    "pct_instalacion", "pct_perdida", "pct_pendientes",
    "count_devueltos_e8", "pct_devueltos_e8", "pct_devueltos_e8_bruto",
)
_AVERAGED_TIMES = (
    "horas_promedio_inst", "horas_mediana_inst", "pct_excede_prom_inst",
    "horas_promedio_perd", "horas_mediana_perd", "pct_excede_prom_perd",
    "horas_promedio_cierre", "horas_mediana_cierre", "pct_excede_prom_cierre",
)


def average_closes(cierres: list[dict[str, Any]]) -> dict[str, float]:
    """El resumen del dashboard: la media simple de los cierres dados.

    La usa el analisis sobre todos los periodos y la lectura del dashboard de
    quien solo ve el ultimo (`services/config/periods.py`), sobre ese uno. Los
    cierres leidos de la base traen todo en `text`, de ahi el `to_numeric`.
    """
    df = pd.DataFrame(cierres)

    def media(campo: str) -> float:
        return round(float(pd.to_numeric(df[campo], errors="coerce").mean()), 2)

    return {
        **{f"{campo}_promedio": media(campo) for campo in _AVERAGED_WITH_SUFFIX},
        **{campo: media(campo) for campo in _AVERAGED_TIMES},
    }
