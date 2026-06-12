from __future__ import annotations
from typing import Set
import pandas as pd
from ..config import ACTIVE_STATE, CORTE_IMPAGADO_EVENT, VALID_REACT_ORIGINS


def get_active_at(df_clean_logs, target_date, strictly_before=False):
    """Obtiene suscripciones activas en una fecha dada."""
    if strictly_before:
        filt = df_clean_logs[df_clean_logs["f_dt"] < target_date]
    else:
        filt = df_clean_logs[df_clean_logs["f_dt"] <= target_date]
    if filt.empty:
        return pd.DataFrame(columns=["orden"])
    idx = filt.groupby("orden")["f_dt"].idxmax()
    last_logs = filt.loc[idx]
    return last_logs[last_logs["estado"] == ACTIVE_STATE].copy()


def get_reactivations(df_clean_logs, df_subs_full, periodo, act_fin):
    """Identifica reactivaciones ocurridas dentro del periodo de analisis."""
    df = df_clean_logs.copy()
    mask_react = df["log_norm"].str.contains("reactivacion", na=False)
    df_react = df[mask_react]
    df_react = df_react.assign(f_min=df_react["f_dt"].dt.floor("min"))
    df_react = df_react.drop_duplicates(subset=["orden", "f_min"])
    df_react = df_react[
        (df_react["f_dt"] >= periodo.fecha_inicio)
        & (df_react["f_dt"] <= periodo.fecha_final)
    ]
    df_react = df_react[df_react["estado_origen"].isin(VALID_REACT_ORIGINS)]
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


def get_corte_impagado(df_clean_logs, periodo):
    """Identifica eventos de corte por factura impaga en el periodo."""
    df = df_clean_logs.copy()
    mask_corte = df["log_norm"].str.contains(CORTE_IMPAGADO_EVENT, na=False)
    df_corte = df[mask_corte]
    df_corte = df_corte.assign(f_min=df_corte["f_dt"].dt.floor("min"))
    df_corte = df_corte.drop_duplicates(subset=["orden", "f_min"])
    df_corte = df_corte[
        (df_corte["f_dt"] >= periodo.fecha_inicio)
        & (df_corte["f_dt"] <= periodo.fecha_final)
    ]
    return df_corte[["orden", "f_dt", "nota"]].rename(
        columns={"f_dt": "fecha_corte", "nota": "motivo_corte"}
    )
