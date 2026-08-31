from __future__ import annotations
from typing import Dict, List
import pandas as pd
from ...conf_config import TableNames


DIMS = ["zona", "sucursal", "municipio", "campanna", "producto", "zona_sucursal"]


def prepare_subs_dims(db, df_subs_full=None):
    """Normaliza el frame de suscripciones para el mapeo de dimensiones.

    No depende del periodo, asi que se calcula una vez y se reutiliza en todos
    los cortes diarios en lugar de rehacerlo 31 veces.
    """
    has_dims = df_subs_full is not None and all(d in df_subs_full.columns for d in DIMS[:-1])

    if has_dims:
        df_subs_dedup = df_subs_full.copy()
        # Restauramos el nombre original de la columna clave para compatibilidad
        if "orden" in df_subs_dedup.columns and "orden_producto" not in df_subs_dedup.columns:
            df_subs_dedup.rename(columns={"orden": "orden_producto"}, inplace=True)
    else:
        # Fallback de seguridad: leemos la tabla completa para obtener las dimensiones
        df_subs = db.read_table(TableNames.SUBSCRIPTIONS)
        df_subs.columns = df_subs.columns.str.lower()
        df_subs_dedup = df_subs.drop_duplicates(subset=["orden_producto"])

    df_subs_dedup["zona"] = df_subs_dedup["zona"].fillna("Sin Zona").astype(str).str.strip()
    df_subs_dedup["sucursal"] = df_subs_dedup["sucursal"].fillna("Sin Sucursal").astype(str).str.strip()
    df_subs_dedup["zona_sucursal"] = df_subs_dedup["zona"] + " - " + df_subs_dedup["sucursal"]

    # Normalizamos el índice de la tabla de suscripciones para búsquedas O(1)
    df_subs_dedup["orden_producto"] = df_subs_dedup["orden_producto"].astype(str).str.strip()
    df_subs_dedup.set_index("orden_producto", inplace=True)
    return df_subs_dedup


