from __future__ import annotations
from typing import Any, Dict, List
import pandas as pd
from core.config import ACTIVE_STATE, INACTIVE_STATES
from .km_utils import compute_km

RELEVANT_STATES = {ACTIVE_STATE} | INACTIVE_STATES

def build_lifecycle_periods(subs: pd.DataFrame, logs: pd.DataFrame) -> pd.DataFrame:
    relevant = logs[logs["estado"].isin(RELEVANT_STATES)].copy()
    if relevant.empty:
        return pd.DataFrame(columns=["orden", "tipo", "f_inicio", "f_fin", "duracion", "evento", "periodo_idx"])
        
    relevant = relevant.sort_values(["orden", "f_dt"]).reset_index(drop=True)
    
    # OPTIMIZACIÓN 1: Convertimos fechas a float (días desde 1970-01-01) vectorialmente (0.01 segundos)
    epoch = pd.Timestamp("1970-01-01")
    relevant["f_days"] = (relevant["f_dt"] - epoch) / pd.Timedelta(days=1)
    last_global_days = float(relevant["f_days"].max())
    
    # Mapeamos fecha de inicio de suscripciones a días flotantes
    subs_ini_days = (subs.set_index("orden")["f_ini_dt"] - epoch) / pd.Timedelta(days=1)
    f_ini_map = subs_ini_days.to_dict()

    # Convertimos a arrays de NumPy para evitar llamadas al índice de Pandas en el bucle
    orden_arr = relevant["orden"].to_numpy()
    estado_arr = relevant["estado"].to_numpy()
    fdays_arr = relevant["f_days"].to_numpy()

    # Agrupamos en estructura nativa
    grouped_events: Dict[str, List[tuple[str, float]]] = {}
    for i in range(len(orden_arr)):
        grouped_events.setdefault(orden_arr[i], []).append((estado_arr[i], fdays_arr[i]))

    rows: List[Dict[str, Any]] = []

    for orden, events in grouped_events.items():
        f_ini = f_ini_map.get(orden)
        if pd.isna(f_ini):
            continue
            
        active_start = float(f_ini)
        inactive_start = None
        prev_state = None
        prev_was_inactive = False
        pidx = 0

        # El bucle ahora procesa únicamente floats (aritmética pura en C, velocidad máxima)
        for st, fecha in events:
            if st == ACTIVE_STATE:
                if prev_was_inactive:
                    dur = int(max(fecha - inactive_start, 0))
                    rows.append({
                        "orden": orden, "tipo": "cancelado",
                        "f_inicio_days": inactive_start, "f_fin_days": fecha,
                        "duracion": dur, "evento": 1, "periodo_idx": pidx
                    })
                    pidx += 1
                    active_start = fecha
                elif prev_state is None:
                    dur_a = int(max(fecha - active_start, 0))
                    if dur_a > 0:
                        rows.append({
                            "orden": orden, "tipo": "activo",
                            "f_inicio_days": active_start, "f_fin_days": fecha,
                            "duracion": dur_a, "evento": 1, "periodo_idx": pidx
                        })
                        pidx += 1
                        active_start = fecha
                prev_state = ACTIVE_STATE
                prev_was_inactive = False
            elif st in INACTIVE_STATES:
                if not prev_was_inactive and prev_state == ACTIVE_STATE:
                    dur = int(max(fecha - active_start, 0))
                    rows.append({
                        "orden": orden, "tipo": "activo",
                        "f_inicio_days": active_start, "f_fin_days": fecha,
                        "duracion": dur, "evento": 1, "periodo_idx": pidx
                    })
                    pidx += 1
                    inactive_start = fecha
                elif prev_state is None:
                    inactive_start = fecha
                prev_state = st
                prev_was_inactive = True

        if not prev_was_inactive and prev_state == ACTIVE_STATE:
            dur = int(max(last_global_days - active_start, 0))
            rows.append({
                "orden": orden, "tipo": "activo",
                "f_inicio_days": active_start, "f_fin_days": last_global_days,
                "duracion": dur, "evento": 0, "periodo_idx": pidx
            })
        elif prev_was_inactive:
            dur = int(max(last_global_days - inactive_start, 0))
            rows.append({
                "orden": orden, "tipo": "cancelado",
                "f_inicio_days": inactive_start, "f_fin_days": last_global_days,
                "duracion": dur, "evento": 0, "periodo_idx": pidx
            })

    if not rows:
        return pd.DataFrame(columns=["orden", "tipo", "f_inicio", "f_fin", "duracion", "evento", "periodo_idx"])

    df_res = pd.DataFrame(rows)
    
    # OPTIMIZACIÓN 2: Reconvertimos floats a fechas reales vectorialmente en un solo paso al finalizar
    df_res["f_inicio"] = pd.to_datetime(df_res["f_inicio_days"], unit="D", origin="1970-01-01")
    df_res["f_fin"] = pd.to_datetime(df_res["f_fin_days"], unit="D", origin="1970-01-01")
    
    df_res.drop(columns=["f_inicio_days", "f_fin_days"], inplace=True)
    return df_res

