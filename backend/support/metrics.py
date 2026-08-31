# backend/support/metrics.py
"""
El bloque de métricas de una cohorte: siete medidas de tiempo y tres tasas.

Todo el módulo es una función pura de un `PeriodCohort` ya clasificado, así que
el mismo código sirve para el total del periodo, para un grupo de trabajo, para
una zona y para el desglose que `queries` calcula al vuelo.
"""

from __future__ import annotations

import math
from typing import Any, Dict

import pandas as pd

from backend.support.cohorts import PeriodCohort
from backend.support.config import (
    MIN_DURACION_HORAS,
    TIME_MEASURE_SPECS,
    TIME_STATS,
)


def clean_nan(obj: Any) -> Any:
    """NaN/Inf a 0 y tipos de numpy a tipos de Python, para poder serializar."""
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nan(v) for v in obj]
    if type(obj).__module__ == "numpy":
        return obj.item() if hasattr(obj, "item") else obj
    return obj


def _compute_stats_for_series(series: pd.Series) -> Dict[str, float]:
    """
    Estadísticos de una serie de duraciones en horas.

    Sólo entran duraciones de al menos `MIN_DURACION_HORAS` (1 minuto). Por
    debajo de ese umbral no hay un tiempo de servicio que medir: son acciones
    masivas de Odoo que asignan y cierran en el mismo segundo, o fechas
    ausentes. Contarlas hunde el promedio y la mediana e infla el % que excede
    el promedio.

    `muestra` expone cuántos tickets sí se pudieron medir, para poder juzgar la
    cobertura del cálculo desde la interfaz.
    """
    s = pd.to_numeric(series, errors="coerce").dropna()
    s = s[s >= MIN_DURACION_HORAS]
    n = len(s)

    if n == 0:
        return {stat: 0.0 for stat in TIME_STATS} | {"pct_excede_promedio": 0.0, "muestra": 0}

    promedio = float(s.mean())

    return {
        "medio": round(promedio, 2),
        "mediana": round(float(s.median()), 2),
        "min": round(float(s.min()), 2),
        "p25": round(float(s.quantile(0.25)), 2),
        "p75": round(float(s.quantile(0.75)), 2),
        "max": round(float(s.max()), 2),
        "std": round(float(s.std(ddof=0)) if n > 1 else 0.0, 2),
        "pct_excede_promedio": round(float((s > promedio).sum() / n) * 100, 2),
        "muestra": n,
    }


def _hours_between(df: pd.DataFrame, col_inicio: str, col_fin: str) -> pd.Series:
    """
    Diferencia en horas entre dos columnas de fecha, sin rellenos.

    Los tickets a los que les falta cualquiera de las dos fechas quedan como NaN
    y `_compute_stats_for_series` los descarta. Nunca se sustituyen por 0 ni se
    recortan a 0: una duración negativa es un error de captura, no un cierre
    instantáneo, y también se descarta.
    """
    if df.empty or col_inicio not in df.columns or col_fin not in df.columns:
        return pd.Series(dtype=float)

    t_inicio = pd.to_datetime(df[col_inicio], errors="coerce")
    t_fin = pd.to_datetime(df[col_fin], errors="coerce")

    return (t_fin - t_inicio).dt.total_seconds() / 3600.0


def _duracion_total(df: pd.DataFrame) -> pd.Series:
    """
    Duración creación → cierre tal y como la reporta Odoo.

    Se lee el campo en vez de restar las dos fechas porque coincide con el
    cálculo y no pierde muestra: la resta deja fuera los tickets sin fecha de
    asignación, este campo los conserva.
    """
    if df.empty or "duracion_total_horas" not in df.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(df["duracion_total_horas"], errors="coerce")


def _serie_de_formula(df: pd.DataFrame, formula: str) -> pd.Series:
    if formula == "duracion_total":
        return _duracion_total(df)
    if formula == "asignado_a_cierre":
        return _hours_between(df, "primera_fecha_asignada", "ultima_actualizacion_etapa")
    if formula == "creado_a_asignacion":
        return _hours_between(df, "creado_el", "primera_fecha_asignada")
    raise ValueError(f"Fórmula de tiempo desconocida: {formula!r}")


