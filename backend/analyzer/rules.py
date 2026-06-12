from __future__ import annotations
from typing import Set
import pandas as pd
from ..config import ACTIVE_STATE, CORTE_IMPAGADO_EVENT, EXCLUDED_STATE, INACTIVE_STATES


def apply_log_rules(df_clean_logs, df_subs_full):
    """Aplica reglas de casos anomalos sobre la relacion suscripcion-log.

    Returns:
        (df_clean_logs, ordens_con_activity): DataFrame corregido y conjunto
        de ordenes con al menos un log activo.
    """
    valid_ordens = set(df_subs_full["orden"])
    log_filtered = df_clean_logs[
        df_clean_logs["orden"].isin(valid_ordens)
    ].copy()
    log_filtered["_sintetico"] = False
    synth_parts = []

    # Caso 5: Primer log es corte impago -> sintetico activo en f_ini_dt
    idx_first = log_filtered.groupby("orden")["f_dt"].idxmin()
    df_first_logs = log_filtered.loc[idx_first, ["orden", "f_dt", "log_norm"]].copy()
    mask_caso5 = df_first_logs["log_norm"].str.contains(CORTE_IMPAGADO_EVENT, na=False)
    ordenes_caso5 = set(df_first_logs[mask_caso5]["orden"])
    if ordenes_caso5:
        df_subs_c5 = df_subs_full[df_subs_full["orden"].isin(ordenes_caso5)].copy()
        if not df_subs_c5.empty:
            df_subs_c5["f_dt"] = df_subs_c5["f_ini_dt"].fillna(pd.Timestamp("1900-01-01"))
            df_subs_c5["fecha"] = df_subs_c5["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
            df_subs_c5["nota"] = "sintetico - primer log es corte impago"
            df_subs_c5["log_norm"] = "sintetico - primer log es corte impago"
            df_subs_c5["estado"] = ACTIVE_STATE
            df_subs_c5["estado_origen"] = None
            df_subs_c5["_sintetico"] = True
            synth_parts.append(df_subs_c5[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    # Caso 1: Subs sin logs en ninguna version
    ordenes_con_log = set(log_filtered["orden"])
    mask_no_logs = ~df_subs_full["orden"].isin(ordenes_con_log)
    df_no_logs = df_subs_full[mask_no_logs].copy()
    df_no_logs = df_no_logs[df_no_logs["estado"] != EXCLUDED_STATE]
    if not df_no_logs.empty:
        df_no_logs["_synth_fecha"] = df_no_logs["f_ini_dt"].fillna(pd.Timestamp("1900-01-01"))
        df_no_logs["f_dt"] = df_no_logs["_synth_fecha"]
        df_no_logs["fecha"] = df_no_logs["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
        df_no_logs["nota"] = "sintetico - sin logs historicos"
        df_no_logs["log_norm"] = "sintetico - sin logs historicos"
        df_no_logs["estado_origen"] = None
        df_no_logs["_sintetico"] = True
        synth_parts.append(df_no_logs[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    # Caso 6: Log inactivo seguido de corte impago -> activo entre ambos
    df_ordered = log_filtered.sort_values(["orden", "f_dt"]).copy()
    df_ordered["next_log_norm"] = df_ordered.groupby("orden")["log_norm"].shift(-1)
    df_ordered["next_f_dt"] = df_ordered.groupby("orden")["f_dt"].shift(-1)
    df_ordered["next_orden"] = df_ordered.groupby("orden")["orden"].shift(-1)
    mask_caso6 = (
        df_ordered["estado"].isin(INACTIVE_STATES)
        & df_ordered["next_log_norm"].str.contains(CORTE_IMPAGADO_EVENT, na=False)
        & df_ordered["next_orden"].notna()
    )
    df_caso6 = df_ordered[mask_caso6].copy()
    if not df_caso6.empty:
        df_caso6["f_dt"] = df_caso6["f_dt"] + pd.Timedelta(seconds=1)
        df_caso6["fecha"] = df_caso6["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
        df_caso6["nota"] = "sintetico - activo entre inactivo y corte impago"
        df_caso6["log_norm"] = "sintetico - activo entre inactivo y corte impago"
        df_caso6["estado"] = ACTIVE_STATE
        df_caso6["estado_origen"] = None
        df_caso6["_sintetico"] = True
        synth_parts.append(df_caso6[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    # Caso 2 y 4: Ultimo log inconsistente con estado de subs
    idx_last = log_filtered.groupby("orden")["f_dt"].idxmax()
    df_last_logs = log_filtered.loc[idx_last, ["orden", "f_dt", "estado"]].copy()
    df_last_logs.columns = ["orden", "f_dt", "ultimo_estado_log"]
    merged = df_last_logs.merge(
        df_subs_full[["orden", "estado"]], on="orden", how="inner"
    )
    merged.columns = ["orden", "f_dt", "ultimo_estado_log", "estado_subs"]

    # Caso 2: ultimo log inactivo, subs activa
    mask_caso2 = (
        merged["ultimo_estado_log"].isin(INACTIVE_STATES)
        & (merged["estado_subs"] == ACTIVE_STATE)
    )
    df_caso2 = merged[mask_caso2].copy()
    if not df_caso2.empty:
        df_caso2["f_dt"] = df_caso2["f_dt"] + pd.Timedelta(seconds=1)
        df_caso2["fecha"] = df_caso2["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
        df_caso2["nota"] = "sintetico - ultimo log inactivo, sub activa"
        df_caso2["log_norm"] = "sintetico - ultimo log inactivo, sub activa"
        df_caso2["estado"] = ACTIVE_STATE
        df_caso2["estado_origen"] = None
        df_caso2["_sintetico"] = True
        synth_parts.append(df_caso2[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    # Caso 4: ultimo log activo, subs inactiva (no 0_other)
    mask_caso4 = (
        (merged["ultimo_estado_log"] == ACTIVE_STATE)
        & (merged["estado_subs"] != ACTIVE_STATE)
        & (merged["estado_subs"] != EXCLUDED_STATE)
    )
    df_caso4 = merged[mask_caso4].copy()
    if not df_caso4.empty:
        df_caso4["f_dt"] = df_caso4["f_dt"] + pd.Timedelta(seconds=1)
        df_caso4["fecha"] = df_caso4["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
        df_caso4["nota"] = "sintetico - ultimo log activo, sub inactiva"
        df_caso4["log_norm"] = "sintetico - ultimo log activo, sub inactiva"
        df_caso4["estado"] = df_caso4["estado_subs"]
        df_caso4["estado_origen"] = None
        df_caso4["_sintetico"] = True
        synth_parts.append(df_caso4[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    if synth_parts:
        df_synth = pd.concat(synth_parts, ignore_index=True)
        df_clean_logs = pd.concat([log_filtered, df_synth], ignore_index=True, sort=False)
    else:
        df_clean_logs = log_filtered

    df_clean_logs = df_clean_logs.sort_values(["orden", "f_dt"])
    df_clean_logs["estado_origen"] = (
        df_clean_logs.groupby("orden")["estado"].shift(1)
    )

    ordens_con_activity: Set[str] = set(
        df_clean_logs[df_clean_logs["estado"] == ACTIVE_STATE]["orden"]
    )

    return df_clean_logs, ordens_con_activity
