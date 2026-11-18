# backend/support/metrics.py
"""
El bloque de métricas de una cohorte: ocho medidas de tiempo, las tasas y en qué
se va el tiempo.

Todo el módulo es una función pura de un `PeriodCohort` ya clasificado, así que
el mismo código sirve para el total del periodo, para un grupo de trabajo, para
una zona y para el desglose que `queries` calcula al vuelo.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from core.utils import clean_json_props
from services.support.analytics.cohorts import PeriodCohort
from services.support.analytics.config import (
    COMPOSITION_KINDS,
    POP_CLOSED,
    SUPPORT_COMPOSITION_FIELDS,
    SUPPORT_RATE_FIELDS,
    SUPPORT_TIME_MEASURES,
    SUPPORT_VOLUME_FIELDS,
    TIME_MEASURE_SPECS,
    TIME_STATS,
)


def _compute_stats_for_series(series: pd.Series) -> dict[str, float]:
    """
    Estadísticos de una serie de duraciones en horas.

    Entra todo lo medible. Lo único que se descarta es lo que no es un tiempo:
    el NaN de una fecha ausente y el valor negativo de una fecha capturada al
    revés. No hay duración mínima —un ciclo de treinta segundos es tan real
    como uno de treinta horas, y filtrarlo por corto tiraba dato bueno para
    protegerse del malo; de la fila incoherente ya se encarga la coherencia de
    sus fechas—.

    `muestra` expone cuántos tickets sí se pudieron medir, para poder juzgar la
    cobertura del cálculo desde la interfaz.
    """
    s = pd.to_numeric(series, errors="coerce").dropna()
    s = s[s >= 0]
    n = len(s)

    if n == 0:
        return {stat: 0.0 for stat in TIME_STATS} | {"pct_excede_promedio": 0.0, "muestra": 0}

    average = float(s.mean())

    return {
        "medio": round(average, 2),
        "mediana": round(float(s.median()), 2),
        "min": round(float(s.min()), 2),
        "p25": round(float(s.quantile(0.25)), 2),
        "p75": round(float(s.quantile(0.75)), 2),
        "max": round(float(s.max()), 2),
        "std": round(float(s.std(ddof=0)) if n > 1 else 0.0, 2),
        "pct_excede_promedio": round(float((s > average).sum() / n) * 100, 2),
        "muestra": n,
    }


def _nan_series(df: pd.DataFrame) -> pd.Series:
    """Serie de NaN con el índice del DataFrame, para poder alinearla con él."""
    return pd.Series(float("nan"), index=df.index, dtype=float)


def _date(df: pd.DataFrame, col: str) -> pd.Series:
    """
    Una columna de fecha de la cohorte, sin volver a parsearla si ya lo está.

    `classify_tickets` convierte las tres fechas una sola vez sobre la tabla
    completa. La conversión sólo ocurre aquí para el caso raro de una cohorte
    armada a mano, y no en las cientos de sub-cohortes de un corte.
    """
    series = df[col]
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    return pd.to_datetime(series, errors="coerce")


def _hours_between(df: pd.DataFrame, col_start: str, end_col: str) -> pd.Series:
    """
    Diferencia en horas entre dos columnas de fecha, sin rellenos.

    Los tickets a los que les falta cualquiera de las dos fechas quedan como NaN
    y `_compute_stats_for_series` los descarta. Nunca se sustituyen por 0 ni se
    recortan a 0: una duración negativa es un error de captura, no un cierre
    instantáneo, y también se descarta.

    El resultado conserva el índice de `df` incluso cuando falta una columna,
    porque `_valid_tiers` cruza los dos tramos fila a fila.
    """
    if col_start not in df.columns or end_col not in df.columns:
        return _nan_series(df)

    return (_date(df, end_col) - _date(df, col_start)).dt.total_seconds() / 3600.0


def _hours_until(df: pd.DataFrame, col_start: str, instant: pd.Timestamp) -> pd.Series:
    """Horas entre una columna de fecha y un instante fijo: el reloj abierto."""
    if col_start not in df.columns:
        return _nan_series(df)
    return (instant - _date(df, col_start)).dt.total_seconds() / 3600.0


def _total_duration(df: pd.DataFrame) -> pd.Series:
    """
    Duración creación → cierre tal y como la reporta Odoo.

    Se lee el campo en vez de restar las dos fechas porque ya viene calculado:
    promediarlo es sumar y dividir entre la muestra, sin una resta de fechas
    más por ticket. Quién entra en la medida no lo decide este campo sino
    `_valid_tiers`, que mira si las tres fechas del ciclo son coherentes.
    """
    if "duracion_total_horas" not in df.columns:
        return _nan_series(df)
    return pd.to_numeric(df["duracion_total_horas"], errors="coerce")


def _valid_tiers(wait: pd.Series, handling: pd.Series) -> pd.Series:
    """
    Qué tickets tienen un ciclo de cierre medible: los de fechas coherentes.

    Los dos tramos —espera creación → primera asignación y gestión primera
    asignación → cierre— tienen que existir y no ir hacia atrás. No se les pide
    durar un mínimo: un cierre rápido es un cierre, y el ticket que Odoo asignó
    y cerró en el mismo segundo entra ahora con sus cero horas.

    Lo que sigue quedando fuera es el ticket **sin fecha de asignación**: la
    comparación con NaN es False. No es un descarte de medición sino de
    higiene, y es el punto: un ticket no debería estar cerrado sin haber sido
    asignado, y la diferencia entre `muestra_*` y `tickets_cerrados` es la
    cuenta de los que lo están.
    """
    return (wait >= 0) & (handling >= 0)


def _assignment_series(df: pd.DataFrame, cutoff: pd.Timestamp) -> pd.Series:
    """
    La espera creación → asignación, censurada en el corte.

    Dos casos, y el segundo es el que importa:

      * ya asignado al corte → la espera real.
      * creado, sin asignar y todavía abierto a esa hora → creación → corte.
        Es la espera que se acumuló dentro del periodo: fin del día en la barra
        diaria, fin del mes en el cierre. Dejarlos fuera vaciaba la métrica
        justo de los que más esperan, que es a quienes sirve para encontrar, y
        medirlos contra la hora del cálculo habría hecho que el mes cambiara de
        valor cada vez que se reanaliza.

    El cerrado sin asignación nunca entra, ni por la espera real —que no tiene—
    ni por la censura: su espera no terminó, es que el dato está mal, y es lo
    que `_valid_tiers` señala en las medidas de cierre.
    """
    wait = _hours_between(df, "dt_creacion", "asignado_al_corte")

    if "asignado_al_corte" not in df.columns or "cerrado_al_corte" not in df.columns:
        return wait

    waiting = df["asignado_al_corte"].isna() & ~df["cerrado_al_corte"]
    return wait.mask(waiting, _hours_until(df, "dt_creacion", cutoff))


def _formula_series(
    df: pd.DataFrame, formula: str, cutoff: pd.Timestamp
) -> pd.Series:
    """La serie de horas de una medida, segun como este definida."""
    if df.empty:
        return pd.Series(dtype=float)

    # La asignación es un tramo único y no depende del cierre: un ticket
    # abierto sigue teniendo espera que medir, y es la que se censura.
    if formula == "creado_a_asignacion":
        return _assignment_series(df, cutoff)

    # Hasta escalar: el escalamiento ES el cierre de la copia de ATC, y no
    # exige asignación, porque escalar sin que nadie lo tomara también ocurre.
    if formula == "creado_a_cierre":
        return _hours_between(df, "dt_creacion", "dt_cierre")

    wait = _hours_between(df, "dt_creacion", "asignado_al_corte")
    handling = _hours_between(df, "asignado_al_corte", "dt_cierre")

    if formula == "duracion_total":
        series = _total_duration(df)
    elif formula == "asignado_a_cierre":
        series = handling
    else:
        raise ValueError(f"Fórmula de tiempo desconocida: {formula!r}")

    return series.where(_valid_tiers(wait, handling))


def _prefixed(stats: dict[str, float], measure: str) -> dict[str, Any]:
    """Aplana un bloque de estadísticos a las claves planas que guarda la BD."""
    flat = {f"tiempo_{stat}_{measure}_horas": stats[stat] for stat in TIME_STATS}
    flat[f"pct_excede_promedio_{measure}"] = stats["pct_excede_promedio"]
    flat[f"muestra_{measure}"] = stats["muestra"]
    return flat


def _pct(part: int, total: int) -> float:
    """Porcentaje redondeado, o 0.0 si el denominador es cero."""
    return round((part / total) * 100, 2) if total > 0 else 0.0


def compute_metrics_for_period(cohort: PeriodCohort) -> dict[str, Any]:
    """
    El bloque completo de una cohorte: volúmenes, tasas, las ocho medidas y en
    qué se fue el tiempo.

    En ATC lo escalado es una forma de cerrar (ver `escalation.py`): cuenta en
    `tickets_cerrados` y no en resueltos ni cancelados, de modo que resolución,
    cancelación y escalamiento se reparten lo cerrado y suman 100 %.

    Cada cifra trae fijado su denominador, y son dos distintos:

      * resolución y cancelación se leen sobre lo CERRADO en el mes —es la
        mezcla de desenlaces del trabajo despachado—, y cada una se abre en el
        que además nació en el mes y el que venía arrastrado. Los dos sumandos
        comparten denominador, así que cierran exactamente con el total.
      * el rezago se lee sobre lo CREADO en el mes: de la demanda que entró,
        cuánta no se cerró dentro del propio mes.
    """
    df = cohort.df
    total = len(df)

    if total == 0:
        counts = dict.fromkeys(
            ["creados", "cerrados", "resueltos", "resueltos_periodo", "resueltos_arrastre",
             "cancelados", "cancelados_periodo", "cancelados_arrastre",
             "escalados", "escalados_periodo", "escalados_arrastre",
             "recibidos_escalados", "rezagados"], 0
        )
    else:
        born = df["nacido_en_periodo"]
        is_closed = df["cerrado_en_periodo"]
        resolved = is_closed & df["es_resuelto"]
        cancelled = is_closed & df["es_cancelado"]
        escalated = is_closed & _flag(df, "es_escalado")

        counts = {
            "creados": int(born.sum()),
            "cerrados": int(is_closed.sum()),
            "resueltos": int(resolved.sum()),
            "resueltos_periodo": int((resolved & born).sum()),
            "resueltos_arrastre": int((resolved & ~born).sum()),
            "cancelados": int(cancelled.sum()),
            "cancelados_periodo": int((cancelled & born).sum()),
            "cancelados_arrastre": int((cancelled & ~born).sum()),
            "escalados": int(escalated.sum()),
            "escalados_periodo": int((escalated & born).sum()),
            "escalados_arrastre": int((escalated & ~born).sum()),
            "recibidos_escalados": int((born & _flag(df, "llego_escalado")).sum()),
            "rezagados": int((born & df["es_rezagado"]).sum()),
        }

    closed = counts["cerrados"]
    created = counts["creados"]

    metrics: dict[str, Any] = {
        "total_tickets": total,
        "tickets_creados": created,
        "tickets_cerrados": closed,
        **{f"tickets_{key}": counts[key] for key in (
            "resueltos", "resueltos_periodo", "resueltos_arrastre",
            "cancelados", "cancelados_periodo", "cancelados_arrastre",
            "escalados", "escalados_periodo", "escalados_arrastre",
            "recibidos_escalados", "rezagados",
        )},
        **{f"pct_{key}": _pct(counts[key], closed) for key in (
            "resueltos", "resueltos_periodo", "resueltos_arrastre",
            "cancelados", "cancelados_periodo", "cancelados_arrastre",
            "escalados", "escalados_periodo", "escalados_arrastre",
        )},
        "pct_recibidos_escalados": _pct(counts["recibidos_escalados"], created),
        "pct_rezagados": _pct(counts["rezagados"], created),
    }

    for measure, formula, population in TIME_MEASURE_SPECS:
        series = _formula_series(cohort.population(population), formula, cohort.cutoff)
        metrics.update(_prefixed(_compute_stats_for_series(series), measure))

    metrics.update(_composition(cohort.population(POP_CLOSED)))

    return clean_json_props(metrics)


def _flag(df: pd.DataFrame, column: str) -> pd.Series:
    """Una columna booleana de la cohorte, o toda en False si no existe."""
    if column not in df.columns:
        return pd.Series(False, index=df.index)
    return df[column].fillna(False).astype(bool)


def _composition(closed: pd.DataFrame) -> dict[str, Any]:
    """En qué se le fue el tiempo al equipo con lo que cerró en el periodo.

    El promedio de horas en cola, pausa, gestión y etapas sin clasificar de los
    cerrados con logs de etapa (ver `SUPPORT_COMPOSITION_FIELDS`). Son
    promedios para que las cuatro partes sumen el tiempo medio.
    """
    with_logs = closed[_flag(closed, "con_recorrido")] if not closed.empty else closed
    n = len(with_logs)
    block: dict[str, Any] = {"muestra_composicion": n}
    for kind, field in zip(COMPOSITION_KINDS, SUPPORT_COMPOSITION_FIELDS):
        col = f"h_{kind}"
        if n == 0 or col not in with_logs.columns:
            block[field] = 0.0
            continue
        hours = pd.to_numeric(with_logs[col], errors="coerce").fillna(0.0).clip(lower=0)
        block[field] = round(float(hours.mean()), 2)
    return block


# Cada medida de tiempo con la columna que dice cuántos tickets pudo medir.
# Promediar un periodo sin ninguna duración medible metería un 0 en la media,
# que es justo el sesgo que `_compute_stats_for_series` corrige a nivel de
# ticket: los periodos con muestra 0 se excluyen de la media de esa medida.
_TIME_MASKS = {measure: f"muestra_{measure}" for measure in SUPPORT_TIME_MEASURES}


def _mean_of(df: pd.DataFrame, field: str, mask_field: str | None = None) -> float:
    """Promedio de una columna, opcionalmente ignorando los periodos sin muestra."""
    if field not in df.columns:
        return 0.0

    series = pd.to_numeric(df[field], errors="coerce")
    if mask_field and mask_field in df.columns:
        series = series[pd.to_numeric(df[mask_field], errors="coerce").fillna(0) > 0]

    series = series.dropna()
    return round(float(series.mean()), 2) if not series.empty else 0.0


def average_blocks(blocks: list[dict]) -> dict[str, Any]:
    """
    Promedia varios bloques de periodo en uno solo.

    Los volúmenes quedan como promedio mensual y las tasas como promedio simple
    de las tasas de cada periodo —no como la tasa del agregado—, para que un mes
    de mucho volumen no aplaste a los demás al juzgar el desempeño típico.
    """
    if not blocks:
        return {}

    df = pd.DataFrame(blocks)
    avg: dict[str, Any] = {field: _mean_of(df, field) for field in SUPPORT_VOLUME_FIELDS}
    avg.update({field: _mean_of(df, field) for field in SUPPORT_RATE_FIELDS})

    for field in SUPPORT_COMPOSITION_FIELDS:
        avg[field] = _mean_of(df, field, "muestra_composicion")
    avg["muestra_composicion"] = _mean_of(df, "muestra_composicion")

    for measure, sample in _TIME_MASKS.items():
        for stat in TIME_STATS:
            key = f"tiempo_{stat}_{measure}_horas"
            avg[key] = _mean_of(df, key, sample)
        avg[f"pct_excede_promedio_{measure}"] = _mean_of(df, f"pct_excede_promedio_{measure}", sample)
        avg[sample] = _mean_of(df, sample)

    avg["periodos_evaluados"] = len(blocks)
    return avg