def _prefixed(stats: Dict[str, float], medida: str) -> Dict[str, Any]:
    """Aplana un bloque de estadísticos a las claves planas que guarda la BD."""
    plano = {f"tiempo_{stat}_{medida}_horas": stats[stat] for stat in TIME_STATS}
    plano[f"pct_excede_promedio_{medida}"] = stats["pct_excede_promedio"]
    plano[f"muestra_{medida}"] = stats["muestra"]
    return plano


def _pct(parte: int, total: int) -> float:
    return round((parte / total) * 100, 2) if total > 0 else 0.0


def compute_metrics_for_period(cohorte: PeriodCohort) -> Dict[str, Any]:
    """
    El bloque completo de una cohorte: volúmenes, tasas y las siete medidas.

    Cada cifra trae fijado su denominador, y son dos distintos:

      * resolución y cancelación se leen sobre lo CERRADO en el mes —es la
        mezcla de desenlaces del trabajo despachado—, y cada una se abre en el
        que además nació en el mes y el que venía arrastrado. Los dos sumandos
        comparten denominador, así que cierran exactamente con el total.
      * el rezago se lee sobre lo CREADO en el mes: de la demanda que entró,
        cuánta no se cerró dentro del propio mes.
    """
    df = cohorte.df
    total = len(df)

    if total == 0:
        conteos = dict.fromkeys(
            ["creados", "cerrados", "resueltos", "resueltos_periodo", "resueltos_arrastre",
             "cancelados", "cancelados_periodo", "cancelados_arrastre", "rezagados"], 0
        )
    else:
        nacido = df["nacido_en_periodo"]
        cerrado = df["cerrado_en_periodo"]
        resuelto = cerrado & df["es_resuelto"]
        cancelado = cerrado & df["es_cancelado"]

        conteos = {
            "creados": int(nacido.sum()),
            "cerrados": int(cerrado.sum()),
            "resueltos": int(resuelto.sum()),
            "resueltos_periodo": int((resuelto & nacido).sum()),
            "resueltos_arrastre": int((resuelto & ~nacido).sum()),
            "cancelados": int(cancelado.sum()),
            "cancelados_periodo": int((cancelado & nacido).sum()),
            "cancelados_arrastre": int((cancelado & ~nacido).sum()),
            "rezagados": int((nacido & df["es_rezagado"]).sum()),
        }

    cerrados = conteos["cerrados"]
    creados = conteos["creados"]

    metrics: Dict[str, Any] = {
        "total_tickets": total,
        "tickets_creados": creados,
        "tickets_cerrados": cerrados,
        "tickets_resueltos": conteos["resueltos"],
        "tickets_resueltos_periodo": conteos["resueltos_periodo"],
        "tickets_resueltos_arrastre": conteos["resueltos_arrastre"],
        "tickets_cancelados": conteos["cancelados"],
        "tickets_cancelados_periodo": conteos["cancelados_periodo"],
        "tickets_cancelados_arrastre": conteos["cancelados_arrastre"],
        "tickets_rezagados": conteos["rezagados"],

        "pct_resueltos": _pct(conteos["resueltos"], cerrados),
        "pct_resueltos_periodo": _pct(conteos["resueltos_periodo"], cerrados),
        "pct_resueltos_arrastre": _pct(conteos["resueltos_arrastre"], cerrados),
        "pct_cancelados": _pct(conteos["cancelados"], cerrados),
        "pct_cancelados_periodo": _pct(conteos["cancelados_periodo"], cerrados),
        "pct_cancelados_arrastre": _pct(conteos["cancelados_arrastre"], cerrados),
        "pct_rezagados": _pct(conteos["rezagados"], creados),
    }

    for medida, formula, poblacion in TIME_MEASURE_SPECS:
        serie = _serie_de_formula(cohorte.poblacion(poblacion), formula)
        metrics.update(_prefixed(_compute_stats_for_series(serie), medida))

    return clean_nan(metrics)
