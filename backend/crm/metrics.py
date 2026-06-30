"""
Cálculo de métricas CRM - 5 grupos de métricas.
Cada función recibe fecha_fin para filtrar datos <= cierre del período.
Guarda resultados en tablas separadas + actualiza crm_metricas_globales.
"""
from __future__ import annotations
import json
import math
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from ..database import DBConnector
from ..config import DB_SCHEMA
from .config import ETAPA_ORDER, DIMENSIONES, EFECTIVIDAD_REGLAS, FAILURE_STAGES, dim_col

_PERIODO = "completo"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_where_filtros(filtros: Dict[str, Any] | None) -> tuple[str, list]:
    """Construye cláusula WHERE y parámetros para filtros dimensionales."""
    clauses = []
    params = []
    if filtros:
        for dim in DIMENSIONES:
            if filtros.get(dim):
                clauses.append(f"c.{dim_col(dim)} = %s")
                params.append(filtros[dim])
    where_sql = " AND ".join(clauses) if clauses else "1=1"
    return where_sql, params


def _build_fecha_fin_sql(fecha_fin: datetime | None, alias: str = "c") -> tuple[str, list]:
    if fecha_fin is None:
        return "", []
    return f"AND {alias}.created_at_log <= %s", [fecha_fin]


def _delete_periodo(db: DBConnector, table: str, dimension: str = "global", dimension_valor: str = "global"):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{table} WHERE periodo = %s AND dimension = %s AND dimension_valor = %s",
                [_PERIODO, dimension, dimension_valor]
            )
        conn.commit()


def _insert_df(db: DBConnector, table: str, df: pd.DataFrame):
    if df.empty:
        return
    db.copy_dataframe(df, table)


def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    return obj


# ---------------------------------------------------------------------------
# 1. Tiempo por etapa
# ---------------------------------------------------------------------------

def compute_tiempo_por_etapa(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> list[dict]:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "l")
    params = params_dim + fecha_params

    query = f"""
        SELECT l.etapa_anterior AS etapa, l.duracion_horas
        FROM {DB_SCHEMA}.crm_logs l
        JOIN {DB_SCHEMA}.crm_clients c ON l.client_id = c.id
        WHERE {where_dim}
          AND l.duracion_horas IS NOT NULL
          AND l.etapa_anterior != 'etapa_7_instalados'
          {fecha_sql}
    """
    df = db.query(query, params=params)
    if df.empty:
        return []

    etapa_order_map = {e: i for i, e in enumerate(ETAPA_ORDER)}
    records = []
    for etapa, group in df.groupby("etapa", sort=False):
        h = group["duracion_horas"].dropna()
        n = len(h)
        records.append({
            "etapa": etapa,
            "total_movimientos": n,
            "tiempo_promedio_horas": round(float(h.mean()), 2),
            "tiempo_mediana_horas": round(float(h.median()), 2),
            "tiempo_min_horas": round(float(h.min()), 2),
            "tiempo_max_horas": round(float(h.max()), 2),
            "tiempo_std_horas": round(float(h.std(ddof=0)), 2) if n > 1 else None,
        })

    records.sort(key=lambda r: etapa_order_map.get(r["etapa"], 999))

    _delete_periodo(db, "crm_tiempo_por_etapa", dimension, dimension_valor)
    out = pd.DataFrame(records)
    out["periodo"] = _PERIODO
    out["dimension"] = dimension
    out["dimension_valor"] = dimension_valor
    _insert_df(db, "crm_tiempo_por_etapa", out)

    return records


# ---------------------------------------------------------------------------
# 2. Tiempo instalación (solo ganados, usa duracion_total_horas de Odoo)
# ---------------------------------------------------------------------------

