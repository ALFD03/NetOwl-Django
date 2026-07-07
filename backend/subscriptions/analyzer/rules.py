from __future__ import annotations
from typing import Set
import pandas as pd
from ...conf_config import ACTIVE_STATE, CORTE_IMPAGADO_EVENT, EXCLUDED_STATE, INACTIVE_STATES

def apply_log_rules(df_clean_logs: pd.DataFrame, df_subs_full: pd.DataFrame):
    valid_ordens = set(df_subs_full["orden"].to_numpy())
    log_filtered = df_clean_logs[df_clean_logs["orden"].isin(valid_ordens)].copy()
    log_filtered["_sintetico"] = False
    
    # Ordenamos una sola vez al inicio
    log_filtered = log_filtered.sort_values(["orden", "f_dt"]).reset_index(drop=True)
    
    synth_parts = []

    # Caso 5: Primer log es corte de impago
    # Obtenemos el índice del primer log de manera vectorizada
    first_idx = log_filtered.groupby("orden", sort=False)["f_dt"].idxmin()
    df_first_logs = log_filtered.loc[first_idx]
    
    mask_caso5 = df_first_logs["log_norm"].str.contains(CORTE_IMPAGADO_EVENT, na=False)
    ordenes_caso5 = set(df_first_logs.loc[mask_caso5, "orden"].to_numpy())
    
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

    # Caso 1: Sin logs históricos
    ordenes_con_log = set(log_filtered["orden"].to_numpy())
    df_no_logs = df_subs_full[~df_subs_full["orden"].isin(ordenes_con_log)].copy()
    df_no_logs = df_no_logs[df_no_logs["estado"] != EXCLUDED_STATE]
    
    if not df_no_logs.empty:
        df_no_logs["f_dt"] = df_no_logs["f_ini_dt"].fillna(pd.Timestamp("1900-01-01"))
        df_no_logs["fecha"] = df_no_logs["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
        df_no_logs["nota"] = "sintetico - sin logs historicos"
        df_no_logs["log_norm"] = "sintetico - sin logs historicos"
        df_no_logs["estado_origen"] = None
        df_no_logs["_sintetico"] = True
        synth_parts.append(df_no_logs[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    # Caso 6: Log inactivo seguido de corte por impago
    # Usamos shift() vectorizado de Pandas en lugar de agrupar repetitivamente
    log_filtered["next_log_norm"] = log_filtered["log_norm"].shift(-1)
    log_filtered["next_orden"] = log_filtered["orden"].shift(-1)
    
    mask_caso6 = (
        log_filtered["estado"].isin(INACTIVE_STATES) &
        log_filtered["next_log_norm"].str.contains(CORTE_IMPAGADO_EVENT, na=False) &
        (log_filtered["orden"] == log_filtered["next_orden"])
    )
    df_caso6 = log_filtered[mask_caso6].copy()
    if not df_caso6.empty:
        df_caso6["f_dt"] = df_caso6["f_dt"] + pd.Timedelta(seconds=1)
        df_caso6["fecha"] = df_caso6["f_dt"].dt.strftime("%Y-%m-%d %H:%M:%S")
        df_caso6["nota"] = "sintetico - activo entre inactivo y corte impago"
        df_caso6["log_norm"] = "sintetico - activo entre inactivo y corte impago"
        df_caso6["estado"] = ACTIVE_STATE
        df_caso6["estado_origen"] = None
        df_caso6["_sintetico"] = True
        synth_parts.append(df_caso6[["orden", "fecha", "nota", "estado", "f_dt", "log_norm", "estado_origen", "_sintetico"]])

    # Removemos columnas auxiliares de log_filtered
    log_filtered.drop(columns=["next_log_norm", "next_orden"], inplace=True)

    # Casos 2 y 4: Inconsistencias entre el estado de suscripción y el último log
    last_idx = log_filtered.groupby("orden", sort=False)["f_dt"].idxmax()
    df_last_logs = log_filtered.loc[last_idx, ["orden", "f_dt", "estado"]].copy()
    df_last_logs.rename(columns={"estado": "ultimo_estado_log"}, inplace=True)
    
    merged = df_last_logs.merge(
        df_subs_full[["orden", "estado"]], on="orden", how="inner"
    )
    merged.rename(columns={"estado": "estado_subs"}, inplace=True)

    # Caso 2: Último log inactivo, suscripción activa
    mask_caso2 = merged["ultimo_estado_log"].isin(INACTIVE_STATES) & (merged["estado_subs"] == ACTIVE_STATE)
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

    # Caso 4: Último log activo, suscripción inactiva
    mask_caso4 = (
        (merged["ultimo_estado_log"] == ACTIVE_STATE) & 
        (merged["estado_subs"] != ACTIVE_STATE) & 
        (merged["estado_subs"] != EXCLUDED_STATE)
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

    # Combinación final limpia
    if synth_parts:
        df_synth_all = pd.concat(synth_parts, ignore_index=True, sort=False)
        df_clean_logs = pd.concat([log_filtered, df_synth_all], ignore_index=True, sort=False)
    else:
        df_clean_logs = log_filtered

    df_clean_logs = df_clean_logs.sort_values(["orden", "f_dt"]).reset_index(drop=True)
    df_clean_logs["estado_origen"] = df_clean_logs.groupby("orden", sort=False)["estado"].shift(1)

    ordens_con_activity = set(
        df_clean_logs.loc[df_clean_logs["estado"] == ACTIVE_STATE, "orden"].to_numpy()
    )

    return df_clean_logs, ordens_con_activity