def aggregate_dimensions(
    db, periodo, act_ini, act_fin, nuevos, df_bajas,
    df_inactivos, df_react_all, df_corte_impagado,
    df_react_not_in_ini=None, df_subs_full=None,
    df_free_fin=None, df_free_periodo=None, df_free_retorno=None,
    persist: bool = True, prepared=None, dims=None,
):
    periodo_label = periodo.label()
    dims_pedidas = dims or DIMS

    df_subs_dedup = (
        prepare_subs_dims(db, df_subs_full) if prepared is None else prepared
    )

    react_by_origin = {
        o: (
            df_react_all.loc[df_react_all["estado_origen"] == o, "orden"]
            if not df_react_all.empty
            else pd.Series(dtype=str)
        )
        for o in ["6_churn", "8_30days", "4_paused"]
    }

    all_rows: List[Dict] = []
    ini_ordens = set(act_ini["orden"].astype(str).str.strip().to_numpy()) if not act_ini.empty else set()

    for dim in dims_pedidas:
        dim_col = dim.lower()
        if dim_col not in df_subs_dedup.columns:
            continue

        default = f"Sin {dim}"
        # Mapeo de dimensión rápido usando el índice mapeado en memoria
        map_dict = df_subs_dedup[dim_col].fillna(default).to_dict()

        def cnt(df_ords):
            if df_ords is None or (hasattr(df_ords, "empty") and df_ords.empty):
                return {}
            # Transformación vectorizada de IDs a valores dimensionales
            s_mapped = df_ords["orden"].astype(str).str.strip().map(map_dict).fillna(default)
            return s_mapped.value_counts().to_dict()

        billing_global = pd.to_numeric(df_subs_dedup["total"], errors="coerce").fillna(0.0)

        # Facturacion agregada por valor de dimension en una sola pasada.
        # Antes se remapeaba act_fin completo dentro del bucle de valores, lo
        # que lo hacia O(valores x ordenes) y dominaba el tiempo del calculo.
        if act_fin.empty:
            billing_by_val = {}
        else:
            ordens_fin = act_fin["orden"].astype(str).str.strip()
            vals_fin = ordens_fin.map(map_dict).fillna(default).to_numpy()
            montos = billing_global.reindex(ordens_fin).fillna(0.0).to_numpy()
            billing_by_val = (
                pd.Series(montos).groupby(vals_fin).sum().round(2).to_dict()
            )

        d_act_ini = cnt(act_ini)
        d_act_fin = cnt(act_fin)
        d_nuevos = cnt(nuevos)
        d_bajas = cnt(df_bajas)
        d_inact = cnt(df_inactivos)
        d_react = cnt(df_react_all)
        d_corte = cnt(df_corte_impagado.drop_duplicates(subset=["orden"]))
        
        react_6_filtered = react_by_origin["6_churn"][~react_by_origin["6_churn"].isin(ini_ordens)]
        d_react_6 = cnt(pd.DataFrame({"orden": react_6_filtered}))

        react_8_filtered = react_by_origin["8_30days"][~react_by_origin["8_30days"].isin(ini_ordens)]
        d_react_8 = cnt(pd.DataFrame({"orden": react_8_filtered}))

        react_4_series = react_by_origin["4_paused"]
        if not react_4_series.empty:
            react_4_in_ini = react_4_series[react_4_series.isin(ini_ordens)]
            react_4_not_in_ini = react_4_series[~react_4_series.isin(ini_ordens)]
        else:
            react_4_in_ini = pd.Series(dtype=str)
            react_4_not_in_ini = pd.Series(dtype=str)
            
        d_react_4_P = cnt(pd.DataFrame({"orden": react_4_in_ini}))
        d_react_4_H = cnt(pd.DataFrame({"orden": react_4_not_in_ini}))

        react_sin_series = df_react_all.loc[df_react_all["estado_origen"] == "reactivacion_sin_origen", "orden"] if not df_react_all.empty else pd.Series(dtype=str)
        react_sin_not_ini = react_sin_series[~react_sin_series.isin(ini_ordens)] if not react_sin_series.empty else pd.Series(dtype=str)
        d_react_sin = cnt(pd.DataFrame({"orden": react_sin_not_ini}))
        
        d_react_not_in_ini = cnt(df_react_not_in_ini) if df_react_not_in_ini is not None and not df_react_not_in_ini.empty else {}

        # Clientes gratuitos (archivados): no suman a activos ni a bajas.
        d_free = cnt(df_free_fin)
        d_free_periodo = cnt(df_free_periodo)
        d_free_retorno = cnt(df_free_retorno)

        valores = sorted(set(
            list(d_act_ini.keys()) + list(d_act_fin.keys()) + list(d_nuevos.keys()) +
            list(d_bajas.keys()) + list(d_inact.keys()) + list(d_react.keys()) +
            list(d_corte.keys()) + list(d_react_6.keys()) + list(d_react_8.keys()) +
            list(d_react_4_P.keys()) + list(d_react_4_H.keys()) + list(d_react_sin.keys()) +
            list(d_free.keys())
        ))

        for val in valores:
            a_ini = d_act_ini.get(val, 0)
            a_fin = d_act_fin.get(val, 0)
            nv = d_nuevos.get(val, 0)
            bn = a_ini - (a_fin - nv - d_free_retorno.get(val, 0)) - d_free_periodo.get(val, 0)
            bb = bn + d_react_not_in_ini.get(val, 0)
            inac = d_inact.get(val, 0)
            reac = d_react.get(val, 0)
            react_val = d_react_6.get(val, 0) + d_react_8.get(val, 0) + d_react_4_H.get(val, 0) + d_react_sin.get(val, 0)

            billing_val = billing_by_val.get(val, 0.0) if a_fin > 0 else 0.0

            all_rows.append({
                "dimension": dim,
                "valor": val,
                "activos_inicio": a_ini,
                "activos_final": a_fin,
                "nuevos": nv,
                "bajas": bb,
                "crecimiento": round(((a_fin - a_ini) / a_ini) * 100, 4) if a_ini > 0 else 0.0,
                "churn_neto_pct": round((bn / a_ini) * 100, 4) if a_ini > 0 else 0.0,
                "churn_bruto_pct": round((bb / a_ini) * 100, 4) if a_ini > 0 else 0.0,
                "react_6_churn": d_react_6.get(val, 0),
                "react_8_30days": d_react_8.get(val, 0),
                "react_4_paused": d_react_4_P.get(val, 0) + d_react_4_H.get(val, 0),
                "react_4_P": d_react_4_P.get(val, 0),
                "react_4_H": d_react_4_H.get(val, 0),
                "total_inactivos": inac,
                "reactivaciones": reac,
                "react_val": react_val,
                "tasa_aporte_react_pct": round((react_val / (nv + react_val)) * 100, 4) if (nv + react_val) > 0 else 0.0,
                "indice_reemplazo_react_pct": round((react_val / bb) * 100, 4) if bb > 0 else 0.0,
                "adiciones_netas": nv - bb,
                "adiciones_brutas": (nv + d_react_not_in_ini.get(val, 0)) - bb,
                "tasa_winback_pct": round((reac / inac) * 100, 4) if inac > 0 else 0.0,
                "corte_impagado": d_corte.get(val, 0),
                "porcentaje_suspensiones": round((d_corte.get(val, 0) / a_ini) * 100, 4) if a_ini > 0 else 0.0,
                "total_billing": billing_val,
                "arpu": round(billing_val / a_fin, 2) if a_fin > 0 else 0.0,
                "clientes_gratuitos": d_free.get(val, 0),
                "gratuitos_nuevos": d_free_periodo.get(val, 0),
                "gratuitos_retornados": d_free_retorno.get(val, 0),
            })

    df_result = pd.DataFrame(all_rows)
    if not persist:
        # Usado por el calculo diario: devuelve las filas sin escribir en la base.
        return all_rows
    db.save_historico(df_result, TableNames.ANALYZER_CHURN_DIMENSIONES, periodo_label)

    dims_ok = [d for d in dims_pedidas if d.lower() in df_subs_dedup.columns]
    print(
        f"\nDIMENSIONES | {len(dims_ok)} calculadas: {', '.join(dims_ok)}"
        f" | {len(all_rows)} filas guardadas en {TableNames.ANALYZER_CHURN_DIMENSIONES}"
    )
    return all_rows