def compute_tiempo_instalacion(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)

    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]

    params = params_dim + fecha_params

    query = f"""
        SELECT
            COUNT(*)::int AS total_instalados,
            ROUND(AVG(c.duracion_total_horas)::numeric, 2)::float8 AS horas_promedio,
            ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY c.duracion_total_horas)::numeric, 2)::float8 AS horas_p25,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.duracion_total_horas)::numeric, 2)::float8 AS horas_mediana,
            ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY c.duracion_total_horas)::numeric, 2)::float8 AS horas_p75,
            ROUND(MIN(c.duracion_total_horas)::numeric, 2)::float8 AS horas_min,
            ROUND(MAX(c.duracion_total_horas)::numeric, 2)::float8 AS horas_max,
            ROUND(STDDEV(c.duracion_total_horas)::numeric, 2)::float8 AS horas_std
        FROM {DB_SCHEMA}.crm_clients c
        WHERE {where_dim}
          AND c.ganado = 'ganado'
          AND c.duracion_total_horas IS NOT NULL
          {fecha_sql}
    """
    df = db.query(query, params=params)
    result = df.to_dict("records")[0] if not df.empty else {}

    _delete_periodo(db, "crm_tiempo_instalacion", dimension, dimension_valor)
    if result:
        out = pd.DataFrame([result])
        out["periodo"] = _PERIODO
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_tiempo_instalacion", out)

    return result


# ---------------------------------------------------------------------------
# 3. Efectividad etapas 3, 4, 5 y Ventas
# ---------------------------------------------------------------------------

def _classify_forward_cycles(
    df: pd.DataFrame, etapa_key: str, forward_stages: list[str]
) -> tuple[int, int, int]:
    """Por cada transición forward desde etapa_key, rastrea el primer evento terminal
    usando bfill (vectorizado)."""
    terminal_types = ["etapa_7_instalados"] + FAILURE_STAGES + [etapa_key]
    term_map = {
        "etapa_7_instalados": "success",
        "etapa_8_devueltos": "failure",
        "perdido": "failure",
        etapa_key: "return",
    }

    df_sorted = df.sort_values(["client_id", "created_at_log"])
    is_term = df_sorted["nueva_etapa"].isin(terminal_types)
    next_term = df_sorted["nueva_etapa"].where(is_term).map(term_map)
    next_term = next_term.groupby(df_sorted["client_id"], sort=False).bfill()

    is_fwd = (
        (df_sorted["etapa_anterior"] == etapa_key) &
        (df_sorted["nueva_etapa"].isin(forward_stages))
    )
    fwd_types = next_term[is_fwd]
    return (
        int((fwd_types == "success").sum()),
        int((fwd_types == "failure").sum()),
        int((fwd_types == "return").sum()),
    )


def _classify_ventas(df: pd.DataFrame) -> tuple[int, int, int, pd.Series | None]:
    """Clientes que entraron a pipeline (e1/e2→e3).
    Retorna (n_exito, n_parcial, n_fracaso, serie_efectividad_por_cliente o None)."""
    entrada_mask = (
        (df["nueva_etapa"] == "etapa_3_factibilidad") &
        (df["etapa_anterior"].isin(["etapa_1_contacto", "etapa_2_recepcion"]))
    )
    entrada_cli = df[entrada_mask]["client_id"].unique()
    if not len(entrada_cli):
        return 0, 0, 0, None

    # Build per-client: has etapa_7? has failure?
    has_e7 = df[df["nueva_etapa"] == "etapa_7_instalados"]["client_id"].unique()
    has_fail = df[df["nueva_etapa"].isin(FAILURE_STAGES)]["client_id"].unique()
    set_e7 = set(has_e7)
    set_fail = set(has_fail)
    set_entrada = set(entrada_cli)

    scores = {}
    for cid in set_entrada:
        in_e7 = cid in set_e7
        in_fail = cid in set_fail
        if in_e7 and not in_fail:
            scores[cid] = 100.0
        elif in_e7 and in_fail:
            scores[cid] = 50.0
        elif not in_e7 and in_fail:
            scores[cid] = 0.0

    if not scores:
        return 0, 0, 0, None

    n_exito = sum(1 for v in scores.values() if v == 100.0)
    n_parcial = sum(1 for v in scores.values() if v == 50.0)
    n_fracaso = sum(1 for v in scores.values() if v == 0.0)
    return n_exito, n_parcial, n_fracaso, pd.Series(list(scores.values()))


