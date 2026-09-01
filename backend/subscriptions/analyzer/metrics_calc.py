from __future__ import annotations
import pandas as pd
from ...conf_config import ACTIVE_STATE, CORTE_IMPAGADO_EVENT, FREE_STATE, VALID_REACT_ORIGINS


def last_log_per_orden(df_logs):
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


def get_state_at(df_clean_logs, target_date, estado, strictly_before=False):
    """Suscripciones cuyo último log hasta la fecha las deja en `estado`."""
    if strictly_before:
        filt = df_clean_logs[df_clean_logs["f_dt"] < target_date]
    else:
        filt = df_clean_logs[df_clean_logs["f_dt"] <= target_date]
    if filt.empty:
        return pd.DataFrame(columns=["orden"])
    last_logs = last_log_per_orden(filt)
    return last_logs[last_logs["estado"] == estado].copy()


def get_active_at(df_clean_logs, target_date, strictly_before=False):
    return get_state_at(df_clean_logs, target_date, ACTIVE_STATE, strictly_before)


def get_free_at(df_clean_logs, target_date, strictly_before=False):
    return get_state_at(df_clean_logs, target_date, FREE_STATE, strictly_before)


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


def corte_candidates(df_clean_logs):
    """Logs de corte por impago, sin filtrar por fecha (igual que arriba)."""
    df_corte = df_clean_logs[
        df_clean_logs["log_norm"].str.contains(CORTE_IMPAGADO_EVENT, na=False)
    ].copy()
    df_corte = df_corte.assign(f_min=df_corte["f_dt"].dt.floor("min"))
    return df_corte.drop_duplicates(subset=["orden", "f_min"])


def get_reactivations(df_clean_logs, df_subs_full, periodo, act_fin, candidates=None):
    df_react = react_candidates(df_clean_logs) if candidates is None else candidates
    df_react = df_react[
        (df_react["f_dt"] >= periodo.fecha_inicio)
        & (df_react["f_dt"] <= periodo.fecha_final)
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
    nuevas = df_subs_full[
        (df_subs_full["f_ini_dt"] >= periodo.fecha_inicio)
        & (df_subs_full["f_ini_dt"] <= periodo.fecha_final)
    ]
    if not nuevas.empty:
        df_react = df_react[~df_react["orden"].isin(nuevas["orden"])]
    if not df_react.empty:
        df_react = df_react[df_react["orden"].isin(act_fin["orden"])]
    return df_react


def get_corte_impagado(df_clean_logs, periodo, candidates=None):
    df_corte = corte_candidates(df_clean_logs) if candidates is None else candidates
    df_corte = df_corte[
        (df_corte["f_dt"] >= periodo.fecha_inicio)
        & (df_corte["f_dt"] <= periodo.fecha_final)
    ]
    return df_corte[["orden", "f_dt", "nota"]].rename(
        columns={"f_dt": "fecha_corte", "nota": "motivo_corte"}
    )
