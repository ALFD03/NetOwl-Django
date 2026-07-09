from __future__ import annotations
import json
import logging
import math
from typing import Any, Dict, Optional
import pandas as pd
from ...conf_config import TableNames
from ...database import DBConnector

logger = logging.getLogger(__name__)

def get_lifecycle_results(db=None) -> Dict[str, Any]:
    if db is None:
        db = DBConnector()
    try:
        df = db.read_table(TableNames.LIFETIME_METRICAS)
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
        logger.exception("Error getting lifecycle results")
        return {}

def _safe_int(v):
    if v is None:
        return 0
    try:
        return int(v)
    except (ValueError, TypeError):
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return 0

def get_lifetime_dimensiones(dim: Optional[str] = None, db=None) -> Dict[str, Any]:
    if db is None:
        db = DBConnector()
    try:
        df = db.read_table(TableNames.LIFETIME_DIMENSIONES)
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
        logger.exception("Error getting lifetime dimensiones")
        return {}

def _safe_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