def compute_efectividad(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> list[dict]:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "l")
    params = params_dim + fecha_params

    transitions_q = f"""
        SELECT l.client_id, l.etapa_anterior, l.nueva_etapa, l.created_at_log
        FROM {DB_SCHEMA}.crm_logs l
        JOIN {DB_SCHEMA}.crm_clients c ON l.client_id = c.id
        WHERE {where_dim}
          {fecha_sql}
    """
    df_trans = db.query(transitions_q, params=params)
    resultados: list[dict] = []

    if df_trans.empty:
        return resultados

    for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
        if etapa_key == "ventas":
            n_exito, n_parcial, n_fracaso, _ = _classify_ventas(df_trans)
            n_clientes = n_exito + n_parcial + n_fracaso
            efectividad = round(
                (n_exito + n_parcial * 0.5) / n_clientes * 100, 2
            ) if n_clientes > 0 else 0.0
            resultados.append({
                "etapa": etapa_key, "total_salidas": n_clientes,
                "retornos": n_parcial + n_fracaso,
                "efectividad_pct": efectividad,
                "exitosos": n_exito,
                "fallidos": n_parcial,
                "retornan": n_fracaso,
                "perdida_directa": 0,
                "origen_retorno": (
                    f"exito={n_exito}, parcial={n_parcial}, fracaso={n_fracaso}"
                )
            })
        else:
            forward_stages = regla["forward"]
            n_exitoso, n_fallido, n_retorna = _classify_forward_cycles(
                df_trans, etapa_key, forward_stages
            )
            n_lost_directo = len(df_trans[
                (df_trans["etapa_anterior"] == etapa_key) &
                (df_trans["nueva_etapa"].isin(FAILURE_STAGES))
            ])
            total = n_exitoso + n_fallido + n_retorna + n_lost_directo
            efectividad = round(n_exitoso / total * 100, 2) if total > 0 else 0.0
            resultados.append({
                "etapa": etapa_key,
                "total_salidas": total,
                "retornos": n_retorna,
                "efectividad_pct": efectividad,
                "exitosos": n_exitoso,
                "fallidos": n_fallido,
                "retornan": n_retorna,
                "perdida_directa": n_lost_directo,
                "origen_retorno": (
                    f"exitosos={n_exitoso}, fallidos={n_fallido}, "
                    f"retornan={n_retorna}, perdida_directa={n_lost_directo}"
                )
            })

    _delete_periodo(db, "crm_efectividad", dimension, dimension_valor)
    if resultados:
        out = pd.DataFrame(resultados)
        out["periodo"] = _PERIODO
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_efectividad", out)

    return resultados


# ---------------------------------------------------------------------------
# 3b. Efectividad - estadísticas por cliente (P25, mediana, P75, etc.)
# ---------------------------------------------------------------------------

