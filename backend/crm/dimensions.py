"""
Agregación dimensional para métricas CRM.
Para cada dimensión y valor, calcula y guarda métricas en tablas detalle.
"""
from __future__ import annotations
import json
from datetime import datetime
from typing import Any, Dict, List

import pandas as pd

from ..database import DBConnector
from ..config import DB_SCHEMA
from .config import DIMENSIONES, PROB_DIM_E8, PROB_DIM_PERDIDOS_RESCATE, ETAPA_ORDER, EFECTIVIDAD_REGLAS, dim_col
from .metrics import (
    compute_tiempo_instalacion,
    compute_tiempo_por_etapa,
    compute_efectividad,
    compute_probabilidad_etapa8,
    compute_rescate_perdidos,
    _compute_totals,
)

_PERIODO = "completo"


def _compute_prob_dimension_e8(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    prob_dim: str = "devolver_oportunidad",
) -> list[dict]:
    from ..config import DB_SCHEMA
    col = dim_col(prob_dim)
    fecha_sql, fecha_params = "", []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]

    q_vals = f"""
        SELECT DISTINCT {col}::text AS val
        FROM {DB_SCHEMA}.crm_clients c
        WHERE {col} IS NOT NULL AND {col}::text != ''
        ORDER BY 1
    """
    df_vals = db.query(q_vals, params=fecha_params)
    if df_vals.empty:
        return []

    rows = []
    for _, vrow in df_vals.iterrows():
        valor = vrow["val"]
        params = [valor] + fecha_params

        q = f"""
            SELECT
                COUNT(*)::int AS total_clientes,
                COUNT(*) FILTER (WHERE c.etapa_actual = 'etapa_8_devueltos')::int AS etapa_8_count
            FROM {DB_SCHEMA}.crm_clients c
            WHERE c.{col}::text = %s
            {fecha_sql}
        """
        df_tot = db.query(q, params=params)
        tot = df_tot.iloc[0] if not df_tot.empty else {}
        tc = tot.get("total_clientes", 0) or 0
        e8 = tot.get("etapa_8_count", 0) or 0

        rows.append({
            "periodo": _PERIODO,
            "dimension": prob_dim,
            "valor": valor,
            "total_clientes": tc,
            "ganados": 0,
            "perdidos": 0,
            "etapa_8_count": e8,
            "etapa_7_count": 0,
            "pct_etapa8": round(e8 * 100.0 / tc, 2) if tc > 0 else 0.0,
            "pct_perdidos": 0.0,
            "tiempo_instalacion_promedio_horas": 0.0,
            "tiempo_por_etapa_json": "{}",
            "efectividad_json": "[]",
            "pct_rescate_perdidos": 0.0,
        })

    return rows


def _compute_prob_dimension_perdidos_rescate(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    prob_dim: str = "motivo_perdida",
) -> list[dict]:
    from ..config import DB_SCHEMA
    col = dim_col(prob_dim)
    fecha_sql, fecha_params = "", []
    if fecha_fin:
        fecha_sql = "AND c.creado_el <= %s"
        fecha_params = [fecha_fin]

    q_vals = f"""
        SELECT DISTINCT {col}::text AS val
        FROM {DB_SCHEMA}.crm_clients c
        WHERE {col} IS NOT NULL AND {col}::text != ''
        ORDER BY 1
    """
    df_vals = db.query(q_vals, params=fecha_params)
    if df_vals.empty:
        return []

    rows = []
    for _, vrow in df_vals.iterrows():
        valor = vrow["val"]
        params = [valor] + fecha_params

        q_tot = f"""
            SELECT
                COUNT(*)::int AS total_clientes,
                COUNT(*) FILTER (WHERE c.ganado = 'perdido')::int AS perdidos
            FROM {DB_SCHEMA}.crm_clients c
            WHERE c.{col}::text = %s
            {fecha_sql}
        """
        df_tot = db.query(q_tot, params=params)
        tot = df_tot.iloc[0] if not df_tot.empty else {}
        tc = tot.get("total_clientes", 0) or 0
        perd = tot.get("perdidos", 0) or 0

        q_resc = f"""
            SELECT COALESCE(COUNT(DISTINCT l.client_id)::int, 0) AS rescatados
            FROM {DB_SCHEMA}.crm_logs l
            JOIN {DB_SCHEMA}.crm_clients c ON l.client_id = c.id
            WHERE c.{col}::text = %s
              AND c.ganado = 'perdido'
              AND l.nueva_etapa = 'etapa_7_instalados'
              {fecha_sql}
        """
        df_resc = db.query(q_resc, params=params)
        rescatados = df_resc.iloc[0]["rescatados"] if not df_resc.empty else 0

        rows.append({
            "periodo": _PERIODO,
            "dimension": prob_dim,
            "valor": valor,
            "total_clientes": tc,
            "ganados": 0,
            "perdidos": perd,
            "etapa_8_count": 0,
            "etapa_7_count": 0,
            "pct_etapa8": 0.0,
            "pct_perdidos": round(perd * 100.0 / tc, 2) if tc > 0 else 0.0,
            "tiempo_instalacion_promedio_horas": 0.0,
            "tiempo_por_etapa_json": "{}",
            "efectividad_json": "[]",
            "pct_rescate_perdidos": round(rescatados * 100.0 / perd, 2) if perd > 0 else 0.0,
        })

    return rows


