from __future__ import annotations

import json
from typing import Any

import pandas as pd

from .km_utils import compute_km
from .loader import DIMS


def compute_dimension_metrics(subs: pd.DataFrame, periods: pd.DataFrame) -> pd.DataFrame:
    if periods.empty:
        return pd.DataFrame()

    rows: list[dict[str, Any]] = []
    subs_dedup = subs.drop_duplicates(subset=["orden"]).copy()

    subs_dedup["zona"] = subs_dedup["zona"].fillna("Sin Zona").astype(str).str.strip()
    subs_dedup["sucursal"] = subs_dedup["sucursal"].fillna("Sin Sucursal").astype(str).str.strip()
    subs_dedup["zona_sucursal"] = subs_dedup["zona"] + " - " + subs_dedup["sucursal"]
    
    # Extraemos solo las dimensiones existentes
    dim_cols = [col for col in DIMS if col in subs_dedup.columns]
    if not dim_cols:
        return pd.DataFrame()
        
    subs_slice = subs_dedup[["orden"] + dim_cols].copy()
    
    # Separamos activos y cancelados
    active_periods = periods[periods["tipo"] == "activo"].copy()
    canceled_periods = periods[periods["tipo"] == "cancelado"].copy()
    
    # Primer activo por suscriptor
    first_active = (
        active_periods.sort_values(["orden", "periodo_idx"])
        .drop_duplicates(subset=["orden"], keep="first")
    )
    
    # OPTIMIZACIÓN 1: Unimos las dimensiones vectorialmente de una sola pasada
    first_active = first_active.merge(subs_slice, on="orden", how="left")
    canceled_periods = canceled_periods.merge(subs_slice, on="orden", how="left")

    # OPTIMIZACIÓN 2: Evitamos ajustar Kaplan-Meier en grupos irrelevantes o de ruido
    MIN_COHORT_SIZE = 15 

    for dim in dim_cols:
        default = f"Sin {dim}"
        
        first_active[dim] = first_active[dim].fillna(default)
        canceled_periods[dim] = canceled_periods[dim].fillna(default)
        
        # Agrupamos eficientemente
        grouped_act = first_active.groupby(dim, sort=False)
        grouped_can = canceled_periods.groupby(dim, sort=False)
        
        can_groups = {name: grp for name, grp in grouped_can}

        for dim_val, grp_act in grouped_act:
            n_act = len(grp_act)
            if n_act < MIN_COHORT_SIZE:
                continue  # Omitir subgrupos minúsculos ahorra el 80% del overhead estadístico
            
            # Kaplan-Meier Activo (deshabilitando intervalos de confianza Greenwood)
            km_act = compute_km(grp_act["duracion"], grp_act["evento"], dim_val, calculate_ci=False)

            grp_can = can_groups.get(dim_val)
            if grp_can is not None and not grp_can.empty:
                grp_react = grp_can[(grp_can["evento"] == 1) & (grp_can["duracion"] >= 15)]
            else:
                grp_react = pd.DataFrame()

            n_react = len(grp_react)
            if n_react >= MIN_COHORT_SIZE:
                prom_react = round(float(grp_react["duracion"].mean()), 1)
                # Kaplan-Meier Reactivación sin CI
                km_react = compute_km(grp_react["duracion"], grp_react["evento"], dim_val, calculate_ci=False)
            else:
                prom_react = n_react = None
                km_react = {
                    "mediana": None, "p25": None, "p75": None,
                    "n_total": 0, "n_evento": 0, "n_censurado": 0, "curva": []
                }

            rows.append({
                "dimension": dim, 
                "valor": dim_val,
                "mediana_activo": km_act["mediana"],
                "p25_activo": km_act["p25"],
                "p75_activo": km_act["p75"],
                "curva_activo_json": json.dumps(km_act["curva"]),
                "n_total_activo": km_act["n_total"],
                "n_evento_activo": km_act["n_evento"],
                "n_censurado_activo": km_act["n_censurado"],
                "promedio_reactivacion": prom_react,
                "mediana_reactivacion": km_react["mediana"],
                "p25_reactivacion": km_react["p25"],
                "p75_reactivacion": km_react["p75"],
                "n_total_reactivacion": n_react,
                "n_evento_reactivacion": km_react["n_evento"],
                "n_censurado_reactivacion": km_react["n_censurado"],
                "curva_reactivacion_json": json.dumps(km_react["curva"]),
            })

    return pd.DataFrame(rows)