def compute_efectividad_estadisticas(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> list[dict]:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "l")
    params = params_dim + fecha_params

    q = f"""
        SELECT l.client_id, l.etapa_anterior, l.nueva_etapa, l.created_at_log
        FROM {DB_SCHEMA}.crm_logs l
        JOIN {DB_SCHEMA}.crm_clients c ON l.client_id = c.id
        WHERE {where_dim}
          {fecha_sql}
    """
    df_trans = db.query(q, params=params)
    if df_trans.empty:
        return []

    ETAPAS_EFECTIVIDAD = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi", "ventas"]
    resultados: list[dict] = []

    for etapa_key in ETAPAS_EFECTIVIDAD:
        if etapa_key == "ventas":
            n_exito, n_parcial, n_fracaso, vals = _classify_ventas(df_trans)
            if vals is None:
                continue
            total_salidas = len(vals)
            total_retornos = n_parcial + n_fracaso
            n_clientes = len(vals)
        else:
            forward_stages = EFECTIVIDAD_REGLAS[etapa_key]["forward"]
            df_sorted = df_trans.sort_values(["client_id", "created_at_log"])

            # Mark next terminal event via bfill
            term_types_set = ["etapa_7_instalados"] + FAILURE_STAGES + [etapa_key]
            term_map = {
                "etapa_7_instalados": "success",
                "etapa_8_devueltos": "failure",
                "perdido": "failure",
                etapa_key: "return",
            }
            is_term = df_sorted["nueva_etapa"].isin(term_types_set)
            next_term = df_sorted["nueva_etapa"].where(is_term).map(term_map)
            next_term = next_term.groupby(df_sorted["client_id"], sort=False).bfill()

            # Forward transitions with their next terminal type
            is_fwd = (
                (df_sorted["etapa_anterior"] == etapa_key) &
                (df_sorted["nueva_etapa"].isin(forward_stages))
            )
            is_lost = (
                (df_sorted["etapa_anterior"] == etapa_key) &
                (df_sorted["nueva_etapa"].isin(FAILURE_STAGES))
            )

            if not is_fwd.any() and not is_lost.any():
                continue

            # Per-client counts of forward events by terminal type
            fwd_df = df_sorted[is_fwd][["client_id"]].copy()
            fwd_df["terminal_type"] = next_term[is_fwd]
            cli_class = fwd_df.groupby(["client_id", "terminal_type"]).size().unstack(fill_value=0)

            # Per-client direct loss counts
            lost_df = df_sorted[is_lost][["client_id"]].copy()
            lost_counts = lost_df.groupby("client_id").size().to_frame("lost_directo")

            all_clients = set(cli_class.index) | set(lost_counts.index)
            if not all_clients:
                continue

            total_salidas = 0
            total_retornos = 0
            scores = {}
            for cid in all_clients:
                r_ex = int(cli_class.get("success", pd.Series(dtype=int)).get(cid, 0))
                r_fa = int(cli_class.get("failure", pd.Series(dtype=int)).get(cid, 0))
                r_re = int(cli_class.get("return", pd.Series(dtype=int)).get(cid, 0))
                r_lo = int(lost_counts.get("lost_directo", pd.Series(dtype=int)).get(cid, 0))
                total = r_ex + r_fa + r_re + r_lo
                scores[cid] = round(r_ex / total * 100, 2) if total > 0 else 0.0
                total_salidas += total
                total_retornos += r_re

            n_clientes = len(scores)
            vals = pd.Series(list(scores.values()))

        resultados.append({
            "periodo": _PERIODO,
            "etapa": etapa_key,
            "total_clientes": n_clientes,
            "total_salidas": total_salidas,
            "total_retornos": total_retornos,
            "efectividad_promedio": round(float(vals.mean()), 2),
            "efectividad_mediana": round(float(vals.median()), 2),
            "efectividad_p25": round(float(vals.quantile(0.25)), 2),
            "efectividad_p75": round(float(vals.quantile(0.75)), 2),
            "efectividad_std": round(float(vals.std(ddof=0)), 2) if len(vals) > 1 else 0.0,
            "dimension": dimension,
            "dimension_valor": dimension_valor,
        })

    return resultados


# ---------------------------------------------------------------------------
# 4. Probabilidad etapa 8 + motivos de pérdida
# ---------------------------------------------------------------------------