def aggregate_dimensions(
    db: DBConnector,
    fecha_fin: datetime | None = None,
):
    dim_values: dict[str, list[str]] = {}
    for dim in DIMENSIONES:
        col = dim_col(dim)
        q = f"""
            SELECT DISTINCT {col} AS val
            FROM {DB_SCHEMA}.crm_clients
            WHERE {col} IS NOT NULL AND {col} != ''
            ORDER BY 1
        """
        df = db.query(q)
        dim_values[dim] = df["val"].tolist() if not df.empty else []

    all_dim_rows: list[dict] = []

    for dim in DIMENSIONES:
        if not dim_values.get(dim):
            continue

        for valor in dim_values[dim]:
            filtros = {dim: valor}

            ti = compute_tiempo_instalacion(db, fecha_fin, filtros, dim, valor)
            tpe = compute_tiempo_por_etapa(db, fecha_fin, filtros, dim, valor)
            ef = compute_efectividad(db, fecha_fin, filtros, dim, valor)
            prob = compute_probabilidad_etapa8(db, fecha_fin, filtros, dim, valor)
            resc = compute_rescate_perdidos(db, fecha_fin, filtros, dim, valor)
            totals = _compute_totals(db, fecha_fin, filtros)

            tpe_dict = {r["etapa"]: r.get("tiempo_promedio_horas") for r in tpe}
            ef_dict = {r["etapa"]: r.get("efectividad_pct") for r in ef}

            all_dim_rows.append({
                "periodo": _PERIODO,
                "dimension": dim,
                "valor": valor,
                "total_clientes": totals.get("total_clientes", 0),
                "ganados": totals.get("ganados", 0),
                "perdidos": totals.get("perdidos", 0),
                "etapa_8_count": totals.get("etapa_8_count", 0),
                "etapa_7_count": totals.get("etapa_7_count", 0),
                "pct_etapa8": round(totals.get("etapa_8_count", 0) * 100.0 / max(totals.get("total_clientes", 1), 1), 2),
                "pct_perdidos": round(totals.get("perdidos", 0) * 100.0 / max(totals.get("total_clientes", 1), 1), 2),
                "tiempo_instalacion_promedio_horas": ti.get("horas_promedio", 0) or 0,
                "tiempo_por_etapa_json": json.dumps(tpe_dict),
                "efectividad_json": json.dumps(ef_dict),
                "pct_rescate_perdidos": resc.get("pct_rescate", 0) or 0,
            })

    # 2. Dimensiones especiales SOLO para métricas específicas
    for prob_dim in PROB_DIM_E8:
        prob_rows = _compute_prob_dimension_e8(db, fecha_fin, prob_dim)
        all_dim_rows.extend(prob_rows)
    for prob_dim in PROB_DIM_PERDIDOS_RESCATE:
        prob_rows = _compute_prob_dimension_perdidos_rescate(db, fecha_fin, prob_dim)
        all_dim_rows.extend(prob_rows)

    # Guardar en crm_dimensiones_historico (reemplazar)
    if all_dim_rows:
        df_result = pd.DataFrame(all_dim_rows)

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {DB_SCHEMA}.crm_dimensiones_historico WHERE periodo = %s",
                    [_PERIODO]
                )
            conn.commit()

        db.save_historico(df_result, "crm_dimensiones_historico", _PERIODO)

    dims_ok = [d for d in DIMENSIONES if dim_values.get(d)]
    prob_e8 = [d for d in PROB_DIM_E8]
    prob_perd = [d for d in PROB_DIM_PERDIDOS_RESCATE]
    print(
        f"\nDIMENSIONES CRM | {len(dims_ok)} normales: {', '.join(dims_ok)}"
        f" | E8: {', '.join(prob_e8)} | Perd/Resc: {', '.join(prob_perd)}"
        f" | {len(all_dim_rows)} filas en crm_dimensiones_historico"
    )
