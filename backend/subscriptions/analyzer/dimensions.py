from __future__ import annotations
from typing import Dict, List
import pandas as pd
from ...config import TableNames


def aggregate_dimensions(
    db, periodo, act_ini, act_fin, nuevos, df_bajas,
    df_inactivos, df_react_all, df_corte_impagado,
    df_react_not_in_ini=None,
):
    periodo_label = periodo.label()
    DIMS = ["zona", "sucursal", "municipio", "campanna", "producto"]

    df_subs = db.read_table(TableNames.SUBSCRIPCIONES)
    df_subs.columns = df_subs.columns.str.lower()
    for c in ["orden_producto"] + DIMS:
        if c in df_subs.columns:
            df_subs[c] = df_subs[c].astype(str).str.strip()

    df_subs_dedup = df_subs.drop_duplicates(subset=["orden_producto"])

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
        d_corte = cnt(df_corte_impagado.drop_duplicates(subset=["orden"]))
        ini_ordens = set(act_ini["orden"].astype(str).str.strip()) if not act_ini.empty else set()
        d_react_6 = cnt(pd.DataFrame({"orden": react_by_origin["6_churn"][~react_by_origin["6_churn"].isin(ini_ordens)]}))
        d_react_8 = cnt(pd.DataFrame({"orden": react_by_origin["8_30days"][~react_by_origin["8_30days"].isin(ini_ordens)]}))
        react_4_series = react_by_origin["4_paused"]
        if not act_ini.empty and not react_4_series.empty:
            react_4_in_ini = react_4_series[react_4_series.isin(ini_ordens)]
            react_4_not_in_ini_4 = react_4_series[~react_4_series.isin(ini_ordens)]
        else:
            react_4_in_ini = pd.Series(dtype=str)
            react_4_not_in_ini_4 = pd.Series(dtype=str)
        d_react_4_P = cnt(pd.DataFrame({"orden": react_4_in_ini}))
        d_react_4_H = cnt(pd.DataFrame({"orden": react_4_not_in_ini_4}))
        react_sin_series = df_react_all[df_react_all["estado_origen"] == "reactivacion_sin_origen"]["orden"] if not df_react_all.empty else pd.Series(dtype=str)
        if not act_ini.empty and not react_sin_series.empty:
            react_sin_not_ini = react_sin_series[~react_sin_series.isin(ini_ordens)]
        else:
            react_sin_not_ini = pd.Series(dtype=str)
        d_react_sin = cnt(pd.DataFrame({"orden": react_sin_not_ini}))
        d_react_not_in_ini = cnt(df_react_not_in_ini) if df_react_not_in_ini is not None and not df_react_not_in_ini.empty else {}

        valores = sorted(set(
            list(d_act_ini) + list(d_act_fin) + list(d_nuevos)
            + list(d_bajas) + list(d_inact) + list(d_react)
            + list(d_corte) + list(d_react_6) + list(d_react_8) + list(d_react_4_P) + list(d_react_4_H) + list(d_react_sin)
        ))

        for val in valores:
            a_ini = d_act_ini.get(val, 0)
            a_fin = d_act_fin.get(val, 0)
            nv = d_nuevos.get(val, 0)
            bn = max(0, d_act_ini.get(val, 0) - (d_act_fin.get(val, 0) - d_nuevos.get(val, 0)))
            bb = bn + d_react_not_in_ini.get(val, 0)
            inac = d_inact.get(val, 0)
            reac = d_react.get(val, 0)
            react_val = d_react_6.get(val, 0) + d_react_8.get(val, 0) + d_react_4_H.get(val, 0) + d_react_sin.get(val, 0)

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
                "react_4_paused": d_react_4_P.get(val, 0) + d_react_4_H.get(val, 0),
                "react_4_P": d_react_4_P.get(val, 0),
                "react_4_H": d_react_4_H.get(val, 0),
                "total_inactivos": inac,
                "reactivaciones": reac,
                "react_val": react_val,
                "tasa_aporte_react_pct": round((react_val / (nv + react_val)) * 100, 4) if (nv + react_val) > 0 else 0,
                "indice_reemplazo_react_pct": round((react_val / bn) * 100, 4) if bn > 0 else 0,
                "adiciones_netas": nv - bn,
                "adiciones_brutas": (nv + d_react_not_in_ini.get(val, 0)) - bn,
                "tasa_winback_pct": round((reac / inac) * 100, 4) if inac > 0 else 0,
                "corte_impagado": d_corte.get(val, 0),
                "porcentaje_suspensiones": round((d_corte.get(val, 0) / a_ini) * 100, 4) if a_ini > 0 else 0,
                "total_billing": billing_val,
                "arpu": round(billing_val / a_fin, 2) if a_fin > 0 else 0.0,
            })

    df_result = pd.DataFrame(all_rows)
    db.save_historico(df_result, TableNames.ANALYZER_CHURN_DIMENSIONES, periodo_label)

    dims_ok = [d for d in DIMS if d in df_subs.columns]
    print(
        f"\nDIMENSIONES | {len(dims_ok)} calculadas:"
        f" {', '.join(dims_ok)}"
        f" | {len(all_rows)} filas en analyzer_churn_dimensiones"
    )
