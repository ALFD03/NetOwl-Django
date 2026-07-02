from __future__ import annotations
import json
from datetime import datetime

import pandas as pd
from psycopg2.extras import execute_values

from ..database import DBConnector
from ..config import DB_SCHEMA, TableNames
from .config import DIMENSIONES, PROB_DIM_E8, PROB_DIM_PERDIDOS_RESCATE, dim_col
from .metrics import _clean_nan


def _df_to_dict(df: pd.DataFrame, key_col: str = "valor") -> dict:
    if df.empty:
        return {}
    result = {}
    for _, r in df.iterrows():
        k = r[key_col]
        d = {c: r[c] for c in df.columns if c != key_col}
        result[k] = d
    return result


def _grouped_totals(db: DBConnector, col: str, fecha_sql: str, fecha_params: list) -> pd.DataFrame:
    q = f"""
        SELECT {col} AS valor,
               COUNT(*)::int AS total_clientes,
               COUNT(*) FILTER (WHERE ganado = 'ganado')::int AS ganados,
               COUNT(*) FILTER (WHERE ganado = 'perdido')::int AS perdidos,
               COUNT(*) FILTER (WHERE etapa_actual = 'etapa_8_devueltos')::int AS etapa_8_count,
               COUNT(*) FILTER (WHERE etapa_actual = 'etapa_7_instalados')::int AS etapa_7_count
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
        WHERE {col} IS NOT NULL AND {col} != ''
          {fecha_sql}
        GROUP BY {col}
        ORDER BY {col}
    """
    return db.query(q, params=fecha_params)


def _grouped_tiempo_instalacion(db: DBConnector, col: str, fecha_sql: str, fecha_params: list) -> pd.DataFrame:
    q = f"""
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
          {fecha_sql}
        GROUP BY {col}
        ORDER BY {col}
    """
    return db.query(q, params=fecha_params)


def _grouped_etapa8(db: DBConnector, col: str, fecha_sql: str, fecha_params: list) -> pd.DataFrame:
    q = f"""
        SELECT {col} AS valor,
               COUNT(*)::int AS total_clientes,
               COUNT(*) FILTER (WHERE etapa_actual = 'etapa_8_devueltos'
                                 OR id IN (SELECT client_id FROM {DB_SCHEMA}.{TableNames.CRM_LOGS}
                                           WHERE nueva_etapa = 'etapa_8_devueltos'))::int AS count_etapa8
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
        WHERE {col} IS NOT NULL AND {col} != ''
          {fecha_sql}
        GROUP BY {col}
        ORDER BY {col}
    """
    df = db.query(q, params=fecha_params)
    if not df.empty:
        df["pct"] = (df["count_etapa8"] * 100.0 / df["total_clientes"].replace(0, None)).round(2)
        df["pct"] = df["pct"].fillna(0.0)
    return df


def _grouped_perdido(db: DBConnector, col: str, fecha_sql: str, fecha_params: list) -> pd.DataFrame:
    q = f"""
        SELECT {col} AS valor,
               COUNT(*)::int AS total_clientes,
               COUNT(*) FILTER (WHERE ganado = 'perdido')::int AS count_perdido,
               ROUND(COUNT(*) FILTER (WHERE ganado = 'perdido') * 100.0 / NULLIF(COUNT(*), 0), 2) AS pct
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
        WHERE {col} IS NOT NULL AND {col} != ''
          {fecha_sql}
        GROUP BY {col}
        ORDER BY {col}
    """
    return db.query(q, params=fecha_params)