def compute_probabilidad_etapa8(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)
    params = params_dim[:]

    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]
    params = params_dim + fecha_params

    resumen_q = f"""
        SELECT
            COUNT(*)::int AS total_clientes,
            COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_8_devueltos')::int AS count_etapa8,
            COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS count_perdidos,
            ROUND(COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_8_devueltos') * 100.0 / NULLIF(COUNT(*), 0), 2) AS pct_etapa8,
            ROUND(COUNT(*) FILTER (WHERE c.ganado = 'perdido') * 100.0 / NULLIF(COUNT(*), 0), 2) AS pct_perdidos
        FROM {DB_SCHEMA}.crm_clients c
        WHERE {where_dim}
          {fecha_sql}
    """
    df_res = db.query(resumen_q, params=params)
    resumen = df_res.to_dict("records")[0] if not df_res.empty else {}

    # Motivos
    motivos_q = f"""
        SELECT motivo_perdida, COUNT(*)::int AS cantidad,
               ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 2) AS pct
        FROM {DB_SCHEMA}.crm_clients c
        WHERE {where_dim}
          AND c.ganado = 'perdido'
          AND c.motivo_perdida IS NOT NULL
          {fecha_sql}
        GROUP BY c.motivo_perdida
        ORDER BY cantidad DESC
    """
    df_mot = db.query(motivos_q, params=params)

    # Guardar probabilidad
    _delete_periodo(db, "crm_probabilidad_etapa8", dimension, dimension_valor)
    if resumen:
        out = pd.DataFrame([resumen])
        out["periodo"] = _PERIODO
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_probabilidad_etapa8", out)

    # Guardar motivos
    _delete_periodo(db, "crm_motivos_perdida", dimension, dimension_valor)
    if not df_mot.empty:
        df_mot["periodo"] = _PERIODO
        df_mot["dimension"] = dimension
        df_mot["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_motivos_perdida", df_mot)

    return {
        "resumen": resumen,
        "motivos_perdida": df_mot.to_dict("records") if not df_mot.empty else []
    }


# ---------------------------------------------------------------------------
# 5. Rescate de perdidos -> instalados
# ---------------------------------------------------------------------------

def compute_rescate_perdidos(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)

    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]

    params = params_dim + fecha_params

    query = f"""
        WITH perdidos AS (
            SELECT id FROM {DB_SCHEMA}.crm_clients c
            WHERE {where_dim}
              AND c.ganado = 'perdido'
              {fecha_sql}
        )
        SELECT
            (SELECT COUNT(*) FROM perdidos)::int AS total_perdidos,
            COALESCE(COUNT(DISTINCT l.client_id)::int, 0) AS rescatados,
            ROUND(
                COALESCE(COUNT(DISTINCT l.client_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM perdidos), 0), 0), 2
            ) AS pct_rescate
        FROM {DB_SCHEMA}.crm_logs l
        WHERE l.client_id IN (SELECT id FROM perdidos)
          AND l.nueva_etapa = 'etapa_7_instalados'
    """
    df = db.query(query, params=params)
    result = df.to_dict("records")[0] if not df.empty else {}

    _delete_periodo(db, "crm_rescate_perdidos", dimension, dimension_valor)
    if result:
        out = pd.DataFrame([result])
        out["periodo"] = _PERIODO
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_rescate_perdidos", out)

    return result


# ---------------------------------------------------------------------------
# Totals helper
# ---------------------------------------------------------------------------

def _compute_totals(db: DBConnector, fecha_fin: datetime | None = None, filtros: dict | None = None) -> dict:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]
    params = params_dim + fecha_params

    q = f"""
        SELECT
            COUNT(*)::int AS total_clientes,
            COUNT(*) FILTER (WHERE c.ganado = 'ganado')::int AS ganados,
            COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS perdidos,
            COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_8_devueltos')::int AS etapa_8_count,
            COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_7_instalados')::int AS etapa_7_count
        FROM {DB_SCHEMA}.crm_clients c
        WHERE {where_dim}
          {fecha_sql}
    """
    df = db.query(q, params=params)
    return df.to_dict("records")[0] if not df.empty else {}


# ---------------------------------------------------------------------------
# Orquestador: compute all global metrics & update crm_metricas_globales
# ---------------------------------------------------------------------------

