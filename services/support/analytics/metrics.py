# backend/support/metrics.py
"""
El bloque de métricas de una cohorte: siete medidas de tiempo y tres tasas.

Todo el módulo es una función pura de un `PeriodCohort` ya clasificado, así que
el mismo código sirve para el total del periodo, para un grupo de trabajo, para
una zona y para el desglose que `queries` calcula al vuelo.
"""

from __future__ import annotations

from typing import Any, Dict

import pandas as pd

from core.utils import clean_json_props
from services.support.analytics.cohorts import PeriodCohort
from services.support.analytics.config import (
    MIN_DURACION_HORAS,
    TIME_MEASURE_SPECS,
    TIME_STATS,
)


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


def _nan_series(df: pd.DataFrame) -> pd.Series:
    """Serie de NaN con el índice del DataFrame, para poder alinearla con él."""
    return pd.Series(float("nan"), index=df.index, dtype=float)


def _hours_between(df: pd.DataFrame, col_inicio: str, col_fin: str) -> pd.Series:
    """
    Diferencia en horas entre dos columnas de fecha, sin rellenos.

    Los tickets a los que les falta cualquiera de las dos fechas quedan como NaN
    y `_compute_stats_for_series` los descarta. Nunca se sustituyen por 0 ni se
    recortan a 0: una duración negativa es un error de captura, no un cierre
    instantáneo, y también se descarta.

    El resultado conserva el índice de `df` incluso cuando falta una columna,
    porque `_tramos_validos` cruza los dos tramos fila a fila.
    """
    if col_inicio not in df.columns or col_fin not in df.columns:
        return _nan_series(df)

    t_inicio = pd.to_datetime(df[col_inicio], errors="coerce")
    t_fin = pd.to_datetime(df[col_fin], errors="coerce")

    return (t_fin - t_inicio).dt.total_seconds() / 3600.0


def _duracion_total(df: pd.DataFrame) -> pd.Series:
    """
    Duración creación → cierre tal y como la reporta Odoo.

    Se lee el campo en vez de restar las dos fechas porque es el dato que Odoo
    da por bueno para el ciclo completo, cola incluida. Quién entra en la
    medida no lo decide este campo sino `_tramos_validos`, que exige el minuto
    en cada uno de los dos tramos.
    """
    if "duracion_total_horas" not in df.columns:
        return _nan_series(df)
    return pd.to_numeric(df["duracion_total_horas"], errors="coerce")


def _tramos_validos(espera: pd.Series, gestion: pd.Series) -> pd.Series:
    """
    Qué tickets tienen un ciclo de cierre medible, tramo a tramo.

    Un cierre sólo cuenta si sus DOS tramos duraron al menos
    `MIN_DURACION_HORAS` (1 minuto): la espera creación → primera asignación y
    la gestión asignación → cierre. Un total de dos minutos, por tanto, es el
    mínimo con el que un ticket entra en las medidas de cierre.

    Mirar sólo el total no bastaba: un ticket que se asigna y se cierra en el
    mismo segundo —el rastro de una acción masiva de Odoo— pasaba el filtro con
    tal de llevar horas en cola, y metía en la media un tiempo de gestión que
    nunca ocurrió. La comparación con NaN es False, así que al ticket sin fecha
    de asignación se le descarta el cierre por el mismo camino.
    """
    return (espera >= MIN_DURACION_HORAS) & (gestion >= MIN_DURACION_HORAS)


def _serie_de_formula(df: pd.DataFrame, formula: str) -> pd.Series:
    if df.empty:
        return pd.Series(dtype=float)

    espera = _hours_between(df, "creado_el", "primera_fecha_asignada")

    # La asignación es un tramo único: su propio umbral en
    # `_compute_stats_for_series` ya es la regla del minuto, y no depende del
    # cierre —un ticket abierto sigue teniendo espera que medir—.
    if formula == "creado_a_asignacion":
        return espera

    gestion = _hours_between(df, "primera_fecha_asignada", "ultima_actualizacion_etapa")

    if formula == "duracion_total":
        serie = _duracion_total(df)
    elif formula == "asignado_a_cierre":
        serie = gestion
    else:
        raise ValueError(f"Fórmula de tiempo desconocida: {formula!r}")

    return serie.where(_tramos_validos(espera, gestion))


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

    return clean_json_props(metrics)