def _grouped_rescate(db: DBConnector, col: str, fecha_sql: str, fecha_params: list) -> pd.DataFrame:
    q = f"""
        SELECT p.{col} AS valor,
               p.total_perdidos,
               COALESCE(r.rescatados, 0)::int AS rescatados,
               ROUND(COALESCE(r.rescatados, 0) * 100.0 / NULLIF(p.total_perdidos, 0), 2) AS pct_rescate
        FROM (
            SELECT {col}, COUNT(*)::int AS total_perdidos
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS}
            WHERE {col} IS NOT NULL AND {col} != ''
              AND ganado = 'perdido'
              {fecha_sql}
            GROUP BY {col}
        ) p
        LEFT JOIN (
            SELECT c.{col}, COUNT(DISTINCT l.client_id)::int AS rescatados
            FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
            JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
            WHERE c.{col} IS NOT NULL AND c.{col} != ''
              AND c.ganado = 'perdido'
              AND l.nueva_etapa = 'etapa_7_instalados'
              {fecha_sql}
            GROUP BY c.{col}
        ) r ON p.{col} = r.{col}
        ORDER BY p.{col}
    """
    return db.query(q, params=fecha_params)


def _build_dim_rows_grouped(
    db: DBConnector,
    fecha_fin: datetime | None = None,
) -> list[dict]:
    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND creado_el <= %s"
        fecha_params = [fecha_fin]

    all_rows: list[dict] = []

    for dim in DIMENSIONES:
        col = dim_col(dim)

        df_tot = _grouped_totals(db, col, fecha_sql, fecha_params)
        df_ti = _grouped_tiempo_instalacion(db, col, fecha_sql, fecha_params)
        df_e8 = _grouped_etapa8(db, col, fecha_sql, fecha_params)
        df_perd = _grouped_perdido(db, col, fecha_sql, fecha_params)
        df_resc = _grouped_rescate(db, col, fecha_sql, fecha_params)

        totals_map = _df_to_dict(df_tot)
        ti_map = _df_to_dict(df_ti)
        e8_map = _df_to_dict(df_e8)
        perd_map = _df_to_dict(df_perd)
        resc_map = _df_to_dict(df_resc)

        all_vals = set(totals_map) | set(ti_map) | set(e8_map) | set(perd_map) | set(resc_map)
        if not all_vals:
            continue

        for v in sorted(all_vals):
            t = totals_map.get(v, {})
            ti = ti_map.get(v, {})
            e8 = e8_map.get(v, {})
            perd = perd_map.get(v, {})
            resc = resc_map.get(v, {})

            all_rows.append({
                "dimension": dim,
                "valor": v,
                "totals": json.dumps(_clean_nan(t), default=str) if t else "null",
                "tiempo_instalacion": json.dumps(_clean_nan(ti), default=str) if ti else "null",
                "tiempo_por_etapa": "null",
                "efectividad": "null",
                "etapa8": json.dumps(_clean_nan(e8), default=str) if e8 else "null",
                "perdido": json.dumps(_clean_nan(perd), default=str) if perd else "null",
                "rescate": json.dumps(_clean_nan(resc), default=str) if resc else "null",
            })

    return all_rows


