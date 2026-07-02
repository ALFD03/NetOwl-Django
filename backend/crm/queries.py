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
        for _, r in df.iterrows():
            tc = int(r["total_clientes"])
            e8 = int(r["count_etapa8"])
            rows.append({
                "dimension": prob_dim,
                "valor": r["valor"],
                "data": {"total_clientes": tc, "count_etapa8": e8, "pct_etapa8": round(e8 * 100.0 / tc, 2) if tc > 0 else 0.0},
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
        resc_map = {}
        for _, r in df_resc.iterrows():
            resc_map[r["valor"]] = int(r["rescatados"])

        for _, r in df_group.iterrows():
            v = r["valor"]
            tc = int(r["total_clientes"])
            perd = int(r["perdidos"])
            pct = round(perd * 100.0 / tc, 2) if tc > 0 else 0.0
            rescatados = resc_map.get(v, 0)
            rows.append({
                "dimension": prob_dim,
                "valor": v,
                "data": {"total_clientes": tc, "count_perdido": perd, "pct_perdidos": pct,
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

def _dim_efectividad(db: DBConnector) -> list[dict]:
    ETAPAS = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "ventas"]
    FWD = {
        "etapa_3_factibilidad": ["etapa_4_adecuaciones", "etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "etapa_4_adecuaciones": ["etapa_5_gpi", "etapa_6_contratistas", "etapa_7_instalados"],
        "etapa_5_gpi":          ["etapa_6_contratistas", "etapa_7_instalados"],
    }
    FWD_TUPLES = [(e, f) for e, fwd in FWD.items() for f in fwd]
    FWD_COND = " OR ".join(f"(l.etapa_anterior = '{e}' AND l.nueva_etapa = '{f}')" for e, f in FWD_TUPLES)

    rows = []
    for dim in DIMENSIONES:
        col = dim_col(dim)
        df = db.query(f"""
            SELECT c.{col} AS valor,
                   l.etapa_anterior,
                   COUNT(*)::int AS total_salidas,
                   COUNT(*) FILTER (WHERE c.ganado = 'ganado')::int AS exitosos,
                   COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS fallidos
            FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
            JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
            WHERE c.{col} IS NOT NULL AND c.{col} != ''
              AND ({FWD_COND})
            GROUP BY c.{col}, l.etapa_anterior
            ORDER BY c.{col}, l.etapa_anterior
        """)
        pivoted: dict[str, dict[str, Any]] = {}
        for _, r in df.iterrows():
            v = r["valor"]
            if v not in pivoted:
                pivoted[v] = {"etapa_3_factibilidad": {}, "etapa_4_adecuaciones": {}, "etapa_5_gpi": {}, "ventas": {}}
            et = r["etapa_anterior"]
            sal = int(r["total_salidas"])
            ex = int(r["exitosos"])
            fa = int(r["fallidos"])
            pivoted[v][et] = {"total_salidas": sal, "exitosos": ex, "fallidos": fa}

        for v, etapas_data in pivoted.items():
            e3 = etapas_data.get("etapa_3_factibilidad", {})
            if not etapas_data.get("ventas"):
                etapas_data["ventas"] = dict(e3)
            stages = []
            for et in ETAPAS:
                d = etapas_data.get(et, {})
                sal = d.get("total_salidas", 0)
                ex = d.get("exitosos", 0)
                fa = d.get("fallidos", 0)
                pct = round(ex * 100.0 / sal, 2) if sal > 0 else 0.0
                stages.append({"etapa": et, "total_salidas": sal, "exitosos": ex, "fallidos": fa, "efectividad_pct": pct})
            rows.append({"dimension": dim, "valor": v, "data": stages})
    return rows


def get_dimension_tiempo_por_etapa() -> list[dict]:
    return []

def get_dimension_efectividad() -> list[dict]:
    db = DBConnector()
    try:
        return _clean_nan(_dim_efectividad(db))
    except Exception:
        logger.exception("Error getting dimension efectividad")
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



