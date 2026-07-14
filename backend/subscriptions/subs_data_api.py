from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
import json
import pathlib
from ..conf_config import DB_SCHEMA, TableNames
from ..database import DBConnector

logger = logging.getLogger(__name__)

def get_cierre_churn(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
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
                "crecimiento": float(row.get("crecimiento") or 0),
                "bajas": int(row.get("bajas") or 0),
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
    db = DBConnector()
    try:
        df = db.read_table_filtered(TableNames.ANALYZER_CHURN_DIMENSIONES, "periodo_reporte", periodos)
        if df.empty:
            return []

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
                "bajas": int(row.get("bajas") or 0),
                "crecimiento": float(row.get("crecimiento") or 0),
                "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
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
    return {"periodos": get_cierre_churn()}


def get_analytics_data(
    periodos: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "periodos": get_cierre_churn(periodos),
        "dimensiones": get_dimensiones(periodos),
    }

ZONAS_PATH = pathlib.Path(__file__).resolve().parent.parent.parent / "Zonas.json"

def get_sales_report_data(periodo_reporte: Optional[str] = None) -> Dict[str, Any]:
    """
    Lee la dimensión compuesta 'zona_sucursal' del período seleccionado,
    asocia cada zona a su Site regional usando Zonas.json, y agrupa
    todos los KPI para renderizado gerencial.
    """
    db = DBConnector()
    try:
        available_periods = get_periodos()
        if not available_periods:
            return {"status": "empty", "message": "No hay periodos calculados"}
        
        # Tomamos el último periodo calculado si no se especifica uno
        target_period = periodo_reporte or available_periods[0]
        
        # 1. Cargar el mapeo de Zonas a Sites regionales
        if not ZONAS_PATH.exists():
            return {"status": "error", "message": "No se encontró el archivo Zonas.json en la raíz"}
            
        with open(ZONAS_PATH, "r", encoding="utf-8") as f:
            zonas_data = json.load(f)
        
        # Mapeador insensible a mayúsculas y espacios
        zone_to_site = {z["name"].strip().lower(): z.get("Site", "Valencia").strip() for z in zonas_data["zonas"]}
        
        # 2. Consultar las métricas de "zona_sucursal" para el periodo seleccionado
        df = db.query(f"""
            SELECT valor, activos_inicio, activos_final, nuevos, bajas, crecimiento,
                   churn_neto_pct, churn_bruto_pct, react_val, 
                   total_billing, arpu, adiciones_netas, adiciones_brutas, corte_impagado
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONES}
            WHERE periodo_reporte = %s AND dimension = 'zona_sucursal'
        """, params=[target_period])
        
        if df.empty:
            return {"status": "empty", "period": target_period, "periods": available_periods}
            
        # 3. Agrupación por Site regional en memoria
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        
        for _, row in df.iterrows():
            val_str = str(row["valor"])
            parts = val_str.split(" - ")
            zona_name = parts[0].strip() if len(parts) > 0 else val_str
            sucursal_name = parts[1].strip() if len(parts) > 1 else "Sin Sucursal"
            
            # Obtenemos el Site correspondiente
            site = zone_to_site.get(zona_name.lower(), "Otros / Desconocido")
            
            if site not in grouped:
                grouped[site] = []
                
            grouped[site].append({
                "zona_sucursal": val_str,
                "zona": zona_name,
                "sucursal": sucursal_name,
                "activos_inicio": int(row.get("activos_inicio") or 0),
                "activos_final": int(row.get("activos_final") or 0),
                "nuevos": int(row.get("nuevos") or 0),
                "bajas": int(row.get("bajas") or 0),
                "crecimiento": float(row.get("crecimiento") or 0),
                "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
                "churn_bruto_pct": float(row.get("churn_bruto_pct") or 0),
                "reactivaciones": int(row.get("react_val") or 0),
                "total_billing": float(row.get("total_billing") or 0),
                "arpu": float(row.get("arpu") or 0),
                "adiciones_netas": int(row.get("adiciones_netas") or 0),
                "adiciones_brutas": int(row.get("adiciones_brutas") or 0),
                "corte_impagado": int(row.get("corte_impagado") or 0),
            })
            
        # Ordenamos los Sites alfabéticamente y los elementos internos por activos final
        ordered_grouped = {}
        for site in sorted(grouped.keys()):
            ordered_grouped[site] = sorted(grouped[site], key=lambda x: x["activos_final"], reverse=True)
            
        return {
            "status": "success",
            "period": target_period,
            "periods": available_periods,
            "data": ordered_grouped
        }
    except Exception as e:
        logger.exception("Error en get_sales_report_data")
        return {"status": "error", "message": str(e)}