def _build_special_dim_rows_grouped(
    db: DBConnector,
    fecha_fin: datetime | None = None,
) -> list[dict]:
    fecha_sql = ""
    fecha_params: list = []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]

    all_rows: list[dict] = []

    for prob_dim in PROB_DIM_E8:
        col = dim_col(prob_dim)
        col_expr = f"c.{col}::text"

        q_group = f"""
            SELECT {col_expr} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_8_devueltos')::int AS etapa_8_count
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
            WHERE {col_expr} IS NOT NULL AND {col_expr} != ''
              {fecha_sql}
            GROUP BY {col_expr}
            ORDER BY {col_expr}
        """
        df_group = db.query(q_group, params=fecha_params)
        if df_group.empty:
            continue

        for _, r in df_group.iterrows():
            v = r["valor"]
            tc = int(r["total_clientes"])
            e8 = int(r["etapa_8_count"])
            pct = round(e8 * 100.0 / tc, 2) if tc > 0 else 0.0

            all_rows.append({
                "dimension": prob_dim,
                "valor": v,
                "totals": json.dumps({"total_clientes": tc}),
                "tiempo_instalacion": "null",
                "tiempo_por_etapa": "null",
                "efectividad": "null",
                "etapa8": json.dumps({"total_clientes": tc, "count_etapa8": e8, "pct": pct}),
                "perdido": "null",
                "rescate": "null",
            })

    for prob_dim in PROB_DIM_PERDIDOS_RESCATE:
        col = dim_col(prob_dim)
        col_expr = f"c.{col}::text"

        q_group = f"""
            SELECT {col_expr} AS valor,
                   COUNT(*)::int AS total_clientes,
                   COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS perdidos
            FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
            WHERE {col_expr} IS NOT NULL AND {col_expr} != ''
              {fecha_sql}
            GROUP BY {col_expr}
            ORDER BY {col_expr}
        """
        df_group = db.query(q_group, params=fecha_params)
        if df_group.empty:
            continue

        q_resc = f"""
            SELECT c.{col_expr} AS valor,
                   COUNT(DISTINCT l.client_id)::int AS rescatados
            FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
            JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
            WHERE c.{col_expr} IS NOT NULL AND c.{col_expr} != ''
              AND c.ganado = 'perdido'
              AND l.nueva_etapa = 'etapa_7_instalados'
              {fecha_sql}
            GROUP BY c.{col_expr}
        """
        df_resc = db.query(q_resc, params=fecha_params)
        resc_map = {}
        if not df_resc.empty:
            for _, r in df_resc.iterrows():
                resc_map[r["valor"]] = int(r["rescatados"])

        for _, r in df_group.iterrows():
            v = r["valor"]
            tc = int(r["total_clientes"])
            perd = int(r["perdidos"])
            pct = round(perd * 100.0 / tc, 2) if tc > 0 else 0.0
            rescatados = resc_map.get(v, 0)
            resc_pct = round(rescatados * 100.0 / perd, 2) if perd > 0 else 0.0

            all_rows.append({
                "dimension": prob_dim,
                "valor": v,
                "totals": json.dumps({"total_clientes": tc, "perdidos": perd}),
                "tiempo_instalacion": "null",
                "tiempo_por_etapa": "null",
                "efectividad": "null",
                "etapa8": "null",
                "perdido": json.dumps({"total_clientes": tc, "count_perdido": perd, "pct": pct}),
                "rescate": json.dumps({"total_perdidos": perd, "rescatados": rescatados, "pct_rescate": resc_pct}),
            })

    return all_rows


def aggregate_dimensions(
    db: DBConnector,
    fecha_fin: datetime | None = None,
):
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO} CASCADE")
            cur.execute(f"""
                CREATE TABLE {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO} (
                    id BIGSERIAL PRIMARY KEY,
                    dimension TEXT NOT NULL,
                    valor TEXT NOT NULL,
                    totals JSONB,
                    tiempo_instalacion JSONB,
                    tiempo_por_etapa JSONB,
                    efectividad JSONB,
                    etapa8 JSONB,
                    perdido JSONB,
                    rescate JSONB
                )
            """)
        conn.commit()

    normal_rows = _build_dim_rows_grouped(db, fecha_fin)
    special_rows = _build_special_dim_rows_grouped(db, fecha_fin)
    all_rows = normal_rows + special_rows

    if not all_rows:
        return

    cols = ["dimension", "valor", "totals", "tiempo_instalacion",
            "tiempo_por_etapa", "efectividad", "etapa8", "perdido", "rescate"]
    values = []
    for r in all_rows:
        row = []
        for c in cols:
            v = r.get(c)
            if v is None or v == "null":
                row.append(None)
            else:
                row.append(v)
        values.append(tuple(row))

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            execute_values(
                cur,
                f"INSERT INTO {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}"
                f" ({', '.join(cols)}) VALUES %s",
                values,
            )
        conn.commit()

    dims_norm = [d for d in DIMENSIONES]
    print(
        f"DIMENSIONES CRM | {len(dims_norm)} normales: {', '.join(dims_norm)}"
        f" | E8: {', '.join(PROB_DIM_E8)} | Perd/Resc: {', '.join(PROB_DIM_PERDIDOS_RESCATE)}"
        f" | {len(all_rows)} filas en crm_dimensiones_historico"
    )
