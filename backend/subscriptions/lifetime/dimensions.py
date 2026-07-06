from __future__ import annotations
import json
from typing import Any, Dict, List
import pandas as pd
from .km_utils import compute_km
from .loader import DIMS


def compute_dimension_metrics(subs: pd.DataFrame, periods: pd.DataFrame) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    subs_dedup = subs.drop_duplicates(subset=["orden"]).set_index("orden")

    first_active = (
        periods[periods["tipo"] == "activo"]
        .sort_values(["orden", "periodo_idx"])
        .groupby("orden").first().reset_index()
    )
    canceled = periods[periods["tipo"] == "cancelado"].copy()

    for dim in DIMS:
        if dim not in subs_dedup.columns:
            continue
        default = f"Sin {dim}"
        dim_map = subs_dedup[dim].fillna(default).to_dict()

        first_active_d = first_active.copy()
        first_active_d["_dim"] = first_active_d["orden"].map(dim_map).fillna(default)
        canceled_d = canceled.copy()
        canceled_d["_dim"] = canceled_d["orden"].map(dim_map).fillna(default)

        for dim_val in first_active_d["_dim"].unique():
            grp_act = first_active_d[first_active_d["_dim"] == dim_val]
            grp_can = canceled_d[canceled_d["_dim"] == dim_val]

            if grp_act.empty:
                continue

            km_act = compute_km(grp_act["duracion"], grp_act["evento"], dim_val)

            grp_react = grp_can[grp_can["evento"] == 1].copy()
            grp_react = grp_react[grp_react["duracion"] >= 15]
            if not grp_react.empty:
                prom_react = round(float(grp_react["duracion"].mean()), 1)
                n_react = int(len(grp_react))
                km_react = compute_km(grp_react["duracion"], grp_react["evento"], dim_val)
            else:
                prom_react = n_react = None
                km_react = {"mediana": None, "p25": None, "p75": None,
                            "n_total": 0, "n_evento": 0, "n_censurado": 0, "curva": []}

            rows.append({
                "dimension": dim, "valor": dim_val,
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
