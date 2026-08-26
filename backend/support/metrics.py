# NetOwl-Django/backend/support/metrics.py

from __future__ import annotations
import math
import pandas as pd
from typing import Any, Dict

def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return 0.0
    elif isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj


def _compute_stats_for_series(series: pd.Series) -> Dict[str, float]:
    """
    Estadísticos de una serie de duraciones en horas.

    Solo entran duraciones estrictamente positivas: un 0 significa "no se pudo
    medir" (fecha ausente o ilegible), no "se cerró al instante". Contarlos
    hundía el promedio y la mediana e inflaba el % que excede el promedio.

    `muestra` expone cuántos tickets sí se pudieron medir, para poder juzgar la
    cobertura del cálculo desde la interfaz.
    """
    s = pd.to_numeric(series, errors="coerce").dropna()
    s = s[s > 0]
    n = len(s)

    if n == 0:
        return {
            "promedio": 0.0, "mediana": 0.0, "min": 0.0, "p25": 0.0, "p75": 0.0, "max": 0.0,
            "std": 0.0, "pct_excede_promedio": 0.0, "pct_excede_mediana": 0.0, "muestra": 0,
        }

    promedio = float(s.mean())
    mediana = float(s.median())
    std_val = float(s.std(ddof=0)) if n > 1 else 0.0

    return {
        "promedio": round(promedio, 2),
        "mediana": round(mediana, 2),
        "min": round(float(s.min()), 2),
        "p25": round(float(s.quantile(0.25)), 2),
        "p75": round(float(s.quantile(0.75)), 2),
        "max": round(float(s.max()), 2),
        "std": round(std_val, 2),
        "pct_excede_promedio": round(float((s > promedio).sum() / n) * 100, 2),
        "pct_excede_mediana": round(float((s > mediana).sum() / n) * 100, 2),
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


def _prefixed(stats: Dict[str, float], medida: str) -> Dict[str, Any]:
    """Aplana un bloque de estadísticos a las claves planas que guarda la BD."""
    return {
        f"tiempo_medio_{medida}_horas": stats["promedio"],
        f"tiempo_mediana_{medida}_horas": stats["mediana"],
        f"tiempo_min_{medida}_horas": stats["min"],
        f"tiempo_p25_{medida}_horas": stats["p25"],
        f"tiempo_p75_{medida}_horas": stats["p75"],
        f"tiempo_max_{medida}_horas": stats["max"],
        f"tiempo_std_{medida}_horas": stats["std"],
        f"pct_excede_promedio_{medida}": stats["pct_excede_promedio"],
        f"pct_excede_mediana_{medida}": stats["pct_excede_mediana"],
        f"muestra_{medida}": stats["muestra"],
    }


def compute_metrics_for_period(
    df_creados: pd.DataFrame,
    df_resueltos: pd.DataFrame,
    df_cancelados: pd.DataFrame,
    df_rezagados: pd.DataFrame
) -> Dict[str, Any]:
    """
    Métricas de un periodo sobre la cohorte de tickets *creados* en él.

    Los cuatro dataframes son particiones de la misma cohorte: resueltos,
    cancelados y rezagados suman exactamente los creados, así que los tres
    porcentajes se reparten el 100% sobre `total_tickets`.

    El tiempo de cierre se mide dos veces sobre los mismos tickets resueltos:

      * `cierre`       = cierre − primera asignación → gestión del técnico.
      * `cierre_total` = cierre − creación           → proceso completo, cola incluida.

    Antes las dos se mezclaban en una sola serie (asignación si existía, creación
    si no), lo que hacía incomparables los tickets entre sí. Separarlas permite
    leer la espera en cola como la diferencia entre ambas.
    """
    total_creados = len(df_creados)
    total_resueltos = len(df_resueltos)
    total_cancelados = len(df_cancelados)
    total_rezagados = len(df_rezagados)

    universo = total_creados if total_creados > 0 else 1

    metrics: Dict[str, Any] = {
        "total_tickets": total_creados,
        "tickets_resueltos": total_resueltos,
        "tickets_cancelados": total_cancelados,
        "tickets_rezagados": total_rezagados,
        "pct_resueltos": round((total_resueltos / universo) * 100, 2),
        "pct_cancelados": round((total_cancelados / universo) * 100, 2),
        "pct_rezagados": round((total_rezagados / universo) * 100, 2),
    }

    # 1. Cierre desde la primera asignación: solo tickets efectivamente asignados.
    metrics.update(_prefixed(
        _compute_stats_for_series(
            _hours_between(df_resueltos, "primera_fecha_asignada", "ultima_actualizacion_etapa")
        ),
        "cierre",
    ))

    # 2. Cierre desde la creación: el proceso completo, incluida la espera en cola.
    metrics.update(_prefixed(
        _compute_stats_for_series(
            _hours_between(df_resueltos, "creado_el", "ultima_actualizacion_etapa")
        ),
        "cierre_total",
    ))

    # 3. Primera respuesta = primera asignación − creación, sobre todo lo creado.
    #    Sin la antigua sustitución por `ultima_actualizacion_etapa`, que convertía
    #    el cierre de un ticket nunca asignado en una "respuesta" de cientos de horas.
    metrics.update(_prefixed(
        _compute_stats_for_series(
            _hours_between(df_creados, "creado_el", "primera_fecha_asignada")
        ),
        "primera_respuesta",
    ))

    # Alias heredado: el dashboard y `support_cierre_historico` ya guardaban la
    # primera respuesta bajo este nombre cuando solo existía el promedio.
    metrics["tiempo_promedio_primera_respuesta_horas"] = metrics["tiempo_medio_primera_respuesta_horas"]

    return _clean_nan(metrics)
