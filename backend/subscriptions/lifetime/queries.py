from __future__ import annotations
import json
import logging
import math
from typing import Any, Dict, Optional
import pandas as pd
from ...conf_config import TableNames
from ...database import DBConnector

logger = logging.getLogger(__name__)


def _clean_value(val: Any) -> Any:
    """Convierte tipos de Pandas/NumPy a tipos nativos de Python y elimina NaNs."""
    if pd.isna(val) or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    if isinstance(val, (pd.Timestamp, pd.DatetimeIndex)):
        return str(val)
    if hasattr(val, 'item'): # Tipos de NumPy (int64, float64)
        return val.item()
    return val

def get_lifecycle_results(db=None) -> Dict[str, Any]:
    if db is None:
        db = DBConnector()
    try:
        df = db.read_table(TableNames.LIFETIME_METRICAS)
        if df.empty:
            return {}
        
        # Tomar la última fila y convertir a diccionario nativo
        row_raw = df.iloc[-1].to_dict()
        result = {}

        for col, val in row_raw.items():
            if col in ("curva_activo_json", "curva_reactivacion_json"):
                key = col.replace("_json", "")
                try:
                    result[key] = json.loads(val) if val else []
                except:
                    result[key] = []
            elif col == "ciclos_por_suscriptor":
                try:
                    result[col] = json.loads(val) if val else {}
                except:
                    result[col] = {}
            elif col in ("periodo_reporte", "metodo_calculo"):
                continue
            else:
                result[col] = _clean_value(val)
        return result
    except Exception:
        logger.exception("Error en query de lifecycle results")
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
            
        result = {}
        for _, row in df.iterrows():
            d = str(row.get("dimension", ""))
            v = str(row.get("valor", ""))
            if d not in result:
                result[d] = {}
                
            result[d][v] = {
                "mediana_activo": _clean_value(row.get("mediana_activo")),
                "p25_activo": _clean_value(row.get("p25_activo")),
                "p75_activo": _clean_value(row.get("p75_activo")),
                "n_total_activo": int(row.get("n_total_activo") or 0),
                "n_evento_activo": int(row.get("n_evento_activo") or 0),
                "promedio_reactivacion": _clean_value(row.get("promedio_reactivacion")),
                "mediana_reactivacion": _clean_value(row.get("mediana_reactivacion")),
                "curva_activo": json.loads(row.get("curva_activo_json") or "[]"),
                "curva_reactivacion": json.loads(row.get("curva_reactivacion_json") or "[]"),
            }
        return result
    except Exception:
        logger.exception("Error en query de dimensiones lifetime")
        return {}

def _safe_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