def compute_metrics(periods: pd.DataFrame) -> Dict[str, Any]:
    result: Dict[str, Any] = {}

    first_active = (
        periods[periods["tipo"] == "activo"]
        .sort_values(["orden", "periodo_idx"])
        .groupby("orden").first().reset_index()
    )
    if not first_active.empty:
        km_act = compute_km(first_active["duracion"], first_active["evento"], "Primer periodo activo")
        result["curva_activo"] = km_act["curva"]
        result["mediana_activo"] = km_act["mediana"]
        result["promedio_activo"] = round(float(first_active["duracion"].mean()), 1)
        result["p25_activo"] = km_act["p25"]
        result["p75_activo"] = km_act["p75"]
        result["n_total_activo"] = km_act["n_total"]
        result["n_evento_activo"] = km_act["n_evento"]
        result["n_censurado_activo"] = km_act["n_censurado"]
    else:
        for k in ["curva_activo", "mediana_activo", "promedio_activo",
                   "p25_activo", "p75_activo",
                   "n_total_activo", "n_evento_activo", "n_censurado_activo"]:
            result[k] = None

    can = periods[periods["tipo"] == "cancelado"].copy()
    react = can[can["evento"] == 1].copy()
    react = react[react["duracion"] >= 15]
    if not react.empty:
        result["promedio_reactivacion"] = round(float(react["duracion"].mean()), 1)
        result["n_total_reactivacion"] = int(len(react))
        km_react = compute_km(react["duracion"], react["evento"], "Reactivacion")
        result["mediana_reactivacion"] = km_react["mediana"]
        result["p25_reactivacion"] = km_react["p25"]
        result["p75_reactivacion"] = km_react["p75"]
        result["curva_reactivacion"] = km_react["curva"]
        result["n_evento_reactivacion"] = km_react["n_evento"]
        result["n_censurado_reactivacion"] = km_react["n_censurado"]
    else:
        for k in ["promedio_reactivacion", "n_total_reactivacion",
                   "mediana_reactivacion", "p25_reactivacion", "p75_reactivacion",
                   "curva_reactivacion", "n_evento_reactivacion",
                   "n_censurado_reactivacion"]:
            result[k] = None

    if not periods.empty:
        ciclos = (
            periods[periods["tipo"] == "activo"]
            .groupby("orden").size()
        )
        result["ciclos_por_suscriptor"] = {
            "min": int(ciclos.min()) if len(ciclos) else 0,
            "max": int(ciclos.max()) if len(ciclos) else 0,
            "mediana": float(ciclos.median()) if len(ciclos) else 0,
            "promedio": float(ciclos.mean()) if len(ciclos) else 0,
        }
    else:
        result["ciclos_por_suscriptor"] = {}

    suscriptores_con_evento = set(first_active[first_active["evento"] == 1]["orden"])
    if not first_active.empty:
        todos = set(first_active["orden"])
        nunca_inactivos = todos - suscriptores_con_evento
        result["suscriptores_nunca_inactivos"] = len(nunca_inactivos)
        result["suscriptores_totales"] = len(todos)
    else:
        result["suscriptores_nunca_inactivos"] = 0
        result["suscriptores_totales"] = 0

    return result
