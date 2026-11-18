"""El estado de una suscripcion a una fecha, y los eventos del periodo.

Dos formas de responder la misma pregunta:

* `get_state_at` es la **definicion de referencia**: filtra el historico entero
  y reagrupa por orden. Correcta y facil de leer, pero cara.
* `AccumulatedState` da el mismo resultado recorriendo el log **una sola vez**,
  que es lo que hace viable calcular los 31 cortes de un mes.

Aqui viven tambien las dos definiciones de evento del periodo: que cuenta como
reactivacion y que como corte por impago.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from core.config import ACTIVE_STATE, FREE_STATE, UNPAID_CUT_EVENT, VALID_REACT_ORIGINS


def last_log_per_order(df_logs):
    """
    Ultimo log de cada suscripcion.

    Se toma la ultima fila y no `idxmax`, porque varios logs pueden compartir
    el mismo segundo (un cambio de plan deja "Plan change", "Suspension TV" y
    el sintetico de plan gratuito a la vez) e `idxmax` devuelve la primera del
    empate. El frame ya viene ordenado por ["orden", "f_dt"], con los
    sinteticos detras de los logs reales de ese mismo instante.
    """
    if df_logs.empty:
        return df_logs
    return df_logs.groupby("orden", sort=False).tail(1)


def get_state_at(df_clean_logs, target_date, state, strictly_before=False):
    """Suscripciones cuyo último log hasta la fecha las deja en `estado`.

    Definicion de referencia, para una fecha suelta. El analisis mensual no la
    usa: recorre muchas fechas y va por `AccumulatedState`, que da el mismo
    resultado en una sola pasada.
    """
    if strictly_before:
        filt = df_clean_logs[df_clean_logs["f_dt"] < target_date]
    else:
        filt = df_clean_logs[df_clean_logs["f_dt"] <= target_date]
    if filt.empty:
        return pd.DataFrame(columns=["orden"])
    last_logs = last_log_per_order(filt)
    return last_logs[last_logs["estado"] == state].copy()


def get_active_at(df_clean_logs, target_date, strictly_before=False):
    """Suscripciones activas a una fecha (definicion de referencia)."""
    return get_state_at(df_clean_logs, target_date, ACTIVE_STATE, strictly_before)


def get_free_at(df_clean_logs, target_date, strictly_before=False):
    """Suscripciones en servicio gratuito a una fecha (definicion de referencia)."""
    return get_state_at(df_clean_logs, target_date, FREE_STATE, strictly_before)


class AccumulatedState:
    """Estado de cada suscripcion a una fecha, recorriendo el log una sola vez.

    `get_state_at` responde una fecha filtrando el historico entero y
    reagrupandolo por orden. Es correcto, pero el analisis de un mes pregunta
    dos veces por cada uno de los 31 dias (activos y gratuitos), asi que el log
    completo se recorria 62 veces y ahi se iba la mayor parte del tiempo.

    Aqui el recorrido es acumulativo: el estado al dia N es el del dia N-1 mas
    los logs que caen entre medias. Para una serie de fechas crecientes -que es
    justo como avanza `build_day_metrics`- cada fila se toca una sola vez.

    El resultado es identico al de `get_state_at`, no una aproximacion. La razon
    es la invariante que ya sostenia a `last_log_per_order`: el frame llega
    ordenado por ["orden", "f_dt"], asi que dentro de una suscripcion la
    posicion crece con la fecha y "el ultimo log hasta la fecha" es siempre "la
    posicion mas alta de esa orden entre las filas que ya entraron". Los
    empates -un log real y su sintetico en el mismo segundo- se resuelven igual
    que antes, porque el recorrido por fecha es estable y conserva el orden del
    frame.
    """

    def __init__(self, df_logs: pd.DataFrame):
        self.df = df_logs
        self.empty = df_logs.empty
        if self.empty:
            return

        dates = df_logs["f_dt"].to_numpy()
        # Recorrido por fecha. `stable` es lo que conserva el orden del frame
        # entre filas de la misma fecha, y con el, el desempate historico.
        self._visit = np.argsort(dates, kind="stable")
        self._visit_dates = dates[self._visit]
        self._codes = pd.factorize(df_logs["orden"], sort=False)[0]
        self._n_orders = int(self._codes.max()) + 1
        self._states = df_logs["estado"].to_numpy()
        self._reset()

    def _reset(self) -> None:
        """Vuelve al principio del recorrido, olvidando lo acumulado."""
        self._cursor = 0
        self._last_row = np.full(self._n_orders, -1, dtype=np.int64)

    def _advance(self, cutoff: int) -> None:
        """Incorpora las filas hasta `corte` (indice en el recorrido por fecha)."""
        if cutoff < self._cursor:
            # Retroceso: pasa una vez por ejecucion, cuando el cierre del mes se
            # calcula antes que los dias. Rehacerlo desde cero sigue siendo una
            # pasada, frente a las 62 de antes.
            self._reset()
        if cutoff == self._cursor:
            return

        tier = self._visit[self._cursor:cutoff]
        maxima = pd.Series(tier).groupby(self._codes[tier]).max()
        indexes = maxima.index.to_numpy()
        self._last_row[indexes] = np.maximum(
            self._last_row[indexes], maxima.to_numpy()
        )
        self._cursor = cutoff

    def _current_rows(self, target_date, strictly_before: bool) -> np.ndarray:
        """Indices del ultimo log de cada suscripcion hasta la fecha indicada."""
        # side='left' cuenta las filas estrictamente anteriores; 'right', las
        # que llegan hasta la fecha incluida.
        cutoff = int(np.searchsorted(
            self._visit_dates,
            np.datetime64(target_date),
            side="left" if strictly_before else "right",
        ))
        self._advance(cutoff)
        return self._last_row[self._last_row >= 0]

    def latest(self, target_date, strictly_before: bool = False) -> pd.DataFrame:
        """Ultimo log de cada suscripcion hasta la fecha, sea cual sea su estado."""
        if self.empty:
            return self.df
        return self.df.take(np.sort(self._current_rows(target_date, strictly_before)))

    def in_state(self, target_date, state, strictly_before: bool = False) -> pd.DataFrame:
        """Suscripciones cuyo ultimo log hasta la fecha las deja en `estado`."""
        if self.empty:
            return self.df
        rows = self._current_rows(target_date, strictly_before)
        rows = rows[self._states[rows] == state]
        return self.df.take(np.sort(rows)).copy()


def react_candidates(df_clean_logs):
    """Logs que podrian ser reactivacion, sin filtrar por fecha.

    El `str.contains` recorre todo el log y no depende del periodo, asi que se
    calcula una sola vez y se reutiliza en cada corte diario.
    """
    mask_react_text = df_clean_logs["log_norm"].str.contains("reactivacion", na=False)
    mask_react_state = (
        df_clean_logs["estado_origen"].isin(VALID_REACT_ORIGINS)
        & (df_clean_logs["estado"] == ACTIVE_STATE)
    )
    return df_clean_logs[mask_react_text | mask_react_state].copy()


def cut_candidates(df_clean_logs):
    """Logs de corte por impago, sin filtrar por fecha (igual que arriba)."""
    df_cutoff = df_clean_logs[
        df_clean_logs["log_norm"].str.contains(UNPAID_CUT_EVENT, na=False)
    ].copy()
    df_cutoff = df_cutoff.assign(f_min=df_cutoff["f_dt"].dt.floor("min"))
    return df_cutoff.drop_duplicates(subset=["orden", "f_min"])


def get_reactivations(df_clean_logs, df_subs_full, period, act_end, candidates=None):
    """Reactivaciones del periodo, una por suscripcion.

    Cuenta como reactivacion volver a activo desde un estado inactivo, o un log
    cuyo texto la nombra. Se descartan las altas del propio periodo -un alta no es
    una reactivacion- y las que no siguen activas al cierre. Cuando hay varias, se
    queda con la de origen mas grave: baja, luego suspension, luego pausa.
    """
    df_react = react_candidates(df_clean_logs) if candidates is None else candidates
    df_react = df_react[
        (df_react["f_dt"] >= period.start_date)
        & (df_react["f_dt"] <= period.end_date)
    ]
    priority_map = {"6_churn": 0, "8_30days": 1, "4_paused": 2}
    df_react = df_react.assign(
        _prioridad=df_react["estado_origen"].map(priority_map)
    )
    df_react = df_react.sort_values("_prioridad").drop_duplicates(subset=["orden"], keep="first")
    df_react = df_react.drop(columns=["_prioridad"])
    mask_valid_origin = df_react["estado_origen"].isin(VALID_REACT_ORIGINS)
    mask_unknown_text = df_react["estado_origen"].isna() & df_react["log_norm"].str.contains("reactivacion", na=False)
    df_react = df_react[mask_valid_origin | mask_unknown_text]
    df_react["estado_origen"] = df_react["estado_origen"].fillna("reactivacion_sin_origen")
    df_react = df_react[["orden", "f_dt", "estado_origen"]].rename(
        columns={"f_dt": "fecha"}
    )
    new = df_subs_full[
        (df_subs_full["f_ini_dt"] >= period.start_date)
        & (df_subs_full["f_ini_dt"] <= period.end_date)
    ]
    if not new.empty:
        df_react = df_react[~df_react["orden"].isin(new["orden"])]
    if not df_react.empty:
        df_react = df_react[df_react["orden"].isin(act_end["orden"])]
    return df_react


def get_unpaid_cuts(df_clean_logs, period, candidates=None):
    """Cortes por factura impaga ocurridos dentro del periodo."""
    df_cutoff = cut_candidates(df_clean_logs) if candidates is None else candidates
    df_cutoff = df_cutoff[
        (df_cutoff["f_dt"] >= period.start_date)
        & (df_cutoff["f_dt"] <= period.end_date)
    ]
    return df_cutoff[["orden", "f_dt", "nota"]].rename(
        columns={"f_dt": "fecha_corte", "nota": "motivo_corte"}
    )
