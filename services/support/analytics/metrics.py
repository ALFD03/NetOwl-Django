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
    POB_CERRADOS,
    SUPPORT_COMPOSICION_FIELDS,
    SUPPORT_RATE_FIELDS,
    SUPPORT_TIME_MEASURES,
    SUPPORT_VOLUME_FIELDS,
    TIME_MEASURE_SPECS,
    TIME_STATS,
    TIPOS_COMPOSICION,
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


def _fecha(df: pd.DataFrame, col: str) -> pd.Series:
    """
    Una columna de fecha de la cohorte, sin volver a parsearla si ya lo está.

    `classify_tickets` convierte las tres fechas una sola vez sobre la tabla
    completa. La conversión sólo ocurre aquí para el caso raro de una cohorte
    armada a mano, y no en las cientos de sub-cohortes de un corte.
    """
    serie = df[col]
    if pd.api.types.is_datetime64_any_dtype(serie):
        return serie
    return pd.to_datetime(serie, errors="coerce")


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

    return (_fecha(df, col_fin) - _fecha(df, col_inicio)).dt.total_seconds() / 3600.0


def _horas_hasta(df: pd.DataFrame, col_inicio: str, instante: pd.Timestamp) -> pd.Series:
    """Horas entre una columna de fecha y un instante fijo: el reloj abierto."""
    if col_inicio not in df.columns:
        return _nan_series(df)
    return (instante - _fecha(df, col_inicio)).dt.total_seconds() / 3600.0


def _duracion_total(df: pd.DataFrame) -> pd.Series:
    """
    Duración creación → cierre tal y como la reporta Odoo.

    Se lee el campo en vez de restar las dos fechas porque ya viene calculado:
    promediarlo es sumar y dividir entre la muestra, sin una resta de fechas
    más por ticket. Quién entra en la medida no lo decide este campo sino
    `_tramos_validos`, que mira si las tres fechas del ciclo son coherentes.
    """
    if "duracion_total_horas" not in df.columns:
        return _nan_series(df)
    return pd.to_numeric(df["duracion_total_horas"], errors="coerce")


def _tramos_validos(espera: pd.Series, gestion: pd.Series) -> pd.Series:
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
    return (espera >= 0) & (gestion >= 0)


def _serie_asignacion(df: pd.DataFrame, corte: pd.Timestamp) -> pd.Series:
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
    que `_tramos_validos` señala en las medidas de cierre.
    """
    espera = _hours_between(df, "dt_creacion", "asignado_al_corte")

    if "asignado_al_corte" not in df.columns or "cerrado_al_corte" not in df.columns:
        return espera

    esperando = df["asignado_al_corte"].isna() & ~df["cerrado_al_corte"]
    return espera.mask(esperando, _horas_hasta(df, "dt_creacion", corte))


def _serie_de_formula(
    df: pd.DataFrame, formula: str, corte: pd.Timestamp
) -> pd.Series:
    """La serie de horas de una medida, segun como este definida."""
    if df.empty:
        return pd.Series(dtype=float)

    # La asignación es un tramo único y no depende del cierre: un ticket
    # abierto sigue teniendo espera que medir, y es la que se censura.
    if formula == "creado_a_asignacion":
        return _serie_asignacion(df, corte)

    # Hasta escalar: el escalamiento ES el cierre de la copia de ATC, y no
    # exige asignación, porque escalar sin que nadie lo tomara también ocurre.
    if formula == "creado_a_cierre":
        return _hours_between(df, "dt_creacion", "dt_cierre")

    espera = _hours_between(df, "dt_creacion", "asignado_al_corte")
    gestion = _hours_between(df, "asignado_al_corte", "dt_cierre")

    if formula == "duracion_total":
        serie = _duracion_total(df)
    elif formula == "asignado_a_cierre":
        serie = gestion
    else:
        raise ValueError(f"Fórmula de tiempo desconocida: {formula!r}")

    return serie.where(_tramos_validos(espera, gestion))


def _prefixed(stats: dict[str, float], medida: str) -> dict[str, Any]:
    """Aplana un bloque de estadísticos a las claves planas que guarda la BD."""
    plano = {f"tiempo_{stat}_{medida}_horas": stats[stat] for stat in TIME_STATS}
    plano[f"pct_excede_promedio_{medida}"] = stats["pct_excede_promedio"]
    plano[f"muestra_{medida}"] = stats["muestra"]
    return plano


def _pct(parte: int, total: int) -> float:
    """Porcentaje redondeado, o 0.0 si el denominador es cero."""
    return round((parte / total) * 100, 2) if total > 0 else 0.0


def compute_metrics_for_period(cohorte: PeriodCohort) -> dict[str, Any]:
    """
    El bloque completo de una cohorte: volúmenes, tasas, las ocho medidas y en
    qué se fue el tiempo.

    En ATC lo escalado es una forma de cerrar (ver `escalamiento.py`): cuenta en
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
    df = cohorte.df
    total = len(df)

    if total == 0:
        conteos = dict.fromkeys(
            ["creados", "cerrados", "resueltos", "resueltos_periodo", "resueltos_arrastre",
             "cancelados", "cancelados_periodo", "cancelados_arrastre",
             "escalados", "escalados_periodo", "escalados_arrastre",
             "recibidos_escalados", "rezagados"], 0
        )
    else:
        nacido = df["nacido_en_periodo"]
        cerrado = df["cerrado_en_periodo"]
        resuelto = cerrado & df["es_resuelto"]
        cancelado = cerrado & df["es_cancelado"]
        escalado = cerrado & _bandera(df, "es_escalado")

        conteos = {
            "creados": int(nacido.sum()),
            "cerrados": int(cerrado.sum()),
            "resueltos": int(resuelto.sum()),
            "resueltos_periodo": int((resuelto & nacido).sum()),
            "resueltos_arrastre": int((resuelto & ~nacido).sum()),
            "cancelados": int(cancelado.sum()),
            "cancelados_periodo": int((cancelado & nacido).sum()),
            "cancelados_arrastre": int((cancelado & ~nacido).sum()),
            "escalados": int(escalado.sum()),
            "escalados_periodo": int((escalado & nacido).sum()),
            "escalados_arrastre": int((escalado & ~nacido).sum()),
            "recibidos_escalados": int((nacido & _bandera(df, "llego_escalado")).sum()),
            "rezagados": int((nacido & df["es_rezagado"]).sum()),
        }

    cerrados = conteos["cerrados"]
    creados = conteos["creados"]

    metrics: dict[str, Any] = {
        "total_tickets": total,
        "tickets_creados": creados,
        "tickets_cerrados": cerrados,
        **{f"tickets_{clave}": conteos[clave] for clave in (
            "resueltos", "resueltos_periodo", "resueltos_arrastre",
            "cancelados", "cancelados_periodo", "cancelados_arrastre",
            "escalados", "escalados_periodo", "escalados_arrastre",
            "recibidos_escalados", "rezagados",
        )},
        **{f"pct_{clave}": _pct(conteos[clave], cerrados) for clave in (
            "resueltos", "resueltos_periodo", "resueltos_arrastre",
            "cancelados", "cancelados_periodo", "cancelados_arrastre",
            "escalados", "escalados_periodo", "escalados_arrastre",
        )},
        "pct_recibidos_escalados": _pct(conteos["recibidos_escalados"], creados),
        "pct_rezagados": _pct(conteos["rezagados"], creados),
    }

    for medida, formula, poblacion in TIME_MEASURE_SPECS:
        serie = _serie_de_formula(cohorte.poblacion(poblacion), formula, cohorte.corte)
        metrics.update(_prefixed(_compute_stats_for_series(serie), medida))

    metrics.update(_composicion(cohorte.poblacion(POB_CERRADOS)))

    return clean_json_props(metrics)