def compute_and_save_all_global(
    db: DBConnector,
    fecha_fin: datetime | None = None,
) -> dict:
    """
    Computa las 5 métricas a nivel global, guarda en tablas detalle
    y actualiza crm_metricas_globales.
    Retorna dict con todos los resultados (para el analyzer).
    """
    results: dict = {}

    totals = _compute_totals(db, fecha_fin)
    results.update(totals)

    ti = compute_tiempo_instalacion(db, fecha_fin)
    results["tiempo_instalacion"] = ti

    tpe = compute_tiempo_por_etapa(db, fecha_fin)
    results["tiempo_por_etapa"] = {r["etapa"]: r for r in tpe}

    ef = compute_efectividad(db, fecha_fin)
    results["efectividad"] = ef

    ef_stats = compute_efectividad_estadisticas(db, fecha_fin)
    results["efectividad_estadisticas"] = ef_stats

    if ef_stats:
        _delete_periodo(db, "crm_efectividad_estadisticas")
        out = pd.DataFrame(ef_stats)
        _insert_df(db, "crm_efectividad_estadisticas", out)

    prob = compute_probabilidad_etapa8(db, fecha_fin)
    results["probabilidad_etapa8_perdidos"] = prob

    resc = compute_rescate_perdidos(db, fecha_fin)
    results["rescate_perdidos"] = resc

    _upsert_globales(db, totals, ti, tpe, ef, prob.get("resumen", {}), resc)

    return results


def _upsert_globales(
    db: DBConnector,
    totals: dict,
    ti: dict,
    tpe_list: list[dict],
    efectividad_list: list[dict],
    prob_resumen: dict,
    rescate: dict,
):
    tpe_json = json.dumps(_clean_nan({r["etapa"]: r for r in tpe_list}), default=str)
    ef_json = json.dumps(_clean_nan(efectividad_list), default=str)

    row = {
        "periodo": _PERIODO,
        "ti_total_instalados": ti.get("total_instalados"),
        "ti_horas_promedio": ti.get("horas_promedio"),
        "ti_horas_p25": ti.get("horas_p25"),
        "ti_horas_mediana": ti.get("horas_mediana"),
        "ti_horas_p75": ti.get("horas_p75"),
        "ti_horas_min": ti.get("horas_min"),
        "ti_horas_max": ti.get("horas_max"),
        "ti_horas_std": ti.get("horas_std"),
        "pe8_total_clientes": prob_resumen.get("total_clientes"),
        "pe8_count_etapa8": prob_resumen.get("count_etapa8"),
        "pe8_count_perdidos": prob_resumen.get("count_perdidos"),
        "pe8_pct_etapa8": prob_resumen.get("pct_etapa8"),
        "pe8_pct_perdidos": prob_resumen.get("pct_perdidos"),
        "rp_total_perdidos": rescate.get("total_perdidos"),
        "rp_rescatados": rescate.get("rescatados"),
        "rp_pct_rescate": rescate.get("pct_rescate"),
        "total_clientes": totals.get("total_clientes"),
        "ganados": totals.get("ganados"),
        "perdidos": totals.get("perdidos"),
        "etapa_8_count": totals.get("etapa_8_count"),
        "etapa_7_count": totals.get("etapa_7_count"),
        "tiempo_por_etapa": tpe_json,
        "efectividad": ef_json,
    }

    cols = ", ".join(row.keys())
    placeholders = ", ".join(f"%s" for _ in row)
    updates = ", ".join(f"{k} = EXCLUDED.{k}" for k in row if k != "periodo")
    updates += ", updated_at = NOW()"

    values = [None if (isinstance(v, float) and math.isnan(v)) or v is None else v for v in row.values()]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.crm_metricas_globales ({cols})
                VALUES ({placeholders})
                ON CONFLICT (periodo) DO UPDATE SET {updates}
                """,
                values
            )
        conn.commit()
