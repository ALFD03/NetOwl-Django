from __future__ import annotations
from datetime import datetime

import pandas as pd

from ...database import DBConnector
from ...config import DB_SCHEMA, TableNames
from ..config import (
    DIMENSIONES, EFECTIVIDAD_REGLAS, ETAPA8_ATRIBUCION,
    ETAPA8_EXCEPTION_MOTIVOS, RETORNO_ATRIBUCION, dim_col,
)
from .core import _build_where_filtros, _build_fecha_fin_sql


def _classify_forward_cycles_detailed(
    df: pd.DataFrame,
    etapa_key: str,
    forward_stages: list[str],
    term_map: dict[str, str],
) -> pd.DataFrame:
    """Returns DataFrame with columns: [client_id, forward_to, outcome]
    
    outcome: success | failure | return | devuelto | NaN
    - 'devuelto' means the forward move's next terminal was etapa_8
    - NaN means no terminal found after the forward move
    """
    terminal_types = list(term_map.keys())
    df_sorted = df.sort_values(["client_id", "created_at_log"])
    is_term = df_sorted["nueva_etapa"].isin(terminal_types)
    base_term = df_sorted["nueva_etapa"].where(is_term).map(term_map)
    next_term = base_term.groupby(df_sorted["client_id"], sort=False).bfill()

    is_fwd = (
        (df_sorted["etapa_anterior"] == etapa_key) &
        (df_sorted["nueva_etapa"].isin(forward_stages))
    )
    result = df_sorted[is_fwd][["client_id", "nueva_etapa"]].copy()
    result.columns = ["client_id", "forward_to"]
    result["outcome"] = next_term[is_fwd]
    return result


def _get_client_motivo(df: pd.DataFrame, client_id: str) -> str | None:
    """Obtiene devolver_oportunidad para un cliente (no nulo)."""
    mask = df["client_id"] == client_id
    valores = df.loc[mask, "devolver_oportunidad"].dropna().unique()
    return str(valores[0]).strip() if len(valores) > 0 else None


def _safe_motivo(m: str | None) -> str:
    return "" if m is None else str(m).strip().lower()


def _count_e8_attribution(
    all_stage_detailed: dict[str, pd.DataFrame],
    df_trans: pd.DataFrame,
) -> dict[str, int]:
    """Atribuye cada cliente en etapa_8 a una etapa.
    Returns {etapa: count_failures}
    """
    # Collect all unique client_ids with "devuelto" outcome per stage (from forward cycles)
    stage_e8_clients: dict[str, set[str]] = {}
    for stage, df in all_stage_detailed.items():
        dev = df[df["outcome"] == "devuelto"]
        stage_e8_clients[stage] = set(dev["client_id"].unique())

    # Collect direct exits to etapa_8 (etapa_anterior -> etapa_8) that are NOT forward moves
    # This captures cases where a client was directly sent to etapa_8 from a stage
    # without having made any forward move from that stage first
    TRACKED_STAGES = list(all_stage_detailed.keys())
    direct_e8_map: dict[str, set[str]] = {s: set() for s in TRACKED_STAGES}
    direct_exits = df_trans[df_trans["nueva_etapa"] == "etapa_8_devueltos"]
    for _, row in direct_exits.iterrows():
        origin = row["etapa_anterior"]
        cid = row["client_id"]
        if origin in direct_e8_map:
            # Only add if this client was NOT already captured by a forward cycle devuelto
            # for this stage (avoids double-counting)
            if cid not in stage_e8_clients.get(origin, set()):
                direct_e8_map[origin].add(cid)

    result: dict[str, int] = {}

    def _check_stage_rules(cid: str, motivo_str: str, stage: str) -> bool:
        rules = [r for r in ETAPA8_ATRIBUCION if r["etapa"] == stage]
        if not rules:
            return False
        dmot = all_stage_detailed.get(stage)
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

    ATTR_ORDER = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi"]

    # All clients that reached etapa_8: from forward cycles OR direct exits
    all_dev_clients: set[str] = {c for s in stage_e8_clients.values() for c in s}
    for s in direct_e8_map.values():
        all_dev_clients |= s

    for cid in all_dev_clients:
        motivo = _get_client_motivo(df_trans, cid)
        m_lower = _safe_motivo(motivo)
        if m_lower in {_safe_motivo(e) for e in ETAPA8_EXCEPTION_MOTIVOS}:
            continue

        if m_lower == "":
            # None motive -> penalize all stages where this client had a devuelto outcome
            # (from forward cycles) AND stages from which it exited directly to etapa_8
            penalized: set[str] = set()
            for stage in stage_e8_clients:
                if cid in stage_e8_clients[stage]:
                    penalized.add(stage)
            for stage, direct_clients in direct_e8_map.items():
                if cid in direct_clients:
                    penalized.add(stage)
            for stage in penalized:
                result[stage] = result.get(stage, 0) + 1
            continue

        attributed = False
        for stage in ATTR_ORDER:
            if _check_stage_rules(cid, m_lower, stage):
                result[stage] = result.get(stage, 0) + 1
                attributed = True
                break
        if not attributed:
            result["ventas"] = result.get("ventas", 0) + 1

    return result


