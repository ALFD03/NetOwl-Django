from __future__ import annotations
import json
import math
from datetime import datetime
from typing import Any, Dict

from ...database import DBConnector
from ...conf_config import DB_SCHEMA, TableNames
from ..crm_config import DIMENSIONES, dim_col


def _build_where_filtros(filtros: Dict[str, Any] | None) -> tuple[str, list]:
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


def _clean_nan(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_clean_nan(v) for v in obj]
    elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    elif type(obj).__module__ == 'numpy':
        return obj.item() if hasattr(obj, 'item') else obj
    return obj


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
        FROM {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c
        WHERE {where_dim}
          {fecha_sql}
    """
    df = db.query(q, params=params)
    return df.to_dict("records")[0] if not df.empty else {}


def compute_and_save_all_global(
    db: DBConnector,
    fecha_fin: datetime | None = None,
) -> dict:
    from .tiempo import compute_tiempo_instalacion, compute_tiempo_por_etapa
    from .efectividad import compute_efectividad
    from .probabilidad import compute_probabilidad_etapa8, compute_probabilidad_perdido
    from .rescate import compute_rescate_perdidos

    results: dict = {}

    totals = _compute_totals(db, fecha_fin)
    results["totals"] = totals

    ti = compute_tiempo_instalacion(db, fecha_fin)
    results["tiempo_instalacion"] = ti

    tpe = compute_tiempo_por_etapa(db, fecha_fin)
    results["tiempo_por_etapa"] = {r["etapa"]: r for r in tpe}

    ef = compute_efectividad(db, fecha_fin)
    results["efectividad"] = ef

    prob_e8 = compute_probabilidad_etapa8(db, fecha_fin)
    results["etapa8"] = prob_e8

    prob_perd = compute_probabilidad_perdido(db, fecha_fin)
    results["perdido"] = prob_perd

    resc = compute_rescate_perdidos(db, fecha_fin)
    results["rescate"] = resc

    _upsert_globales(db, results)
    return results


def _upsert_globales(db: DBConnector, results: dict):
    row = {}
    col_map = {
        "totals": "totals",
        "tiempo_instalacion": "tiempo_instalacion",
        "tiempo_por_etapa": "tiempo_por_etapa",
        "efectividad": "efectividad",
        "etapa8": "etapa8",
        "perdido": "perdido",
        "rescate": "rescate",
    }
    for key, col in col_map.items():
        row[col] = json.dumps(_clean_nan(results.get(key, {})), default=str)

    cols = ", ".join(row.keys())
    placeholders = ", ".join(f"%s" for _ in row)

    values = []
    for v in row.values():
        if v is None:
            values.append(None)
        else:
            values.append(v)

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} (id, {cols})
                VALUES (1, {placeholders})
                ON CONFLICT (id) DO UPDATE SET {', '.join(f'{k} = EXCLUDED.{k}' for k in row)}
                """,
                values
            )
        conn.commit()
