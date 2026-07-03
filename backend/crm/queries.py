from __future__ import annotations
import json
import logging
import math
from typing import Any

import pandas as pd

from ..config import DB_SCHEMA, TableNames
from ..database import DBConnector
from .config import DIMENSIONES, PROB_DIM_E8, PROB_DIM_PERDIDOS_RESCATE, dim_col

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


# ── helpers for on-the-fly dimension GROUP BY ──

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


# --- Per-metric global getters ---

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


# ── On-the-fly dimension getters (GROUP BY, no pre-computed table) ──

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
    from .config import EFECTIVIDAD_REGLAS, ETAPA8_ATRIBUCION, ETAPA8_EXCEPTION_MOTIVOS, RETORNO_ATRIBUCION
    from .metrics.efectividad import _classify_forward_cycles_detailed, _get_client_motivo, _safe_motivo

    select_dims = ", ".join(f"c.{dim_col(d)} AS {d}" for d in DIMENSIONES)
    transitions_q = f"""
        SELECT l.client_id, l.etapa_anterior, l.nueva_etapa,
               l.created_at_log, c.devolver_oportunidad,
               {select_dims}
        FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
        JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
        WHERE 1=1 {fecha_sql}
    """
    df_trans = db.query(transitions_q, params=fecha_params or [])
    if df_trans.empty:
        return []

    # Map client_id to its dimension values
    client_dims = df_trans.drop_duplicates("client_id")[["client_id"] + DIMENSIONES].set_index("client_id").to_dict("index")

    # Calculate detailed outcomes
    all_detailed = {}
    for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
        forward_stages = regla["forward"]
        term_map = regla["term_map"]
        fwd_key = regla.get("forward_key", etapa_key)

        detailed = _classify_forward_cycles_detailed(
            df_trans, fwd_key, forward_stages, term_map,
        )
        all_detailed[etapa_key] = detailed

    # Group by dimension and value
    dimension_results = {}

    for dim in DIMENSIONES:
        dimension_results[dim] = {}
        unique_vals = df_trans[dim].dropna().unique()
        unique_vals = [v for v in unique_vals if str(v).strip() != ""]
        
        for v in unique_vals:
            stages_data = {}
            for stage in EFECTIVIDAD_REGLAS:
                stages_data[stage] = {
                    "exitosos": 0,
                    "fallidos": 0,
                    "retornan": 0,
                    "perdida_directa": 0,
                    "total_salidas": 0,
                }
            dimension_results[dim][v] = stages_data

    def get_dim_val(cid, dim):
        return client_dims.get(cid, {}).get(dim, None)

    # Count base outcomes
    for stage, detailed in all_detailed.items():
        for _, row in detailed.iterrows():
            cid = row["client_id"]
            outcome = row["outcome"]
            fwd_to = row["forward_to"]
            
            for dim in DIMENSIONES:
                v = get_dim_val(cid, dim)
                if v is None or str(v).strip() == "":
                    continue
                
                stages_data = dimension_results[dim][v]
                if outcome == "success":
                    stages_data[stage]["exitosos"] += 1
                elif outcome == "failure":
                    stages_data[stage]["fallidos"] += 1
                elif outcome == "return":
                    is_reclass = False
                    for rule in RETORNO_ATRIBUCION:
                        if rule["etapa"] == stage and rule["forward_to"] == fwd_to:
                            stages_data[stage]["fallidos"] += 1
                            is_reclass = True
                            break
                    if not is_reclass:
                        stages_data[stage]["retornan"] += 1

    # Count direct losses
    for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
        fwd_key = regla.get("forward_key", etapa_key)
        direct_loss = regla["direct_loss"]
        
        dl_rows = df_trans[
            (df_trans["etapa_anterior"] == fwd_key) &
            (df_trans["nueva_etapa"].isin(direct_loss))
        ]
        
        for _, row in dl_rows.iterrows():
            cid = row["client_id"]
            for dim in DIMENSIONES:
                v = get_dim_val(cid, dim)
                if v is None or str(v).strip() == "":
                    continue
                dimension_results[dim][v][etapa_key]["perdida_directa"] += 1

    # Attribute Stage 8 devueltos
    stage_e8_clients = {}
    for stage, df in all_detailed.items():
        dev = df[df["outcome"] == "devuelto"]
        stage_e8_clients[stage] = set(dev["client_id"].unique())

    # Collect direct exits to etapa_8 that are NOT from forward cycles
    TRACKED_STAGES = list(all_detailed.keys())
    direct_e8_map: dict[str, set] = {s: set() for s in TRACKED_STAGES}
    direct_exits = df_trans[df_trans["nueva_etapa"] == "etapa_8_devueltos"]
    for _, row in direct_exits.iterrows():
        origin = row["etapa_anterior"]
        cid = row["client_id"]
        if origin in direct_e8_map:
            if cid not in stage_e8_clients.get(origin, set()):
                direct_e8_map[origin].add(cid)

    ATTR_ORDER = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi"]

    def _check_stage_rules(cid: str, motivo_str: str, stage: str) -> bool:
        rules = [r for r in ETAPA8_ATRIBUCION if r["etapa"] == stage]
        if not rules:
            return False
        dmot = all_detailed.get(stage)
        if dmot is None:
            return False
        rows = dmot[dmot["client_id"] == cid]
        if rows.empty:
            return False
        forward_to = rows["forward_to"].iloc[0]
        for rule in rules:
            for rm in rule["motivos"]:
                if _safe_motivo(rm) == motivo_str:
                    req = rule.get("forward_to")
                    if req is None or forward_to == req:
                        return True
        return False

    all_dev_clients: set = {c for s in stage_e8_clients.values() for c in s}
    for s in direct_e8_map.values():
        all_dev_clients |= s

    for cid in all_dev_clients:
        motivo = _get_client_motivo(df_trans, cid)
        m_lower = _safe_motivo(motivo)
        if m_lower in {_safe_motivo(e) for e in ETAPA8_EXCEPTION_MOTIVOS}:
            continue

        if m_lower == "":
            # Penalize all stages from forward-cycle devueltos AND direct exits to etapa_8
            penalized: set = set()
            for stage in stage_e8_clients:
                if cid in stage_e8_clients[stage]:
                    penalized.add(stage)
            for stage, direct_clients in direct_e8_map.items():
                if cid in direct_clients:
                    penalized.add(stage)
            for stage in penalized:
                for dim in DIMENSIONES:
                    v = get_dim_val(cid, dim)
                    if v is None or str(v).strip() == "":
                        continue
                    dimension_results[dim][v][stage]["fallidos"] += 1
            continue

        attributed = False
        for stage in ATTR_ORDER:
            if _check_stage_rules(cid, m_lower, stage):
                for dim in DIMENSIONES:
                    v = get_dim_val(cid, dim)
                    if v is None or str(v).strip() == "":
                        continue
                    dimension_results[dim][v][stage]["fallidos"] += 1
                attributed = True
                break
                
        if not attributed:
            for dim in DIMENSIONES:
                v = get_dim_val(cid, dim)
                if v is None or str(v).strip() == "":
                    continue
                dimension_results[dim][v]["ventas"]["fallidos"] += 1

    # Format the final rows list
    rows = []
    ETAPAS_ORDER = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "ventas"]
    for dim in DIMENSIONES:
        for v, stages_data in dimension_results[dim].items():
            stages = []
            for et in ETAPAS_ORDER:
                data = stages_data[et]
                total = data["exitosos"] + data["fallidos"] + data["retornan"] + data["perdida_directa"]
                pct = round(data["exitosos"] / total * 100, 2) if total > 0 else 100.0
                stages.append({
                    "etapa": et,
                    "total_salidas": total,
                    "exitosos": data["exitosos"],
                    "fallidos": data["fallidos"],
                    "retornan": data["retornan"],
                    "perdida_directa": data["perdida_directa"],
                    "efectividad_pct": pct
                })
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



