from __future__ import annotations
import json
from typing import Any, Dict, List
import pandas as pd
from .km_utils import compute_km
from .loader import DIMS

def compute_dimension_metrics(subs: pd.DataFrame, periods: pd.DataFrame) -> pd.DataFrame:
    if periods.empty:
        return pd.DataFrame()

    rows: List[Dict[str, Any]] = []
    # Deduplicamos y mapeamos los suscriptores a un diccionario para consultas de alta velocidad
    subs_dedup = subs.drop_duplicates(subset=["orden"])
    
    # Extraemos el primer registro activo por orden
    first_active = (
        periods[periods["tipo"] == "activo"]
        .sort_values(["orden", "periodo_idx"])
        .drop_duplicates(subset=["orden"], keep="first")
    )
    canceled = periods[periods["tipo"] == "cancelado"]

    for dim in DIMS:
        if dim not in subs_dedup.columns:
            continue
            
        default = f"Sin {dim}"
        # Mapeo directo indexado
        dim_map = subs_dedup.set_index("orden")[dim].fillna(default).to_dict()

        # Asignamos las dimensiones correspondientes de manera vectorizada
        first_active_d = first_active.copy()
        first_active_d["_dim"] = first_active_d["orden"].map(dim_map).fillna(default)
        
        canceled_d = canceled.copy()
        canceled_d["_dim"] = canceled_d["orden"].map(dim_map).fillna(default)

        # OPTIMIZACIÓN: Agrupamos por dimensión usando groupby nativo en lugar de bucles de filtro manual
        grouped_act = first_active_d.groupby("_dim", sort=False)
        grouped_can = canceled_d.groupby("_dim", sort=False)

        # Almacenamos grupos cancelados en un diccionario para búsquedas rápidas
        can_groups = {name: grp for name, grp in grouped_can}

        for dim_val, grp_act in grouped_act:
            if grp_act.empty:
                continue

            # Kaplan-Meier para el grupo activo de la dimensión
            km_act = compute_km(grp_act["duracion"], grp_act["evento"], dim_val)

            # Buscamos de manera instantánea el grupo cancelado correspondiente
            grp_can = can_groups.get(dim_val)
            
            # Filtramos reactivaciones del grupo de forma rápida
            if grp_can is not None and not grp_can.empty:
                grp_react = grp_can[(grp_can["evento"] == 1) & (grp_can["duracion"] >= 15)]
            else:
                grp_react = pd.DataFrame()

            if not grp_react.empty:
                prom_react = round(float(grp_react["duracion"].mean()), 1)
                n_react = int(len(grp_react))
                km_react = compute_km(grp_react["duracion"], grp_react["evento"], dim_val)
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
