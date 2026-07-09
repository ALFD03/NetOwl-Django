from __future__ import annotations
from datetime import datetime
from ...utils import normalize_text as _safe_motivo
import pandas as pd
from ...database import DBConnector
from ...conf_config import DB_SCHEMA, TableNames
from ..crm_config import (
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
    terminal_types = list(term_map.keys())
    
    sort_cols = ["client_id", "created_at_log"]
    if "id" in df.columns:
        sort_cols.append("id")
    df_sorted = df.sort_values(sort_cols)
    
    is_term = df_sorted["nueva_etapa"].isin(terminal_types)
    base_term = df_sorted["nueva_etapa"].where(is_term).map(term_map)
    next_term = base_term.groupby(df_sorted["client_id"], sort=False).bfill()

    is_fwd = (
        (df_sorted["etapa_anterior"] == etapa_key) &
        (df_sorted["nueva_etapa"].isin(forward_stages))
    )
    
    # OPTIMIZACIÓN (Punto 4): Retenemos la fecha de creación del movimiento para evaluar su antigüedad
    result = df_sorted[is_fwd][["client_id", "nueva_etapa", "created_at_log"]].copy()
    result.columns = ["client_id", "forward_to", "created_at_log"]
    result["outcome"] = next_term[is_fwd]

    # REGLA DE CONTROL DE CALIDAD COMERCIAL:
    # Oportunidades que no han concluido y llevan más de 45 días estancadas en el pipeline
    # se penalizan como fallos ("failure") para evitar inflar la efectividad real.
    STALE_THRESHOLD_DAYS = 45  # Parámetro editable según política de la empresa
    max_date = df_sorted["created_at_log"].max()
    
    if not result.empty and pd.notna(max_date):
        is_nan_outcome = result["outcome"].isna()
        # Calculamos días transcurridos desde el movimiento sin novedades
        days_elapsed = (max_date - result["created_at_log"]).dt.total_seconds() / (24 * 3600)
        
        # Reclasificación
        result.loc[is_nan_outcome & (days_elapsed > STALE_THRESHOLD_DAYS), "outcome"] = "failure"
        result.loc[is_nan_outcome & (days_elapsed <= STALE_THRESHOLD_DAYS), "outcome"] = "in_progress"

    return result

def get_e8_client_attribution_mapping(
    all_stage_detailed: dict[str, pd.DataFrame],
    df_trans: pd.DataFrame,
) -> dict[str, list[str]]:
    """
    Analiza y mapea cada ID de cliente devuelto a Etapa 8 con su etapa penalizada correspondiente.
    Esta es la FUENTE DE VERDAD ÚNICA para la atribución de Etapa 8 global y dimensional.
    """
    from collections import defaultdict
    
    # Mapeo de motivos por cliente
    motivo_map = (
        df_trans.dropna(subset=["devolver_oportunidad"])
        .drop_duplicates(subset=["client_id"], keep="first")
        .set_index("client_id")["devolver_oportunidad"]
        .to_dict()
    )

    # Mapeo de rutas de avance tomadas
    forward_to_maps = {
        stage: df.drop_duplicates("client_id").set_index("client_id")["forward_to"].to_dict()
        for stage, df in all_stage_detailed.items()
    }

    # Pre-compilación de reglas de coincidencia por etapa
    attr_rules_by_stage: dict[str, dict[str, str | list[str] | None]] = defaultdict(dict)
    for rule in ETAPA8_ATRIBUCION:
        for m in rule["motivos"]:
            attr_rules_by_stage[rule["etapa"]][_safe_motivo(m)] = rule.get("forward_to")

    # Clientes detectados en Etapa 8 tras avanzar
    stage_e8_clients: dict[str, set[str]] = {}
    for stage, df in all_stage_detailed.items():
        dev = df[df["outcome"] == "devuelto"]
        stage_e8_clients[stage] = set(dev["client_id"].unique())

    # Clientes devueltos directamente sin transición registrada
    TRACKED_STAGES = list(all_stage_detailed.keys())
    direct_e8_map: dict[str, set[str]] = {s: set() for s in TRACKED_STAGES}
    direct_exits = df_trans[df_trans["nueva_etapa"] == "etapa_8_devueltos"]
    for _, row in direct_exits.iterrows():
        origin = row["etapa_anterior"]
        cid = row["client_id"]
        if origin in direct_e8_map:
            if cid not in stage_e8_clients.get(origin, set()):
                direct_e8_map[origin].add(cid)

    ATTR_ORDER = ["etapa_3_factibilidad", "etapa_4_adecuaciones", "etapa_5_gpi"]

    def _check_stage_rules(cid: str, motivo_str: str, stage: str) -> bool:
        rules_for_stage = attr_rules_by_stage.get(stage)
        if not rules_for_stage or motivo_str not in rules_for_stage:
            return False
        req = rules_for_stage[motivo_str]
        if req is None:
            return True
            
        client_forward = forward_to_maps.get(stage, {}).get(cid)
        if isinstance(req, list):
            return client_forward in req
        return client_forward == req

    all_dev_clients: set[str] = {c for s in stage_e8_clients.values() for c in s}
    for s in direct_e8_map.values():
        all_dev_clients |= s

    mapping: dict[str, list[str]] = {}
    exceptions_set = {_safe_motivo(e) for e in ETAPA8_EXCEPTION_MOTIVOS}

    for cid in all_dev_clients:
        motivo = motivo_map.get(cid)
        m_lower = _safe_motivo(motivo)
        if m_lower in exceptions_set:
            continue

        # Atribución por defecto en caso de motivo vacío
        if m_lower == "":
            penalized = []
            for stage in TRACKED_STAGES:
                if cid in stage_e8_clients.get(stage, set()) or cid in direct_e8_map.get(stage, set()):
                    penalized.append(stage)
            if penalized:
                mapping[cid] = penalized
            continue

        # Evaluación contra reglas de atribución configuradas
        attributed = False
        for stage in ATTR_ORDER:
            if _check_stage_rules(cid, m_lower, stage):
                mapping[cid] = [stage]
                attributed = True
                break
                
        # Penalización por defecto a Ventas si no califica en otra regla
        if not attributed:
            mapping[cid] = ["ventas"]

    return mapping

def _count_e8_attribution(
    all_stage_detailed: dict[str, pd.DataFrame],
    df_trans: pd.DataFrame,
) -> dict[str, int]:
    # Consumimos la lógica unificada
    mapping = get_e8_client_attribution_mapping(all_stage_detailed, df_trans)
    result: dict[str, int] = {}
    for stages in mapping.values():
        for stage in stages:
            result[stage] = result.get(stage, 0) + 1
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
        SELECT l.id, l.client_id, l.etapa_anterior, l.nueva_etapa,
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

    return_attr = _count_return_attribution(all_detailed)
    for r in resultados:
        stage = r["etapa"]
        n_ret = return_attr.get(stage, 0)
        if n_ret > 0:
            r["fallidos"] += n_ret
            r["retornan"] -= n_ret

    e8_attr = _count_e8_attribution(all_detailed, df_trans)
    for r in resultados:
        stage = r["etapa"]
        n_e8 = e8_attr.get(stage, 0)
        r["fallidos"] += n_e8
        r["e8_atribuidos"] = n_e8

    for r in resultados:
        total = r["exitosos"] + r["fallidos"] + r["retornan"] + r["perdida_directa"]
        r["total_salidas"] = total
        r["efectividad_pct"] = round(r["exitosos"] / total * 100, 2) if total > 0 else 100.0

    return resultados
