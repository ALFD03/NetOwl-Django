from __future__ import annotations
from typing import Any, Dict, List
import pandas as pd
from ...config import ACTIVE_STATE, INACTIVE_STATES
from .km_utils import compute_km


RELEVANT_STATES = {ACTIVE_STATE} | INACTIVE_STATES


def build_lifecycle_periods(subs: pd.DataFrame, logs: pd.DataFrame) -> pd.DataFrame:
    """Construye periodos de vida activo/cancelado por suscriptor.

    Returns:
        DataFrame con columnas: orden, tipo, f_inicio, f_fin, duracion, evento, periodo_idx.
    """
    relevant = logs[logs["estado"].isin(RELEVANT_STATES)].copy()
    last_global = relevant["f_dt"].max()
    f_ini_map = subs.set_index("orden")["f_ini_dt"].to_dict()

    rows: List[Dict[str, Any]] = []

    for orden, group in relevant.groupby("orden"):
        if orden not in f_ini_map:
            continue
        f_ini = f_ini_map[orden]
        if pd.isna(f_ini):
            continue
        group = group.sort_values("f_dt")
        estados = group["estado"].tolist()
        fechas = group["f_dt"].tolist()

        active_start = f_ini
        inactive_start = None
        prev_state = None
        prev_was_inactive = False
        pidx = 0

        for st, fecha in zip(estados, fechas):
            if st == ACTIVE_STATE:
                if prev_was_inactive:
                    dur = max((fecha - inactive_start).days, 0)
                    rows.append({"orden": orden, "tipo": "cancelado",
                                 "f_inicio": inactive_start, "f_fin": fecha,
                                 "duracion": dur, "evento": 1, "periodo_idx": pidx})
                    pidx += 1
                    active_start = fecha
                elif prev_state is None:
                    dur_a = max((fecha - active_start).days, 0)
                    if dur_a > 0:
                        rows.append({"orden": orden, "tipo": "activo",
                                     "f_inicio": active_start, "f_fin": fecha,
                                     "duracion": dur_a, "evento": 1, "periodo_idx": pidx})
                        pidx += 1
                        active_start = fecha
                prev_state = ACTIVE_STATE
                prev_was_inactive = False
            elif st in INACTIVE_STATES:
                if not prev_was_inactive and prev_state == ACTIVE_STATE:
                    dur = max((fecha - active_start).days, 0)
                    rows.append({"orden": orden, "tipo": "activo",
                                 "f_inicio": active_start, "f_fin": fecha,
                                 "duracion": dur, "evento": 1, "periodo_idx": pidx})
                    pidx += 1
                    inactive_start = fecha
                elif prev_state is None:
                    inactive_start = fecha
                prev_state = st
                prev_was_inactive = True

        if not prev_was_inactive and prev_state == ACTIVE_STATE:
            dur = max((last_global - active_start).days, 0)
            rows.append({"orden": orden, "tipo": "activo",
                         "f_inicio": active_start, "f_fin": last_global,
                         "duracion": dur, "evento": 0, "periodo_idx": pidx})
        elif prev_was_inactive:
            dur = max((last_global - inactive_start).days, 0)
            rows.append({"orden": orden, "tipo": "cancelado",
                         "f_inicio": inactive_start, "f_fin": last_global,
                         "duracion": dur, "evento": 0, "periodo_idx": pidx})

    return pd.DataFrame(rows)


def compute_metrics(periods: pd.DataFrame) -> Dict[str, Any]:
    """Calcula metricas globales de ciclo de vida."""
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