def _count_return_attribution(
    all_stage_detailed: dict[str, pd.DataFrame],
) -> dict[str, int]:
    """Retornos que se reclasifican a failure."""
    result: dict[str, int] = {}
    for stage, df in all_stage_detailed.items():
        ret = df[df["outcome"] == "return"]
        for _, row in ret.iterrows():
            forward_to = row["forward_to"]
            for rule in RETORNO_ATRIBUCION:
                if rule["etapa"] == stage and rule["forward_to"] == forward_to:
                    result[stage] = result.get(stage, 0) + 1
                    break
    return result


def compute_efectividad(
    db: DBConnector,
    fecha_fin: datetime | None = None,
    filtros: dict | None = None,
) -> list[dict]:
    where_dim, params_dim = _build_where_filtros(filtros)
    fecha_sql, fecha_params = _build_fecha_fin_sql(fecha_fin, "l")
    params = params_dim + fecha_params

    transitions_q = f"""
        SELECT l.client_id, l.etapa_anterior, l.nueva_etapa,
               l.created_at_log, c.devolver_oportunidad
        FROM {DB_SCHEMA}.{TableNames.CRM_LOGS} l
        JOIN {DB_SCHEMA}.{TableNames.CRM_CLIENTS} c ON l.client_id = c.id
        WHERE {where_dim}
          {fecha_sql}
    """
    df_trans = db.query(transitions_q, params=params)
    resultados: list[dict] = []

    if df_trans.empty:
        return resultados

    # Phase 1: Run forward cycles for all stages
    all_detailed: dict[str, pd.DataFrame] = {}
    for etapa_key, regla in EFECTIVIDAD_REGLAS.items():
        forward_stages = regla["forward"]
        term_map = regla["term_map"]
        direct_loss = regla["direct_loss"]
        fwd_key = regla.get("forward_key", etapa_key)

        detailed = _classify_forward_cycles_detailed(
            df_trans, fwd_key, forward_stages, term_map,
        )
        all_detailed[etapa_key] = detailed

        n_exitoso = int((detailed["outcome"] == "success").sum())
        n_fallido = int((detailed["outcome"] == "failure").sum())
        n_retorna = int((detailed["outcome"] == "return").sum())

        n_lost_directo = len(df_trans[
            (df_trans["etapa_anterior"] == fwd_key) &
            (df_trans["nueva_etapa"].isin(direct_loss))
        ])

        resultados.append({
            "etapa": etapa_key,
            "total_salidas": 0,
            "retornos": n_retorna,
            "efectividad_pct": 0.0,
            "exitosos": n_exitoso,
            "fallidos": n_fallido,
            "retornan": n_retorna,
            "perdida_directa": n_lost_directo,
            "e8_atribuidos": 0,
        })

    # Phase 2: Post-process returns (reclassify return -> failure for some routes)
    return_attr = _count_return_attribution(all_detailed)
    for r in resultados:
        stage = r["etapa"]
        n_ret = return_attr.get(stage, 0)
        if n_ret > 0:
            r["fallidos"] += n_ret
            r["retornan"] -= n_ret

    # Phase 3: Post-process e8 attribution
    e8_attr = _count_e8_attribution(all_detailed, df_trans)
    for r in resultados:
        stage = r["etapa"]
        n_e8 = e8_attr.get(stage, 0)
        r["fallidos"] += n_e8
        r["e8_atribuidos"] = n_e8

    # Phase 4: Calculate totals and efectividad_pct
    for r in resultados:
        total = r["exitosos"] + r["fallidos"] + r["retornan"] + r["perdida_directa"]
        r["total_salidas"] = total
        r["efectividad_pct"] = round(r["exitosos"] / total * 100, 2) if total > 0 else 100.0

    return resultados
