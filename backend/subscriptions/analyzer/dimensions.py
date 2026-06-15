from __future__ import annotations
from typing import Any, Dict, List, Set
import pandas as pd
from ...config import AUDIT_REACT_ORIGINS


def aggregate_dimensions(
    db, periodo, act_ini, act_fin, nuevos, df_bajas,
    df_inactivos, df_react_all, df_corte_impagado, set_react_audit,
):
    """Agrega los indicadores por cada dimension (zona, sucursal, municipio, campanna, producto)."""
    periodo_label = periodo.label()
    DIMS = ["zona", "sucursal", "municipio", "campanna", "producto"]

    df_subs = db.read_table("Subscripciones")
    df_subs.columns = df_subs.columns.str.lower()
    for c in ["orden_producto"] + DIMS:
        if c in df_subs.columns:
            df_subs[c] = df_subs[c].astype(str).str.strip()

    df_subs_dedup = df_subs.drop_duplicates(subset=["orden_producto"])

    df_react_audit = (
        df_react_all[df_react_all["estado_origen"].isin(AUDIT_REACT_ORIGINS)]
        if not df_react_all.empty
        else pd.DataFrame()
    )

    react_by_origin = {
        o: (
            df_react_all[df_react_all["estado_origen"] == o]["orden"]
            if not df_react_all.empty
            else pd.Series(dtype=str)
        )
        for o in ["6_churn", "8_30days", "4_paused"]
    }

    all_rows: List[Dict] = []

    for dim in DIMS:
        if dim not in df_subs.columns:
            continue

        default = f"Sin {dim}"
        map_dict = (
            df_subs_dedup.dropna(subset=[dim])
            .set_index("orden_producto")[dim]
            .to_dict()
        )

        def cnt(df_ords):
            if df_ords is None or (hasattr(df_ords, "empty") and df_ords.empty):
                return {}
            s = df_ords["orden"].astype(str).str.strip()
            return s.map(map_dict).fillna(default).value_counts().to_dict()

        billing_global = pd.to_numeric(
            df_subs_dedup.set_index("orden_producto")["total"],
            errors="coerce",
        ).fillna(0.0)

        d_act_ini = cnt(act_ini)
        d_act_fin = cnt(act_fin)
        d_nuevos = cnt(nuevos)
        d_bajas = cnt(df_bajas)
        d_inact = cnt(df_inactivos)
        d_react = cnt(df_react_all)
        d_react_aud = cnt(df_react_audit)
        d_corte = cnt(df_corte_impagado)
        d_react_6 = cnt(pd.DataFrame({"orden": react_by_origin["6_churn"]}))
        d_react_8 = cnt(pd.DataFrame({"orden": react_by_origin["8_30days"]}))
        d_react_4 = cnt(pd.DataFrame({"orden": react_by_origin["4_paused"]}))

        valores = sorted(set(
            list(d_act_ini) + list(d_act_fin) + list(d_nuevos)
            + list(d_bajas) + list(d_inact) + list(d_react)
            + list(d_corte) + list(d_react_6) + list(d_react_8) + list(d_react_4)
        ))

        for val in valores:
            a_ini = d_act_ini.get(val, 0)
            a_fin = d_act_fin.get(val, 0)
            nv = d_nuevos.get(val, 0)
            bn = d_bajas.get(val, 0)
            bb = bn + d_react_aud.get(val, 0)
            inac = d_inact.get(val, 0)
            reac = d_react.get(val, 0)
            react_6_8_count = d_react_6.get(val, 0) + d_react_8.get(val, 0)

            billing_val = 0
            if a_fin > 0 and not act_fin.empty:
                ordens_fin = act_fin["orden"].astype(str).str.strip()
                mask = ordens_fin.map(map_dict).fillna(default) == val
                billing_val = round(
                    billing_global.reindex(ordens_fin[mask]).fillna(0).sum(), 2
                )

            all_rows.append({
                "dimension": dim,
                "valor": val,
                "activos_inicio": a_ini,
                "activos_final": a_fin,
                "nuevos": nv,
                "bajas_netas": bn,
                "churn_neto_pct": round((bn / a_ini) * 100, 4) if a_ini > 0 else 0,
                "bajas_brutas": bb,
                "churn_bruto_pct": round((bb / a_ini) * 100, 4) if a_ini > 0 else 0,
                "react_6_churn": d_react_6.get(val, 0),
                "react_8_30days": d_react_8.get(val, 0),
                "react_4_paused": d_react_4.get(val, 0),
                "total_inactivos": inac,
                "reactivaciones": reac,
                "react_6_8": react_6_8_count,
                "tasa_aporte_react_pct": round((react_6_8_count / (nv + react_6_8_count)) * 100, 4) if (nv + react_6_8_count) > 0 else 0,
                "indice_reemplazo_react_pct": round((react_6_8_count / bn) * 100, 4) if bn > 0 else 0,
                "adiciones_brutas": nv - bn,
                "adiciones_netas": (nv + react_6_8_count) - bn,
                "tasa_winback_pct": round((reac / inac) * 100, 4) if inac > 0 else 0,
                "corte_impagado": d_corte.get(val, 0),
                "total_billing": billing_val,
                "arpu": round(billing_val / a_fin, 2) if a_fin > 0 else 0.0,
            })

    df_result = pd.DataFrame(all_rows)
    db.save_historico(df_result, "analyzer_churn_dimensiones", periodo_label)

    dims_ok = [d for d in DIMS if d in df_subs.columns]
    print(
        f"\nDIMENSIONES | {len(dims_ok)} calculadas:"
        f" {', '.join(dims_ok)}"
        f" | {len(all_rows)} filas en analyzer_churn_dimensiones"
    )
