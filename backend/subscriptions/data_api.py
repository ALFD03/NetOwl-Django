"""
Capa de acceso a datos para las vistas del frontend (thin views).

Dependencias esperadas:
- `database.DBConnector`: Conexión a PostgreSQL para lectura de tablas.
- `pandas` (transitivo): DataFrames para manipulación de datos.

Proporciona funciones de lectura que transforman tablas de base de datos
en estructuras anidadas (dicts/listas) listas para serializar a JSON
y consumir desde el frontend. Cada función maneja excepciones de BD
retornando estructuras vacías ante errores.
"""

from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
from ..config import TableNames
from ..database import DBConnector

logger = logging.getLogger(__name__)


def get_cierre_churn(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Recupera los datos de cierre de churn por período (lista plana).

    Lee la tabla ``analyzer_cierre_historico`` y retorna una lista de
    diccionarios, uno por período, con todos los indicadores calculados.

    Args:
        periodos: Lista opcional de períodos a filtrar.

    Returns:
        Lista de dicts ordenada por período descendente, con campos:
        ``periodo_reporte``, ``activos_inicio``, ``activos_final``,
        ``nuevos_mes``, ``churn_neto_pct``, ``churn_bruto_pct``, etc.
        Retorna lista vacía si la tabla está vacía o hay error.
    """
    db = DBConnector()
    try:
        df = db.read_table_filtered(TableNames.ANALYZER_CIERRE_HISTORICO, "periodo_reporte", periodos)
        if df.empty:
            return []
        result: List[Dict[str, Any]] = []
        for _, row in df.iterrows():
            result.append({
                "periodo_reporte": str(row.get("periodo_reporte", "")),
                "activos_inicio": int(row.get("activos_inicio") or 0),
                "activos_final": int(row.get("activos_final") or 0),
                "nuevos_mes": int(row.get("nuevos_mes") or 0),
                "bajas_netas": int(row.get("bajas_netas") or 0),
                "bajas_brutas": int(row.get("bajas_brutas") or 0),
                "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
                "churn_bruto_pct": float(row.get("churn_bruto_pct") or 0),
                "reactivaciones": int(row.get("reactivaciones") or 0),
                "react_val": int(row.get("react_val") or 0),
                "react_6_churn": int(row.get("react_6_churn") or 0),
                "react_8_30days": int(row.get("react_8_30days") or 0),
                "react_4_paused": int(row.get("react_4_paused") or 0),
                "react_4_P": int(row.get("react_4_p") or 0),
                "react_4_H": int(row.get("react_4_h") or 0),
                "tasa_winback_pct": float(row.get("tasa_winback_pct") or 0),
                "total_billing": float(row.get("total_billing") or 0),
                "arpu": float(row.get("arpu") or 0),
                "corte_impagado": int(row.get("corte_impagado") or 0),
                "porcentaje_suspensiones": float(row.get("porcentaje_suspensiones") or 0),
                "total_inactivos": int(row.get("total_inactivos") or 0),
                "tasa_aporte_react_pct": float(row.get("tasa_aporte_react_pct") or 0),
                "indice_reemplazo_react_pct": float(row.get("indice_reemplazo_react_pct") or 0),
                "adiciones_brutas": int(row.get("adiciones_brutas") or 0),
                "adiciones_netas": int(row.get("adiciones_netas") or 0),
            })
        return sorted(result, key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        logger.exception("Error getting churn cierre")
        return []


def get_dimensiones(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Recupera datos de churn desglosados por dimensiones.

    Lee la tabla ``analyzer_churn_dimensiones`` y agrupa en una estructura
    anidada de tres niveles: ``periodo_reporte → dimensión → valores``.

    Args:
        periodos: Lista opcional de períodos a filtrar.

    Returns:
        Lista de dicts ordenada por período descendente, cada uno con:
        ``{"periodo_reporte": str, "dimensiones": {dim: [valor_dict, ...]}}``.
        Retorna lista vacía si la tabla está vacía o hay error.
    """
    db = DBConnector()
    try:
        df = db.read_table_filtered(TableNames.ANALYZER_CHURN_DIMENSIONES, "periodo_reporte", periodos)
        if df.empty:
            return []

        # Construye estructura anidada periodo → dimensión → lista de valores
        pd_dict: Dict[str, Dict] = {}
        for _, row in df.iterrows():
            p = str(row.get("periodo_reporte", ""))
            if p not in pd_dict:
                pd_dict[p] = {"periodo_reporte": p, "dimensiones": {}}
            dim = str(row.get("dimension", ""))
            if dim not in pd_dict[p]["dimensiones"]:
                pd_dict[p]["dimensiones"][dim] = []
            pd_dict[p]["dimensiones"][dim].append({
                "valor": str(row.get("valor", "")),
                "activos_inicio": int(row.get("activos_inicio") or 0),
                "activos_final": int(row.get("activos_final") or 0),
                "nuevos": int(row.get("nuevos") or 0),
                "bajas_netas": int(row.get("bajas_netas") or 0),
                "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
                "bajas_brutas": int(row.get("bajas_brutas") or 0),
                "churn_bruto_pct": float(row.get("churn_bruto_pct") or 0),
                "reactivaciones": int(row.get("reactivaciones") or 0),
                "tasa_winback_pct": float(row.get("tasa_winback_pct") or 0),
                "total_billing": float(row.get("total_billing") or 0),
                "arpu": float(row.get("arpu") or 0),
                "tasa_aporte_react_pct": float(row.get("tasa_aporte_react_pct") or 0),
                "indice_reemplazo_react_pct": float(row.get("indice_reemplazo_react_pct") or 0),
                "adiciones_brutas": int(row.get("adiciones_brutas") or 0),
                "adiciones_netas": int(row.get("adiciones_netas") or 0),
                "corte_impagado": int(row.get("corte_impagado") or 0),
                "porcentaje_suspensiones": float(row.get("porcentaje_suspensiones") or 0),
                "react_4_P": int(row.get("react_4_p") or 0),
                "react_4_H": int(row.get("react_4_h") or 0),
                "react_val": int(row.get("react_val") or 0),
                "react_6_churn": int(row.get("react_6_churn") or 0),
                "react_8_30days": int(row.get("react_8_30days") or 0),
                "react_4_paused": int(row.get("react_4_paused") or 0),
            })
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        logger.exception("Error getting churn dimensiones")
        return []


def get_periodos() -> List[str]:
    """
    Obtiene la lista de períodos disponibles en los datos históricos.

    Lee todos los valores únicos de la columna ``periodo_reporte`` en
    ``analyzer_cierre_historico``.

    Returns:
        Lista de etiquetas de período ordenadas descendente.
        Retorna lista vacía si la tabla está vacía o hay error.
    """
    db = DBConnector()
    try:
        df = db.read_table(TableNames.ANALYZER_CIERRE_HISTORICO)
        if df.empty:
            return []
        return sorted(df["periodo_reporte"].unique().tolist(), reverse=True)
    except Exception:
        logger.exception("Error getting periodos list")
        return []


def get_dashboard_data() -> Dict[str, Any]:
    """
    Ensambla los datos completos para la vista del dashboard.

    Returns:
        Dict con ``"periodos"`` (lista plana).
    """
    return {"periodos": get_cierre_churn()}


def get_analytics_data(
    periodos: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Ensambla datos completos para la vista de analytics.

    Combina resultados de ``get_cierre_churn`` y ``get_dimensiones``,
    opcionalmente filtrados por período.

    Args:
        periodos: Lista opcional de períodos a filtrar.

    Returns:
        Dict con las claves ``"periodos"`` y ``"dimensiones"``.
    """
    return {
        "periodos": get_cierre_churn(periodos),
        "dimensiones": get_dimensiones(periodos),
    }
