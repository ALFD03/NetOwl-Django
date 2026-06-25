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
from .config import ETAPA_ORDER, DIMENSIONES, EFECTIVIDAD_REGLAS, dim_col


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


def _delete_periodo(db: DBConnector, table: str, periodo: str, dimension: str = "global", dimension_valor: str = "global"):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {DB_SCHEMA}.{table} WHERE periodo = %s AND dimension = %s AND dimension_valor = %s",
                [periodo, dimension, dimension_valor]
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
    periodo: str,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
    dimension: str = "global",
    dimension_valor: str = "global",
) -> list[dict]:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "l")
    params = params_dim + fecha_params

    # SQL solo para extraer datos crudos (excluye etapa_7, se calcula aparte)
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

    # Cálculos con pandas
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

    # Guardar en tabla detalle
    _delete_periodo(db, "crm_tiempo_por_etapa", periodo, dimension, dimension_valor)
    out = pd.DataFrame(records)
    out["periodo"] = periodo
    out["dimension"] = dimension
    out["dimension_valor"] = dimension_valor
    _insert_df(db, "crm_tiempo_por_etapa", out)

    return records


# ---------------------------------------------------------------------------
# 2. Tiempo instalación (solo ganados, usa duracion_total_horas de Odoo)
# ---------------------------------------------------------------------------

def compute_tiempo_instalacion(
    db: DBConnector,
    periodo: str,
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

    _delete_periodo(db, "crm_tiempo_instalacion", periodo, dimension, dimension_valor)
    if result:
        out = pd.DataFrame([result])
        out["periodo"] = periodo
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_tiempo_instalacion", out)

    return result


# ---------------------------------------------------------------------------
# 3. Efectividad etapas 3, 4, 5 y Ventas
# ---------------------------------------------------------------------------

def compute_efectividad(
    db: DBConnector,
    periodo: str,
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
        ORDER BY l.client_id, l.created_at_log
    """
    df_trans = db.query(transitions_q, params=params)
    resultados: list[dict] = []

    if not df_trans.empty:
        for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
            origen_retorno = regla["origen_retorno"]

            if etapa_key == "ventas":
                # "ventas" no es una etapa real; salidas = traspasos a etapa_7
                # retornos = traspasos desde etapa_8 hacia etapa_3/2 de esos mismos clientes
                salidas = df_trans[df_trans["nueva_etapa"] == "etapa_7_instalados"]
                total_salidas = len(salidas)
                if total_salidas == 0:
                    resultados.append({
                        "etapa": etapa_key, "total_salidas": 0, "retornos": 0,
                        "efectividad_pct": 100.0, "origen_retorno": ", ".join(origen_retorno)
                    })
                    continue
                ret_mask = (df_trans["etapa_anterior"] == "etapa_8_devueltos") & \
                           (df_trans["nueva_etapa"].isin(origen_retorno))
                retornos = df_trans[ret_mask]
                clientes_salida = salidas["client_id"].unique()
                retornos_filtrados = retornos[retornos["client_id"].isin(clientes_salida)]
                n_retornos = len(retornos_filtrados)
            else:
                salidas = df_trans[df_trans["etapa_anterior"] == etapa_key]
                total_salidas = len(salidas)
                if total_salidas == 0:
                    resultados.append({
                        "etapa": etapa_key, "total_salidas": 0, "retornos": 0,
                        "efectividad_pct": 100.0, "origen_retorno": ", ".join(origen_retorno)
                    })
                    continue
                ret_mask = (df_trans["nueva_etapa"] == etapa_key) & (df_trans["etapa_anterior"].isin(origen_retorno))
                retornos = df_trans[ret_mask]
                clientes_salida = salidas["client_id"].unique()
                retornos_filtrados = retornos[retornos["client_id"].isin(clientes_salida)]
                n_retornos = len(retornos_filtrados)

            efectividad = round((1 - n_retornos / total_salidas) * 100, 2) if total_salidas > 0 else 100.0
            resultados.append({
                "etapa": etapa_key, "total_salidas": int(total_salidas),
                "retornos": int(n_retornos), "efectividad_pct": efectividad,
                "origen_retorno": ", ".join(origen_retorno)
            })

    _delete_periodo(db, "crm_efectividad", periodo, dimension, dimension_valor)
    if resultados:
        out = pd.DataFrame(resultados)
        out["periodo"] = periodo
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_efectividad", out)

    return resultados


# ---------------------------------------------------------------------------
# 4. Probabilidad etapa 8 + motivos de pérdida
# ---------------------------------------------------------------------------

def compute_probabilidad_etapa8(
    db: DBConnector,
    periodo: str,
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
    _delete_periodo(db, "crm_probabilidad_etapa8", periodo, dimension, dimension_valor)
    if resumen:
        out = pd.DataFrame([resumen])
        out["periodo"] = periodo
        out["dimension"] = dimension
        out["dimension_valor"] = dimension_valor
        _insert_df(db, "crm_probabilidad_etapa8", out)

    # Guardar motivos
    _delete_periodo(db, "crm_motivos_perdida", periodo, dimension, dimension_valor)
    if not df_mot.empty:
        df_mot["periodo"] = periodo
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
    periodo: str,
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

    # Perdidos se detecta desde crm_clients.ganado = 'perdido'
    # Rescatados = de esos, los que tienen al menos un log a etapa_7_instalados
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

    _delete_periodo(db, "crm_rescate_perdidos", periodo, dimension, dimension_valor)
    if result:
        out = pd.DataFrame([result])
        out["periodo"] = periodo
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
    periodo_label: str,
    fecha_fin: datetime | None = None,
) -> dict:
    """
    Computa las 5 métricas a nivel global, guarda en tablas detalle
    y actualiza crm_metricas_globales.
    Retorna dict con todos los resultados (para el analyzer).
    """
    results: dict = {}

    # 1. Totals
    totals = _compute_totals(db, fecha_fin)
    results.update(totals)

    # 2. Tiempo instalación
    ti = compute_tiempo_instalacion(db, periodo_label, fecha_fin)
    results["tiempo_instalacion"] = ti

    # 3. Tiempo por etapa
    tpe = compute_tiempo_por_etapa(db, periodo_label, fecha_fin)
    results["tiempo_por_etapa"] = {r["etapa"]: r for r in tpe}

    # 4. Efectividad
    ef = compute_efectividad(db, periodo_label, fecha_fin)
    results["efectividad"] = ef

    # 5. Probabilidad etapa 8
    prob = compute_probabilidad_etapa8(db, periodo_label, fecha_fin)
    results["probabilidad_etapa8_perdidos"] = prob

    # 6. Rescate
    resc = compute_rescate_perdidos(db, periodo_label, fecha_fin)
    results["rescate_perdidos"] = resc

    # -- Actualizar crm_metricas_globales --
    _upsert_globales(
        db, periodo_label, totals, ti, tpe, ef,
        prob.get("resumen", {}), resc
    )

    return results


def _upsert_globales(
    db: DBConnector,
    periodo: str,
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
        "periodo": periodo,
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