def _bandera(df: pd.DataFrame, columna: str) -> pd.Series:
    """Una columna booleana de la cohorte, o toda en False si no existe."""
    if columna not in df.columns:
        return pd.Series(False, index=df.index)
    return df[columna].fillna(False).astype(bool)


def _composicion(cerrados: pd.DataFrame) -> dict[str, Any]:
    """En qué se le fue el tiempo al equipo con lo que cerró en el periodo.

    El promedio de horas en cola, pausa, gestión y etapas sin clasificar de los
    cerrados con logs de etapa (ver `SUPPORT_COMPOSICION_FIELDS`). Son
    promedios para que las cuatro partes sumen el tiempo medio.
    """
    con_logs = cerrados[_bandera(cerrados, "con_recorrido")] if not cerrados.empty else cerrados
    n = len(con_logs)
    bloque: dict[str, Any] = {"muestra_composicion": n}
    for tipo, campo in zip(TIPOS_COMPOSICION, SUPPORT_COMPOSICION_FIELDS):
        col = f"h_{tipo}"
        if n == 0 or col not in con_logs.columns:
            bloque[campo] = 0.0
            continue
        horas = pd.to_numeric(con_logs[col], errors="coerce").fillna(0.0).clip(lower=0)
        bloque[campo] = round(float(horas.mean()), 2)
    return bloque


# Cada medida de tiempo con la columna que dice cuántos tickets pudo medir.
# Promediar un periodo sin ninguna duración medible metería un 0 en la media,
# que es justo el sesgo que `_compute_stats_for_series` corrige a nivel de
# ticket: los periodos con muestra 0 se excluyen de la media de esa medida.
_TIME_MASKS = {medida: f"muestra_{medida}" for medida in SUPPORT_TIME_MEASURES}


def _mean_of(df: pd.DataFrame, field: str, mask_field: str | None = None) -> float:
    """Promedio de una columna, opcionalmente ignorando los periodos sin muestra."""
    if field not in df.columns:
        return 0.0

    serie = pd.to_numeric(df[field], errors="coerce")
    if mask_field and mask_field in df.columns:
        serie = serie[pd.to_numeric(df[mask_field], errors="coerce").fillna(0) > 0]

    serie = serie.dropna()
    return round(float(serie.mean()), 2) if not serie.empty else 0.0


def average_blocks(bloques: list[dict]) -> dict[str, Any]:
    """
    Promedia varios bloques de periodo en uno solo.

    Los volúmenes quedan como promedio mensual y las tasas como promedio simple
    de las tasas de cada periodo —no como la tasa del agregado—, para que un mes
    de mucho volumen no aplaste a los demás al juzgar el desempeño típico.
    """
    if not bloques:
        return {}

    df = pd.DataFrame(bloques)
    avg: dict[str, Any] = {field: _mean_of(df, field) for field in SUPPORT_VOLUME_FIELDS}
    avg.update({field: _mean_of(df, field) for field in SUPPORT_RATE_FIELDS})

    for campo in SUPPORT_COMPOSICION_FIELDS:
        avg[campo] = _mean_of(df, campo, "muestra_composicion")
    avg["muestra_composicion"] = _mean_of(df, "muestra_composicion")

    for medida, muestra in _TIME_MASKS.items():
        for stat in TIME_STATS:
            key = f"tiempo_{stat}_{medida}_horas"
            avg[key] = _mean_of(df, key, muestra)
        avg[f"pct_excede_promedio_{medida}"] = _mean_of(df, f"pct_excede_promedio_{medida}", muestra)
        avg[muestra] = _mean_of(df, muestra)

    avg["periodos_evaluados"] = len(bloques)
    return avg
