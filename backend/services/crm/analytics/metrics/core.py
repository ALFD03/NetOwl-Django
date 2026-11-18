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
from .timing import compute_close_times, compute_time_by_stage


def compute_crm_metrics_for_period(
    df_created: pd.DataFrame,
    df_won: pd.DataFrame,
    df_lost: pd.DataFrame,
    df_pending: pd.DataFrame,
    df_logs_e8: pd.DataFrame,
    df_logs_all: pd.DataFrame,
    df_clients: pd.DataFrame,
    df_logs_hist: pd.DataFrame | None = None,
    df_close_losses: pd.DataFrame | None = None,
    df_stays: pd.DataFrame | None = None,
    now: pd.Timestamp | None = None,
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
    total_opportunities = len(df_created)
    total_won = len(df_won)
    total_lost = len(df_lost)
    total_pending = len(df_pending)

    # Tasas Principales
    if total_opportunities > 0:
        install_pct = round((total_won / total_opportunities) * 100, 2)
        lost_pct = round((total_lost / total_opportunities) * 100, 2)
        pending_pct = round((total_pending / total_opportunities) * 100, 2)
    else:
        install_pct = lost_pct = pending_pct = 0.0

    # Riesgo de caer a la etapa 8 en el periodo: transiciones del mes sobre todo
    # lo que estuvo vivo, sin los motivos ajenos a la gestión.
    population = df_at_risk if df_at_risk is not None else df_created
    prob_e8 = compute_stage8_probability(population, df_logs_e8, df_clients)

    # Tiempos estadísticos
    times = compute_close_times(df_won, df_lost)
    stats_inst = times["instalacion"]
    stats_lost = times["perdida"]
    close_stats = times["cierre"]

    # Tiempo por etapa
    time_by_stage = compute_time_by_stage(df_logs_all, df_stays, now)

    # Efectividad
    effectiveness = compute_effectiveness(df_logs_all, df_logs_hist, df_clients, df_close_losses)

    # Distribuciones
    lost_dist = compute_lost_distribution(df_lost)
    dist_e8 = compute_stage8_distribution(df_logs_e8, df_clients)

    metrics = {
        "total_oportunidades": total_opportunities,
        "ganados": total_won,
        "perdidos": total_lost,
        "pendientes": total_pending,
        "pct_instalacion": install_pct,
        "pct_perdida": lost_pct,
        "pct_pendientes": pending_pct,
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
        "horas_promedio_perd": stats_lost["promedio"],
        "horas_mediana_perd": stats_lost["mediana"],
        "horas_p25_perd": stats_lost["p25"],
        "horas_p75_perd": stats_lost["p75"],
        "horas_min_perd": stats_lost["min"],
        "horas_max_perd": stats_lost["max"],
        "horas_std_perd": stats_lost["std"],
        "pct_excede_prom_perd": stats_lost["pct_excede_promedio"],

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
        "tiempo_por_etapa": time_by_stage,
        "efectividad": effectiveness,
        "distribucion_perdidos": lost_dist,
        "distribucion_e8": dist_e8,
    }

    return clean_json_props(metrics)


# Las metricas del cierre que promedia el dashboard. Las primeras diez salen con
# el sufijo `_average`; los tiempos conservan su nombre.
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


def average_closes(closes: list[dict[str, Any]]) -> dict[str, float]:
    """El resumen del dashboard: la media simple de los cierres dados.

    La usa el analisis sobre todos los periodos y la lectura del dashboard de
    quien solo ve el ultimo (`services/config/periods.py`), sobre ese uno. Los
    cierres leidos de la base traen todo en `text`, de ahi el `to_numeric`.
    """
    df = pd.DataFrame(closes)

    def media(field: str) -> float:
        return round(float(pd.to_numeric(df[field], errors="coerce").mean()), 2)

    return {
        **{f"{field}_promedio": media(field) for field in _AVERAGED_WITH_SUFFIX},
        **{field: media(field) for field in _AVERAGED_TIMES},
    }
