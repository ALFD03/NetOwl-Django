"""
Modulo independiente de analisis de ciclo de vida de suscriptores.

Lee todos los logs historicos de la BD y construye el historial
completo de transiciones de estado para cada suscriptor, calculando
metricas de tiempo de vida activo y tiempo de cancelacion,
incluyendo desglose por dimensiones.

NO depende del analisis por periodo (ChurnRateAnalyzer).
"""

from __future__ import annotations
import json
import math
from typing import Any, Dict, List, Optional

import pandas as pd

from ..config import ACTIVE_STATE, INACTIVE_STATES, EXCLUDED_STATE, SUBS_STATE_TO_LOG_MAP
from ..database import DBConnector
from .km_utils import compute_km


RELEVANT_STATES = {ACTIVE_STATE} | INACTIVE_STATES
DIMS = ["Zona", "Sucursal", "Municipio", "campanna", "Producto"]


def _normalize_estado(series: pd.Series) -> pd.Series:
    """Normaliza estados a formato interno."""
    return (
        series.astype(str)
        .str.strip()
        .str.lower()
    )


def load_data() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Carga suscripciones y logs desde la BD.

    Returns:
        (df_subs, df_logs_v1, df_logs_v15): DataFrames con datos crudos.
    """
    db = DBConnector()
    subs = db.read_table("Subscripciones")
    subs = subs.rename(columns={
        "Orden_Producto": "orden",
        "fecha_inicio": "f_ini",
    })
    subs["orden"] = subs["orden"].astype(str).str.strip()
    subs["f_ini_dt"] = pd.to_datetime(subs["f_ini"], errors="coerce")
    for col in DIMS:
        if col in subs.columns:
            subs[col] = subs[col].astype(str).str.strip()

    if "Estado" in subs.columns:
        subs["estado_subs"] = _normalize_estado(subs["Estado"])
        subs["estado_subs"] = (
            subs["estado_subs"]
            .map(SUBS_STATE_TO_LOG_MAP)
            .fillna(EXCLUDED_STATE)
        )
    else:
        subs["estado_subs"] = EXCLUDED_STATE
    subs = subs.drop_duplicates(subset=["orden"])

    l1 = db.read_table("Subscripciones-logs", columns=[
        "orden", "fecha_log", "log", "estado"
    ])
    l1 = l1.rename(columns={"fecha_log": "fecha"})
    l1["fuente"] = "v1"

    try:
        l2 = db.read_table("Subscripciones-logs-v15", columns=[
            "orden", "tipo", "categoria", "fecha"
        ])
        l2["nota"] = l2["tipo"]
        l2["estado"] = _normalize_estado(l2["categoria"].map({
            "En progreso": "3_progress",
            "Cerrado": "6_churn",
        }).fillna(l2["categoria"]))
        l2["fuente"] = "v15"
    except Exception:
        l2 = pd.DataFrame(columns=["orden", "fecha", "estado", "fuente"])

    return subs, l1, l2


def build_clean_logs(
    l1: pd.DataFrame,
    l2: pd.DataFrame,
) -> pd.DataFrame:
    """Normaliza y combina logs v1 y v15.

    Returns:
        DataFrame con columnas: orden, f_dt, estado.
    """
    cols_base = ["orden", "fecha", "estado"]
    for df in [l1, l2]:
        for c in list(df.columns):
            if c not in cols_base:
                df.drop(columns=[c], inplace=True, errors="ignore")

    combined = pd.concat([l1, l2], ignore_index=True, sort=False)
    combined["orden"] = combined["orden"].astype(str).str.strip()
    combined["estado"] = _normalize_estado(combined["estado"])
    combined["f_dt"] = pd.to_datetime(combined["fecha"], errors="coerce")
    combined = combined.dropna(subset=["orden", "f_dt"])
    combined = combined.sort_values(["orden", "f_dt"]).reset_index(drop=True)
    return combined


def build_lifecycle_periods(
    subs: pd.DataFrame,
    logs: pd.DataFrame,
) -> pd.DataFrame:
    """Construye periodos de vida activo/cancelado por suscriptor.

    Para cada suscriptor recorre sus logs cronologicamente e identifica
    cada transicion entre estado activo (3_progress) e inactivo
    (4_paused, 6_churn, 8_30days).

    Returns:
        DataFrame con columnas:
        orden, tipo (activo/cancelado), f_inicio, f_fin, duracion (dias),
        evento (1=completado, 0=censurado), periodo_idx.
    """
    relevant = logs[logs["estado"].isin(RELEVANT_STATES)].copy()
    last_global = relevant["f_dt"].max()
    f_ini_map = subs.set_index("orden")["f_ini_dt"].to_dict()

    rows: List[Dict[str, Any]] = []

    for orden, group in relevant.groupby("orden"):
        if orden not in f_ini_map:
            continue
        f_ini = f_ini_map[orden]
        if pd.isna(f_ini):
            continue
        group = group.sort_values("f_dt")
        estados = group["estado"].tolist()
        fechas = group["f_dt"].tolist()

        active_start = f_ini
        inactive_start = None
        prev_state = None
        prev_was_inactive = False
        pidx = 0

        for i, (st, fecha) in enumerate(zip(estados, fechas)):
            if st == ACTIVE_STATE:
                if prev_was_inactive:
                    dur = max((fecha - inactive_start).days, 0)
                    rows.append({
                        "orden": orden, "tipo": "cancelado",
                        "f_inicio": inactive_start, "f_fin": fecha,
                        "duracion": dur, "evento": 1,
                        "periodo_idx": pidx,
                    })
                    pidx += 1
                    active_start = fecha
                elif prev_state is None:
                    dur_a = max((fecha - active_start).days, 0)
                    if dur_a > 0:
                        rows.append({
                            "orden": orden, "tipo": "activo",
                            "f_inicio": active_start, "f_fin": fecha,
                            "duracion": dur_a, "evento": 1,
                            "periodo_idx": pidx,
                        })
                        pidx += 1
                        active_start = fecha
                prev_state = ACTIVE_STATE
                prev_was_inactive = False

            elif st in INACTIVE_STATES:
                if not prev_was_inactive and prev_state == ACTIVE_STATE:
                    dur = max((fecha - active_start).days, 0)
                    rows.append({
                        "orden": orden, "tipo": "activo",
                        "f_inicio": active_start, "f_fin": fecha,
                        "duracion": dur, "evento": 1,
                        "periodo_idx": pidx,
                    })
                    pidx += 1
                    inactive_start = fecha
                elif prev_state is None:
                    inactive_start = fecha
                prev_state = st
                prev_was_inactive = True

        if not prev_was_inactive and prev_state == ACTIVE_STATE:
            dur = max((last_global - active_start).days, 0)
            rows.append({
                "orden": orden, "tipo": "activo",
                "f_inicio": active_start, "f_fin": last_global,
                "duracion": dur, "evento": 0,
                "periodo_idx": pidx,
            })
        elif prev_was_inactive:
            dur = max((last_global - inactive_start).days, 0)
            rows.append({
                "orden": orden, "tipo": "cancelado",
                "f_inicio": inactive_start, "f_fin": last_global,
                "duracion": dur, "evento": 0,
                "periodo_idx": pidx,
            })

    return pd.DataFrame(rows)


def compute_metrics(periods: pd.DataFrame) -> Dict[str, Any]:
    """Calcula metricas globales de ciclo de vida.

    - Primer periodo activo: KM (evento = primera vez que entra a inactivo)
    - Reactivacion (solo evento=1, duracion >= 15): KM + estadisticas
    """
    result: Dict[str, Any] = {}

    first_active = (
        periods[periods["tipo"] == "activo"]
        .sort_values(["orden", "periodo_idx"])
        .groupby("orden")
        .first()
        .reset_index()
    )
    if not first_active.empty:
        km_act = compute_km(
            first_active["duracion"],
            first_active["evento"],
            "Primer periodo activo"
        )
        result["curva_activo"] = km_act["curva"]
        result["mediana_activo"] = km_act["mediana"]
        result["promedio_activo"] = round(float(first_active["duracion"].mean()), 1)
        result["p25_activo"] = km_act["p25"]
        result["p75_activo"] = km_act["p75"]
        result["n_total_activo"] = km_act["n_total"]
        result["n_evento_activo"] = km_act["n_evento"]
        result["n_censurado_activo"] = km_act["n_censurado"]
    else:
        for k in ["curva_activo", "mediana_activo", "promedio_activo",
                   "p25_activo", "p75_activo",
                   "n_total_activo", "n_evento_activo", "n_censurado_activo"]:
            result[k] = None

    # ── Reactivacion (solo evento=1, duracion >= 15) ──
    can = periods[periods["tipo"] == "cancelado"].copy()
    react = can[can["evento"] == 1].copy()
    react = react[react["duracion"] >= 15]
    if not react.empty:
        result["promedio_reactivacion"] = round(float(react["duracion"].mean()), 1)
        result["n_total_reactivacion"] = int(len(react))
        km_react = compute_km(react["duracion"], react["evento"], "Reactivacion")
        result["mediana_reactivacion"] = km_react["mediana"]
        result["p25_reactivacion"] = km_react["p25"]
        result["p75_reactivacion"] = km_react["p75"]
        result["curva_reactivacion"] = km_react["curva"]
        result["n_evento_reactivacion"] = km_react["n_evento"]
        result["n_censurado_reactivacion"] = km_react["n_censurado"]
    else:
        for k in ["promedio_reactivacion", "n_total_reactivacion",
                   "mediana_reactivacion", "p25_reactivacion", "p75_reactivacion",
                   "curva_reactivacion", "n_evento_reactivacion",
                   "n_censurado_reactivacion"]:
            result[k] = None

    if not periods.empty:
        ciclos = (
            periods[periods["tipo"] == "activo"]
            .groupby("orden")
            .size()
        )
        result["ciclos_por_suscriptor"] = {
            "min": int(ciclos.min()) if len(ciclos) else 0,
            "max": int(ciclos.max()) if len(ciclos) else 0,
            "mediana": float(ciclos.median()) if len(ciclos) else 0,
            "promedio": float(ciclos.mean()) if len(ciclos) else 0,
        }
    else:
        result["ciclos_por_suscriptor"] = {}

    suscriptores_con_evento = set(first_active[first_active["evento"] == 1]["orden"])
    if not first_active.empty:
        todos = set(first_active["orden"])
        nunca_inactivos = todos - suscriptores_con_evento
        result["suscriptores_nunca_inactivos"] = len(nunca_inactivos)
        result["suscriptores_totales"] = len(todos)
    else:
        result["suscriptores_nunca_inactivos"] = 0
        result["suscriptores_totales"] = 0

    return result


def compute_dimension_metrics(
    subs: pd.DataFrame,
    periods: pd.DataFrame,
) -> pd.DataFrame:
    """Calcula curvas KM por dimension (zona, sucursal, municipio, etc.).

    Para cada dimension y cada valor, computa KM del primer periodo activo
    y KM + estadisticas de tiempo hasta reactivacion (evento=1, >=15d).

    Returns:
        DataFrame con columnas: dimension, valor,
        mediana_activo, p25_activo, p75_activo, curva_activo_json,
        n_total_activo, n_evento_activo, n_censurado_activo,
        promedio_reactivacion, mediana_reactivacion, p25_reactivacion,
        p75_reactivacion, n_total_reactivacion, curva_reactivacion_json.
    """
    rows: List[Dict[str, Any]] = []

    subs_dedup = subs.drop_duplicates(subset=["orden"])
    subs_dedup = subs_dedup.set_index("orden")

    first_active = (
        periods[periods["tipo"] == "activo"]
        .sort_values(["orden", "periodo_idx"])
        .groupby("orden")
        .first()
        .reset_index()
    )
    canceled = periods[periods["tipo"] == "cancelado"].copy()

    for dim in DIMS:
        if dim not in subs_dedup.columns:
            continue
        default = f"Sin {dim}"
        dim_map = subs_dedup[dim].fillna(default).to_dict()

        first_active_d = first_active.copy()
        first_active_d["_dim"] = first_active_d["orden"].map(dim_map).fillna(default)

        canceled_d = canceled.copy()
        canceled_d["_dim"] = canceled_d["orden"].map(dim_map).fillna(default)

        for dim_val in first_active_d["_dim"].unique():
            grp_act = first_active_d[first_active_d["_dim"] == dim_val]
            grp_can = canceled_d[canceled_d["_dim"] == dim_val]

            if grp_act.empty:
                continue

            km_act = compute_km(grp_act["duracion"], grp_act["evento"], dim_val)

            # ── Reactivacion (evento=1, duracion >= 15) ──
            grp_react = grp_can[grp_can["evento"] == 1].copy()
            grp_react = grp_react[grp_react["duracion"] >= 15]
            if not grp_react.empty:
                prom_react = round(float(grp_react["duracion"].mean()), 1)
                n_react = int(len(grp_react))
                km_react = compute_km(grp_react["duracion"], grp_react["evento"], dim_val)
            else:
                prom_react = n_react = None
                km_react = {"mediana": None, "p25": None, "p75": None,
                            "n_total": 0, "n_evento": 0, "n_censurado": 0, "curva": []}

            rows.append({
                "dimension": dim,
                "valor": dim_val,
                "mediana_activo": km_act["mediana"],
                "p25_activo": km_act["p25"],
                "p75_activo": km_act["p75"],
                "curva_activo_json": json.dumps(km_act["curva"]),
                "n_total_activo": km_act["n_total"],
                "n_evento_activo": km_act["n_evento"],
                "n_censurado_activo": km_act["n_censurado"],
                # Tiempo hasta reactivacion
                "promedio_reactivacion": prom_react,
                "mediana_reactivacion": km_react["mediana"],
                "p25_reactivacion": km_react["p25"],
                "p75_reactivacion": km_react["p75"],
                "n_total_reactivacion": n_react,
                "n_evento_reactivacion": km_react["n_evento"],
                "n_censurado_reactivacion": km_react["n_censurado"],
                "curva_reactivacion_json": json.dumps(km_react["curva"]),
            })

    return pd.DataFrame(rows)


def run_lifecycle_analysis() -> Dict[str, Any]:
    """Ejecuta el analisis de ciclo de vida completo.

    Carga datos, construye periodos, calcula metricas globales y
    por dimension, y persiste todo.

    Returns:
        Dict con metricas calculadas.
    """
    subs, l1, l2 = load_data()
    logs = build_clean_logs(l1, l2)
    periods = build_lifecycle_periods(subs, logs)
    metrics = compute_metrics(periods)

    db = DBConnector()

    # Persistir periodos
    if not periods.empty:
        periods_out = periods.copy()
        for col in ["f_inicio", "f_fin"]:
            periods_out[col] = periods_out[col].astype(str)
        db.save_historico(periods_out, "lifetime_periodos", "global", "lifetime")

    # Persistir metricas globales como JSON
    metrics_flat: Dict[str, Any] = {}
    for k, v in metrics.items():
        if k in ("curva_activo", "curva_reactivacion"):
            continue
        if isinstance(v, dict):
            metrics_flat[k] = json.dumps(v)
        else:
            metrics_flat[k] = v
    metrics_flat["curva_activo_json"] = json.dumps(metrics.get("curva_activo", []))
    metrics_flat["curva_reactivacion_json"] = json.dumps(metrics.get("curva_reactivacion", []))
    df_metrics = pd.DataFrame([metrics_flat])
    db.save_historico(df_metrics, "lifetime_metricas", "global", "lifetime")

    # Persistir metricas por dimension
    dim_df = compute_dimension_metrics(subs, periods)
    if not dim_df.empty:
        db.save_historico(dim_df, "lifetime_dimensiones", "global", "lifetime")

    print(f"\nLIFECYCLE ANALYSIS COMPLETE")
    print(f"  Suscriptores analizados: {metrics.get('suscriptores_totales', 0)}")
    print(f"  Nunca inactivos: {metrics.get('suscriptores_nunca_inactivos', 0)}")
    print(f"  Periodos activo registrados: {len(periods[periods['tipo']=='activo']) if not periods.empty else 0}")
    print(f"  Periodos cancelado registrados: {len(periods[periods['tipo']=='cancelado']) if not periods.empty else 0}")
    print(f"  Vida activa - mediana: {metrics.get('mediana_activo', 'N/A')} d | prom: {metrics.get('promedio_activo', 'N/A')} d")
    print(f"  Reactivacion - mediana: {metrics.get('mediana_reactivacion', 'N/A')} d | prom: {metrics.get('promedio_reactivacion', 'N/A')} d | n={metrics.get('n_total_reactivacion', 0)}")
    print(f"  Ciclos por sub: {metrics.get('ciclos_por_suscriptor', {})}")
    print(f"  Dimensiones calculadas: {len(dim_df) if not dim_df.empty else 0} filas")

    return metrics


def get_lifecycle_results() -> Dict[str, Any]:
    """Recupera metricas de ciclo de vida desde la BD."""
    db = DBConnector()
    try:
        df = db.read_table("lifetime_metricas")
        if df.empty:
            return {}
        row = df.iloc[-1]
        result = {}
        for col in df.columns:
            if col in ("curva_activo_json", "curva_reactivacion_json"):
                key = col.replace("_json", "")
                result[key] = json.loads(row.get(col) or "[]")
            elif col == "ciclos_por_suscriptor":
                result[col] = json.loads(row.get(col) or "{}")
            elif col in ("periodo_reporte", "metodo_calculo"):
                continue
            else:
                val = row.get(col)
                if val is not None:
                    try:
                        f = float(val)
                        if math.isnan(f):
                            result[col] = None
                        else:
                            result[col] = int(f) if "." not in str(val) else f
                    except (ValueError, TypeError):
                        result[col] = val
                else:
                    result[col] = None
        return result
    except Exception:
        return {}


def _safe_int(v):
    """Convierte a int manejando None y strings float como '128.0'."""
    if v is None:
        return 0
    try:
        return int(v)
    except (ValueError, TypeError):
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return 0


def get_lifetime_dimensiones(
    dim: Optional[str] = None,
) -> Dict[str, Any]:
    """Recupera curvas KM por dimension desde la BD.

    Args:
        dim: Nombre de dimension a filtrar (opcional).

    Returns:
        Dict ``{dimension: {valor: {mediana_activo, curva_activo, ...}}}``.
    """
    db = DBConnector()
    try:
        df = db.read_table("lifetime_dimensiones")
        if df.empty:
            return {}
        if dim:
            df = df[df["dimension"] == dim]
        result: Dict[str, Any] = {}
        for _, row in df.iterrows():
            d = str(row.get("dimension", ""))
            v = str(row.get("valor", ""))
            if d not in result:
                result[d] = {}
            curva_act = json.loads(row.get("curva_activo_json") or "[]")
            curva_react = json.loads(row.get("curva_reactivacion_json") or "[]")
            result[d][v] = {
                "mediana_activo": _safe_float(row.get("mediana_activo")),
                "p25_activo": _safe_float(row.get("p25_activo")),
                "p75_activo": _safe_float(row.get("p75_activo")),
                "curva_activo": curva_act,
                "n_total_activo": _safe_int(row.get("n_total_activo")),
                "n_evento_activo": _safe_int(row.get("n_evento_activo")),
                # Tiempo hasta reactivacion
                "promedio_reactivacion": _safe_float(row.get("promedio_reactivacion")),
                "mediana_reactivacion": _safe_float(row.get("mediana_reactivacion")),
                "p25_reactivacion": _safe_float(row.get("p25_reactivacion")),
                "p75_reactivacion": _safe_float(row.get("p75_reactivacion")),
                "n_total_reactivacion": _safe_int(row.get("n_total_reactivacion")),
                "n_evento_reactivacion": _safe_int(row.get("n_evento_reactivacion")),
                "n_censurado_reactivacion": _safe_int(row.get("n_censurado_reactivacion")),
                "curva_reactivacion": curva_react,
            }
        return result
    except Exception:
        return {}


def _safe_float(val):
    """Convierte a float manejando None."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
