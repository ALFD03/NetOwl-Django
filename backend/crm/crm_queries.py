from __future__ import annotations
import json
import logging
import math
from typing import Any

import pandas as pd

from ..conf_config import DB_SCHEMA, TableNames
from ..database import DBConnector
from .crm_config import DIMENSIONES, PROB_DIM_E8, PROB_DIM_PERDIDOS_RESCATE, dim_col

logger = logging.getLogger(__name__)

def _parse_jsonb(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    if hasattr(val, 'shape'):  # pandas Series
        return _parse_jsonb(val.iloc[0]) if len(val) > 0 else None
    return val


def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    return obj

def _dim_totals(db: DBConnector) -> list[dict]:
    rows = []
    for dim in DIMENSIONES:
        col = dim_col(dim)
        df = db.query(f"""
            SELECT {col} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE ganado = 'ganado')::int AS ganados,
                   COUNT(*) FILTER (WHERE ganado = 'perdido')::int AS perdidos,
                   COUNT(*) FILTER (WHERE etapa_actual = 'etapa_8_devueltos')::int AS etapa_8_count,
                   COUNT(*) FILTER (WHERE etapa_actual = 'etapa_7_instalados')::int AS etapa_7_count
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
            WHERE {col} IS NOT NULL AND {col} != ''
            GROUP BY {col}
            ORDER BY {col}
        """)
        for _, r in df.iterrows():
            rows.append({
                "dimension": dim,
                "valor": r["valor"],
                "data": {k: r[k] for k in df.columns if k != "valor"},
            })
    return rows

def _dim_tiempo_instalacion(db: DBConnector) -> list[dict]:
    rows = []
    for dim in DIMENSIONES:
        col = dim_col(dim)
        df = db.query(f"""
            SELECT {col} AS valor,
                   COUNT(*)::int AS total_instalados,
                   ROUND(AVG(duracion_total_horas)::numeric, 2)::float8 AS horas_promedio,
                   ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duracion_total_horas)::numeric, 2)::float8 AS horas_mediana,
                   ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duracion_total_horas)::numeric, 2)::float8 AS horas_p25,
                   ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duracion_total_horas)::numeric, 2)::float8 AS horas_p75,
                   ROUND(MIN(duracion_total_horas)::numeric, 2)::float8 AS horas_min,
                   ROUND(MAX(duracion_total_horas)::numeric, 2)::float8 AS horas_max,
                   ROUND(STDDEV(duracion_total_horas)::numeric, 2)::float8 AS horas_std
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
            WHERE {col} IS NOT NULL AND {col} != ''
              AND ganado = 'ganado'
              AND duracion_total_horas IS NOT NULL
            GROUP BY {col}
            ORDER BY {col}
        """)
        for _, r in df.iterrows():
            rows.append({
                "dimension": dim,
                "valor": r["valor"],
                "data": {k: r[k] for k in df.columns if k != "valor"},
            })
    return rows

def _dim_etapa8(db: DBConnector) -> list[dict]:
    rows = []
    for dim in DIMENSIONES:
        col = dim_col(dim)
        df = db.query(f"""
            SELECT {col} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE etapa_actual = 'etapa_8_devueltos'
                                     OR id IN (SELECT client_id FROM {DB_SCHEMA}.{TableNames.CRM_LOGS}
                                               WHERE nueva_etapa = 'etapa_8_devueltos'))::int AS count_etapa8
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
            WHERE {col} IS NOT NULL AND {col} != ''
            GROUP BY {col}
            ORDER BY {col}
        """)
        for _, r in df.iterrows():
            tc = int(r["total_clientes"])
            e8 = int(r["count_etapa8"])
            rows.append({
                "dimension": dim,
                "valor": r["valor"],
                "data": {"total_clientes": tc, "count_etapa8": e8, "pct_etapa8": round(e8 * 100.0 / tc, 2) if tc > 0 else 0.0},
            })
    return rows

def _dim_perdido(db: DBConnector) -> list[dict]:
    rows = []
    for dim in DIMENSIONES:
        col = dim_col(dim)
        df = db.query(f"""
            SELECT {col} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE ganado = 'perdido')::int AS count_perdido,
                   ROUND(COUNT(*) FILTER (WHERE ganado = 'perdido') * 100.0 / NULLIF(COUNT(*), 0), 2) AS pct_perdidos
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
            WHERE {col} IS NOT NULL AND {col} != ''
            GROUP BY {col}
            ORDER BY {col}
        """)
        for _, r in df.iterrows():
            rows.append({
                "dimension": dim,
                "valor": r["valor"],
                "data": {k: r[k] for k in df.columns if k != "valor"},
            })
    return rows

def _dim_rescate(db: DBConnector) -> list[dict]:
    rows = []
    for dim in DIMENSIONES:
        col = dim_col(dim)
        df = db.query(f"""
            SELECT p.{col} AS valor,
                   p.total_perdidos,
                   COALESCE(r.rescatados, 0)::int AS rescatados,
                   ROUND(COALESCE(r.rescatados, 0) * 100.0 / NULLIF(p.total_perdidos, 0), 2) AS pct_rescate
            FROM (
                SELECT {col}, COUNT(*)::int AS total_perdidos
                FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
                WHERE {col} IS NOT NULL AND {col} != ''
                  AND ganado = 'perdido'
                GROUP BY {col}
            ) p
            LEFT JOIN (
                SELECT c.{col}, COUNT(DISTINCT l.client_id)::int AS rescatados
                FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
                JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
                WHERE c.{col} IS NOT NULL AND c.{col} != ''
                  AND c.ganado = 'perdido'
                  AND l.nueva_etapa = 'etapa_7_instalados'
                GROUP BY c.{col}
            ) r ON p.{col} = r.{col}
            ORDER BY p.{col}
        """)
        for _, r in df.iterrows():
            rows.append({
                "dimension": dim,
                "valor": r["valor"],
                "data": {k: r[k] for k in df.columns if k != "valor"},
            })
    return rows

def _dim_especial_etapa8(db: DBConnector) -> list[dict]:
    rows = []
    for prob_dim in PROB_DIM_E8:
        col = dim_col(prob_dim)
        col_expr = f"c.{col}::text"
        df = db.query(f"""
            SELECT {col_expr} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_8_devueltos')::int AS count_etapa8
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
            WHERE {col_expr} IS NOT NULL AND {col_expr} != ''
            GROUP BY {col_expr}
            ORDER BY {col_expr}
        """)
        total_e8 = df["count_etapa8"].sum()
        for _, r in df.iterrows():
            tc = int(r["total_clientes"])
            e8 = int(r["count_etapa8"])
            rows.append({
                "dimension": prob_dim,
                "valor": r["valor"],
                "data": {"total_clientes": tc, "count_etapa8": e8,
                         "pct_etapa8": round(e8 * 100.0 / total_e8, 2) if total_e8 > 0 else 0.0},
            })
    return rows

def _dim_especial_perdidos_rescate(db: DBConnector) -> list[dict]:
    rows = []
    for prob_dim in PROB_DIM_PERDIDOS_RESCATE:
        col = dim_col(prob_dim)
        col_expr = f"c.{col}::text"

        df_group = db.query(f"""
            SELECT {col_expr} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS perdidos
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
            WHERE {col_expr} IS NOT NULL AND {col_expr} != ''
            GROUP BY {col_expr}
            ORDER BY {col_expr}
        """)

        df_resc = db.query(f"""
            SELECT {col_expr} AS valor,
                   COUNT(DISTINCT l.client_id)::int AS rescatados
            FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
            JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
            WHERE {col_expr} IS NOT NULL AND {col_expr} != ''
              AND c.ganado = 'perdido'
              AND l.nueva_etapa = 'etapa_7_instalados'
            GROUP BY {col_expr}
        """)
        total_perd = df_group["perdidos"].sum()
        resc_map = {}
        for _, r in df_resc.iterrows():
            resc_map[r["valor"]] = int(r["rescatados"])

        for _, r in df_group.iterrows():
            v = r["valor"]
            tc = int(r["total_clientes"])
            perd = int(r["perdidos"])
            pct_share = round(perd * 100.0 / total_perd, 2) if total_perd > 0 else 0.0
            rescatados = resc_map.get(v, 0)
            rows.append({
                "dimension": prob_dim,
                "valor": v,
                "data": {"total_clientes": tc, "count_perdido": perd, "pct_perdidos": pct_share,
                         "total_perdidos": perd, "rescatados": rescatados,
                         "pct_rescate": round(rescatados * 100.0 / perd, 2) if perd > 0 else 0.0},
            })
    return rows

def get_metric_totals() -> dict:
    db = DBConnector()
    try:
        df = db.query(f"SELECT totals FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {}
        return _clean_nan(_parse_jsonb(df.iloc[0]["totals"]) or {})
    except Exception:
        logger.exception("Error getting metric totals")
        return {}

def get_metric_tiempo_instalacion() -> dict:
    db = DBConnector()
    try:
        df = db.query(f"SELECT tiempo_instalacion FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {}
        return _clean_nan(_parse_jsonb(df.iloc[0]["tiempo_instalacion"]) or {})
    except Exception:
        logger.exception("Error getting metric tiempo_instalacion")
        return {}

def get_metric_tiempo_por_etapa() -> dict:
    db = DBConnector()
    try:
        df = db.query(f"SELECT tiempo_por_etapa FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {}
        return _clean_nan(_parse_jsonb(df.iloc[0]["tiempo_por_etapa"]) or {})
    except Exception:
        logger.exception("Error getting metric tiempo_por_etapa")
        return {}

def get_metric_efectividad() -> list:
    db = DBConnector()
    try:
        df = db.query(f"SELECT efectividad FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return []
        return _clean_nan(_parse_jsonb(df.iloc[0]["efectividad"]) or [])
    except Exception:
        logger.exception("Error getting metric efectividad")
        return []

def get_metric_etapa8() -> dict:
    db = DBConnector()
    try:
        df = db.query(f"SELECT etapa8 FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {}
        return _clean_nan(_parse_jsonb(df.iloc[0]["etapa8"]) or {})
    except Exception:
        logger.exception("Error getting metric etapa8")
        return {}

def get_metric_perdido() -> dict:
    db = DBConnector()
    try:
        df = db.query(f"SELECT perdido FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {}
        return _clean_nan(_parse_jsonb(df.iloc[0]["perdido"]) or {})
    except Exception:
        logger.exception("Error getting metric perdido")
        return {}

def get_metric_rescate() -> dict:
    db = DBConnector()
    try:
        df = db.query(f"SELECT rescate FROM {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} WHERE id = 1")
        if df.empty:
            return {}
        return _clean_nan(_parse_jsonb(df.iloc[0]["rescate"]) or {})
    except Exception:
        logger.exception("Error getting metric rescate")
        return {}

def get_dimension_totals() -> list[dict]:
    db = DBConnector()
    try:
        return _clean_nan(_dim_totals(db) + _dim_especial_etapa8(db) + _dim_especial_perdidos_rescate(db))
    except Exception:
        logger.exception("Error getting dimension totals")
        return []

def get_dimension_tiempo_instalacion() -> list[dict]:
    db = DBConnector()
    try:
        return _clean_nan(_dim_tiempo_instalacion(db))
    except Exception:
        logger.exception("Error getting dimension tiempo_instalacion")
        return []

def _dim_efectividad(db: DBConnector, fecha_sql: str = "", fecha_params: list | None = None) -> list[dict]:
    from .crm_config import EFECTIVIDAD_REGLAS, ETAPA8_ATRIBUCION, ETAPA8_EXCEPTION_MOTIVOS, RETORNO_ATRIBUCION
    from .metrics.efectividad import _classify_forward_cycles_detailed, _safe_motivo, get_e8_client_attribution_mapping

    select_dims = ", ".join(f"c.{dim_col(d)} AS {d}" for d in DIMENSIONES)
    transitions_q = f"""
        SELECT l.id, l.client_id, l.etapa_anterior, l.nueva_etapa,
               l.created_at_log, c.devolver_oportunidad,
               {select_dims}
        FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
        JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
        WHERE 1=1 {fecha_sql}
    """
    df_trans = db.query(transitions_q, params=fecha_params or [])
    if df_trans.empty:
        return []

    client_dims = df_trans.drop_duplicates("client_id")[["client_id"] + DIMENSIONES].set_index("client_id").to_dict("index")
    dims_long = (
        df_trans.drop_duplicates("client_id")[["client_id"] + DIMENSIONES]
        .melt(id_vars="client_id", var_name="dimension", value_name="valor")
    )
    dims_long["valor"] = dims_long["valor"].astype(str).str.strip()
    dims_long = dims_long[(dims_long["valor"] != "") & (dims_long["valor"].str.lower() != "none")]
    
    motivo_map = (
        df_trans.dropna(subset=["devolver_oportunidad"])
        .drop_duplicates(subset=["client_id"], keep="first")
        .set_index("client_id")["devolver_oportunidad"]
        .to_dict()
    )

    all_detailed = {}
    for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
        forward_stages = regla["forward"]
        term_map = regla["term_map"]
        fwd_key = regla.get("forward_key", etapa_key)

        detailed = _classify_forward_cycles_detailed(
            df_trans, fwd_key, forward_stages, term_map,
        )
        all_detailed[etapa_key] = detailed

    def get_dim_val(cid, dim):
        return client_dims.get(cid, {}).get(dim, None)

    base_parts = []
    for stage, detailed in all_detailed.items():
        d = detailed.copy()
        d["stage"] = stage
        base_parts.append(d)
    base_df = pd.concat(base_parts, ignore_index=True) if base_parts else pd.DataFrame(
        columns=["client_id", "forward_to", "outcome", "stage"]
    )

    reclass_df = pd.DataFrame(RETORNO_ATRIBUCION).rename(columns={"etapa": "stage"})
    reclass_df["is_reclass"] = True

    base_df["field"] = None
    base_df.loc[base_df["outcome"] == "success", "field"] = "exitosos"
    base_df.loc[base_df["outcome"] == "failure", "field"] = "fallidos"

    is_return = base_df["outcome"] == "return"
    if is_return.any():
        ret_merged = base_df[is_return].merge(
            reclass_df[["stage", "forward_to", "is_reclass"]], on=["stage", "forward_to"], how="left"
        )
        is_reclass_bool = ret_merged["is_reclass"] == True
        base_df.loc[is_return, "field"] = (
            is_reclass_bool.map({True: "fallidos", False: "retornan"}).values
        )

    base_events = base_df.loc[base_df["field"].notna(), ["client_id", "stage", "field"]]
    base_merged = base_events.merge(dims_long, on="client_id", how="inner")
    base_counts = base_merged.groupby(["dimension", "valor", "stage", "field"]).size()

    dl_parts = []
    for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
        fwd_key = regla.get("forward_key", etapa_key)
        direct_loss = regla["direct_loss"]
        dl_rows = df_trans[
            (df_trans["etapa_anterior"] == fwd_key) &
            (df_trans["nueva_etapa"].isin(direct_loss))
        ][["client_id"]].copy()
        dl_rows["stage"] = etapa_key
        dl_parts.append(dl_rows)

    dl_df = pd.concat(dl_parts, ignore_index=True) if dl_parts else pd.DataFrame(columns=["client_id", "stage"])
    dl_df["field"] = "perdida_directa"
    dl_merged = dl_df.merge(dims_long, on="client_id", how="inner")
    dl_counts = dl_merged.groupby(["dimension", "valor", "stage", "field"]).size()

    e8_mapping = get_e8_client_attribution_mapping(all_detailed, df_trans)
    e8_events: list[tuple[str, str]] = []
    for cid, stages in e8_mapping.items():
        for stage in stages:
            e8_events.append((cid, stage))

    
    e8_df = pd.DataFrame(e8_events, columns=["client_id", "stage"])
    e8_df["field"] = "fallidos"
    e8_merged = e8_df.merge(dims_long, on="client_id", how="inner")
    e8_counts = e8_merged.groupby(["dimension", "valor", "stage", "field"]).size() if not e8_df.empty else pd.Series(dtype=int)

    all_counts = base_counts.add(dl_counts, fill_value=0).add(e8_counts, fill_value=0)
    counts_df = all_counts.unstack(fill_value=0).reset_index() if not all_counts.empty else pd.DataFrame(
        columns=["dimension", "valor", "stage", "exitosos", "fallidos", "retornan", "perdida_directa"]
    )
    for f in ["exitosos", "fallidos", "retornan", "perdida_directa"]:
        if f not in counts_df.columns:
            counts_df[f] = 0

    ETAPAS_ORDER = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "ventas"]
    base_index = []
    for dim in DIMENSIONES:
        unique_vals = df_trans[dim].dropna().unique()
        unique_vals = [v for v in unique_vals if str(v).strip() != ""]
        for v in unique_vals:
            for et in ETAPAS_ORDER:
                base_index.append((dim, v, et))
    full_df = pd.DataFrame(base_index, columns=["dimension", "valor", "stage"])

    merged_final = full_df.merge(counts_df, on=["dimension", "valor", "stage"], how="left")
    for f in ["exitosos", "fallidos", "retornan", "perdida_directa"]:
        merged_final[f] = merged_final[f].fillna(0).astype(int)

    merged_final["total_salidas"] = (
        merged_final["exitosos"] + merged_final["fallidos"]
        + merged_final["retornan"] + merged_final["perdida_directa"]
    )
    merged_final["efectividad_pct"] = merged_final.apply(
        lambda r: round(r["exitosos"] / r["total_salidas"] * 100, 2) if r["total_salidas"] > 0 else 100.0,
        axis=1,
    )

    rows = []
    for (dim, v), grp in merged_final.groupby(["dimension", "valor"], sort=False):
        grp = grp.set_index("stage").loc[ETAPAS_ORDER]
        stages = [
            {
                "etapa": et,
                "total_salidas": int(grp.loc[et, "total_salidas"]),
                "exitosos": int(grp.loc[et, "exitosos"]),
                "fallidos": int(grp.loc[et, "fallidos"]),
                "retornan": int(grp.loc[et, "retornan"]),
                "perdida_directa": int(grp.loc[et, "perdida_directa"]),
                "efectividad_pct": float(grp.loc[et, "efectividad_pct"]),
            }
            for et in ETAPAS_ORDER
        ]
        rows.append({"dimension": dim, "valor": v, "data": stages})

    return rows

def get_dimension_tiempo_por_etapa() -> list[dict]:
    return []

def get_dimension_efectividad() -> list[dict]:
    db = DBConnector()
    try:
        df = db.query(f"""
            SELECT dimension, valor, efectividad
            FROM {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}
            WHERE dimension = ANY(%s)
              AND efectividad IS NOT NULL
        """, params=[list(DIMENSIONES)])
        if not df.empty:
            rows = []
            for _, r in df.iterrows():
                data = _parse_jsonb(r["efectividad"])
                if data:
                    rows.append({
                        "dimension": r["dimension"],
                        "valor": r["valor"],
                        "data": _clean_nan(data),
                    })
            return rows
        return []
    except Exception:
        logger.exception("Error reading precomputed efectividad from historico")
        return []

def get_dimension_etapa8() -> list[dict]:
    db = DBConnector()
    try:
        return _clean_nan(_dim_etapa8(db) + _dim_especial_etapa8(db))
    except Exception:
        logger.exception("Error getting dimension etapa8")
        return []

def get_dimension_perdido() -> list[dict]:
    db = DBConnector()
    try:
        return _clean_nan(_dim_perdido(db) + _dim_especial_perdidos_rescate(db))
    except Exception:
        logger.exception("Error getting dimension perdido")
        return []

def get_dimension_rescate() -> list[dict]:
    db = DBConnector()
    try:
        return _clean_nan(_dim_rescate(db) + _dim_especial_perdidos_rescate(db))
    except Exception:
        logger.exception("Error getting dimension rescate")
        return []



