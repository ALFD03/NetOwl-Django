from __future__ import annotations

import logging
from typing import Any

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import load_zonas, zonas_disponibles

from .config import CUSTOM_SITE_ORDER

logger = logging.getLogger(__name__)


def get_site_sort_index(site_name: str) -> int:
    try:
        return CUSTOM_SITE_ORDER.index(site_name)
    except ValueError:
        return len(CUSTOM_SITE_ORDER)  # Los no listados van al final

def get_cierre_churn(
    periodos: list[str] | None = None,
) -> list[dict[str, Any]]:
    db = DBConnector()
    try:
        df = db.read_table_filtered(TableNames.ANALYZER_CIERRE_HISTORICO, "periodo_reporte", periodos)
        if df.empty:
            return []
        result: list[dict[str, Any]] = []
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
                "clientes_gratuitos": int(row.get("clientes_gratuitos") or 0),
                "gratuitos_nuevos": int(row.get("gratuitos_nuevos") or 0),
                "gratuitos_retornados": int(row.get("gratuitos_retornados") or 0),
            })
        return sorted(result, key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        logger.exception("Error getting churn cierre")
        return []

def get_dimensiones(
    periodos: list[str] | None = None,
) -> list[dict[str, Any]]:
    db = DBConnector()
    try:
        df = db.read_table_filtered(TableNames.ANALYZER_CHURN_DIMENSIONES, "periodo_reporte", periodos)
        if df.empty:
            return []

        pd_dict: dict[str, dict] = {}
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
                "clientes_gratuitos": int(row.get("clientes_gratuitos") or 0),
                "gratuitos_nuevos": int(row.get("gratuitos_nuevos") or 0),
                "gratuitos_retornados": int(row.get("gratuitos_retornados") or 0),
            })
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        logger.exception("Error getting churn dimensiones")
        return []

def get_periodos() -> list[str]:
    db = DBConnector()
    try:
        df = db.read_table(TableNames.ANALYZER_CIERRE_HISTORICO)
        if df.empty:
            return []
        return sorted(df["periodo_reporte"].unique().tolist(), reverse=True)
    except Exception:
        logger.exception("Error getting periodos list")
        return []

def get_dashboard_data() -> dict[str, Any]:
    return {"periodos": get_cierre_churn()}


def get_analytics_data(
    periodos: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "periodos": get_cierre_churn(periodos),
        "dimensiones": get_dimensiones(periodos),
    }



def get_zonas_config() -> dict[str, Any]:
    """Mapa de zonas para que el cliente agrupe los reportes sin ir al servidor.

    Es la misma fuente (`Zonas.json`) que usan `get_sales_report_data` y
    `get_business_units_data`; se envia en los props para que cambiar de dia en
    la barra de corte sea una reagrupacion en memoria y no un round-trip.
    `siteOrder` viaja aparte para no duplicar el orden en TypeScript.
    """
    if not zonas_disponibles():
        return {"zonas": [], "siteOrder": CUSTOM_SITE_ORDER}
    zonas = [
        {
            "name": str(z.get("name", "")).strip(),
            "site": str(z.get("Site", "Valencia")).strip(),
            "type": str(z.get("Type", "GPON")).strip(),
            "coordinador": str(z.get("Coordinador") or "").strip(),
        }
        for z in load_zonas().get("zonas", [])
        if str(z.get("name", "")).strip()
    ]
    return {"zonas": zonas, "siteOrder": CUSTOM_SITE_ORDER}


def _dimension_df(db: DBConnector, target_period: str, dia: int | None):
    """Filas de la dimension zona_sucursal, del cierre del mes o de un dia.

    Con `dia` la fuente es la fila precalculada de analyzer_day_metrics: una
    sola lectura, sin recalcular nada del pipeline.
    """
    import pandas as pd

    if dia:
        from .day_metrics import get_day_metrics

        mes = target_period[:7]
        payload = get_day_metrics(mes).get("dias", {}).get(str(dia))
        if not payload:
            return pd.DataFrame()
        return pd.DataFrame(payload.get("dimensiones", []))

    return db.query(f"""
        SELECT valor, activos_inicio, activos_final, nuevos, bajas, crecimiento,
               churn_neto_pct, churn_bruto_pct, react_val,
               adiciones_netas, adiciones_brutas, corte_impagado
        FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONES}
        WHERE periodo_reporte = %s AND dimension = 'zona_sucursal'
    """, params=[target_period])

def calculate_aggregation_totals(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Suma los valores absolutos de un conjunto de nodos y recalcula
    los indicadores porcentuales para evitar el error de promediar promedios.
    """
    act_ini = sum(n["activos_inicio"] for n in nodes)
    act_fin = sum(n["activos_final"] for n in nodes)
    nuevos = sum(n["nuevos"] for n in nodes)
    bajas = sum(n["bajas"] for n in nodes)
    react = sum(n["reactivaciones"] for n in nodes)
    corte = sum(n["corte_impagado"] for n in nodes)
    ad_netas = sum(n["adiciones_netas"] for n in nodes)
    ad_brutas = sum(n["adiciones_brutas"] for n in nodes)

    # Fórmulas de agregación consistentes
    crecimiento = round(((act_fin - act_ini) / act_ini * 100), 2) if act_ini > 0 else 0.0
    
    bajas_netas_calc = max(0, act_ini - (act_fin - nuevos))
    churn_neto = round((bajas_netas_calc / act_ini * 100), 2) if act_ini > 0 else 0.0
    churn_bruto = round((bajas / act_ini * 100), 2) if act_ini > 0 else 0.0

    return {
        "activos_inicio": act_ini,
        "activos_final": act_fin,
        "nuevos": nuevos,
        "bajas": bajas,
        "reactivaciones": react,
        "crecimiento": crecimiento,
        "churn_neto_pct": churn_neto,
        "churn_bruto_pct": churn_bruto,
        "adiciones_netas": ad_netas,
        "adiciones_brutas": ad_brutas,
        "corte_impagado": corte,
    }

def get_sales_report_data(
    periodo_reporte: str | None = None,
    dia: int | None = None,
) -> dict[str, Any]:
    """
    Agrupa las métricas del periodo por Site regional -> Type (Tecnología) -> Nodos,
    calculando subtotales para cada tecnología y totales generales para cada Site.
    """
    db = DBConnector()
    try:
        available_periods = get_periodos()
        if not available_periods:
            return {"status": "empty", "message": "No hay periodos calculados"}
        
        target_period = periodo_reporte or available_periods[0]
        
        if not zonas_disponibles():
            return {"status": "error", "message": "No se encontró el archivo Zonas.json en la raíz"}
            
        zonas_data = load_zonas()
        
        # Mapeamos zonas a su respectivo Site y Type (Tecnología)
        zone_info = {}
        for z in zonas_data["zonas"]:
            name = z["name"].strip().lower()
            zone_info[name] = {
                "site": z.get("Site", "Valencia").strip(),
                "type": z.get("Type", "GPON").strip()  # "GPON" como fallback por defecto
            }
        
        df = _dimension_df(db, target_period, dia)
        
        if df.empty:
            return {
                "status": "empty",
                "period": target_period,
                "periods": available_periods,
                "dia": dia,
            }
            
        # Agrupación en estructura anidada en memoria
        # Estructura: site_groups[site][tech_type] = List[nodos]
        site_groups: dict[str, dict[str, list[dict[str, Any]]]] = {}
        
        for _, row in df.iterrows():
            val_str = str(row["valor"])
            parts = val_str.split(" - ")
            zona_name = parts[0].strip() if len(parts) > 0 else val_str
            sucursal_name = parts[1].strip() if len(parts) > 1 else "Sin Sucursal"
            
            z_data = zone_info.get(zona_name.lower(), {"site": "Otros / Desconocido", "type": "GPON"})
            site = z_data["site"]
            tech_type = z_data["type"]
            
            site_groups.setdefault(site, {})
            site_groups[site].setdefault(tech_type, [])
            
            site_groups[site][tech_type].append({
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
                "adiciones_netas": int(row.get("adiciones_netas") or 0),
                "adiciones_brutas": int(row.get("adiciones_brutas") or 0),
                "corte_impagado": int(row.get("corte_impagado") or 0),
            })

        # Estructurar la respuesta final aplicando las ordenaciones y sumatorias de subtotales
        final_data_list = []
        
        # Ordenamos los sites según la lista de orden personalizada
        sorted_sites = sorted(site_groups.keys(), key=get_site_sort_index)
        
        for site in sorted_sites:
            site_tech_list = []
            all_site_nodes = []
            
            # Ordenamos las tecnologías alfabéticamente dentro de cada Site
            sorted_techs = sorted(site_groups[site].keys())
            
            for tech in sorted_techs:
                nodes_in_tech = sorted(site_groups[site][tech], key=lambda x: x["activos_final"], reverse=True)
                tech_totals = calculate_aggregation_totals(nodes_in_tech)
                
                site_tech_list.append({
                    "technology": tech,
                    "totals": tech_totals,
                    "nodes": nodes_in_tech
                })
                all_site_nodes.extend(nodes_in_tech)
                
            # Totales de todo el Site completo (unión de todas sus tecnologías)
            site_overall_totals = calculate_aggregation_totals(all_site_nodes)
            
            final_data_list.append({
                "site": site,
                "totals": site_overall_totals,
                "technologies": site_tech_list
            })
            
        return {
            "status": "success",
            "period": target_period,
            "periods": available_periods,
            "dia": dia,
            "data": final_data_list
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
    
def get_business_units_data(
    periodo_reporte: str | None = None,
    dia: int | None = None,
) -> dict[str, Any]:
    """
    Genera el reporte de Business Units:
    1. Incluye un resumen consolidado en tarjeta al inicio para TODOS los nodos FTTH.
    2. Agrupa por Coordinador y sus zonas configuradas.
    3. Agrega al final un grupo consolidado para TODAS las zonas de tipo RF (Radiofrecuencia).
    """
    db = DBConnector()
    try:
        available_periods = get_periodos()
        if not available_periods:
            return {"status": "empty", "message": "No hay periodos calculados"}
        
        target_period = periodo_reporte or available_periods[0]
        
        if not zonas_disponibles():
            return {"status": "error", "message": "No se encontró el archivo Zonas.json en la raíz"}
            
        zonas_data = load_zonas()
        
        # 1. Indexar zonas por Coordinador, RF y FTTH
        zone_coord_map = {}
        rf_zones_set = set()
        ftth_zones_set = set()

        for z in zonas_data.get("zonas", []):
            z_name = z.get("name", "").strip().lower()
            if not z_name:
                continue

            # Mapeo de Coordinadores
            coordinador = z.get("Coordinador")
            if coordinador and str(coordinador).strip():
                zone_coord_map[z_name] = str(coordinador).strip()

            # Mapeo por Tecnología (Soporta FTTH y GPON)
            z_type = str(z.get("Type", "")).strip().upper()
            if z_type == "RF":
                rf_zones_set.add(z_name)
            elif z_type in ("FTTH", "GPON"): # 👈 1. MEJORA: Acepta FTTH y GPON
                ftth_zones_set.add(z_name)

        df = _dimension_df(db, target_period, dia)
        
        if df.empty:
            return {
                "status": "empty",
                "period": target_period,
                "periods": available_periods,
                "dia": dia,
            }
            
        # 2. Agrupadores
        coord_groups: dict[str, list[dict[str, Any]]] = {}
        rf_nodes: list[dict[str, Any]] = []
        ftth_nodes: list[dict[str, Any]] = []

        for _, row in df.iterrows():
            val_str = str(row["valor"])
            parts = val_str.split(" - ")
            zona_name = parts[0].strip() if len(parts) > 0 else val_str
            sucursal_name = parts[1].strip() if len(parts) > 1 else "Sin Sucursal"
            
            z_key = zona_name.lower()
            z_type = "RF" if z_key in rf_zones_set else "FTTH"

            node_data = {
                "zona_sucursal": val_str,
                "zona": zona_name,
                "sucursal": sucursal_name,
                "type": z_type,  # 👈 2. AÑADIDO: Tipo de servicio (FTTH o RF)
                "activos_inicio": int(row.get("activos_inicio") or 0),
                "activos_final": int(row.get("activos_final") or 0),
                "nuevos": int(row.get("nuevos") or 0),
                "bajas": int(row.get("bajas") or 0),
                "crecimiento": float(row.get("crecimiento") or 0),
                "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
                "churn_bruto_pct": float(row.get("churn_bruto_pct") or 0),
                "reactivaciones": int(row.get("react_val") or 0),
                "adiciones_netas": int(row.get("adiciones_netas") or 0),
                "adiciones_brutas": int(row.get("adiciones_brutas") or 0),
                "corte_impagado": int(row.get("corte_impagado") or 0),
            }

            # Si pertenece a un Coordinador
            if z_key in zone_coord_map:
                coord = zone_coord_map[z_key]
                coord_groups.setdefault(coord, []).append(node_data)

            # Si la zona es RF
            if z_key in rf_zones_set:
                rf_nodes.append(node_data)

            # Si la zona es FTTH
            if z_key in ftth_zones_set:
                ftth_nodes.append(node_data)

        # 3. Resumen FTTH global
        ftth_summary = calculate_aggregation_totals(ftth_nodes) if ftth_nodes else {}
        if ftth_summary:
            ftth_summary["total_nodos"] = len(ftth_nodes)

        # 4. Construcción de respuesta por coordinador
        final_data_list = []
        sorted_coordinadores = sorted(coord_groups.keys())
        
        for coordinador in sorted_coordinadores:
            nodes = sorted(coord_groups[coordinador], key=lambda x: x["activos_final"], reverse=True)
            coord_totals = calculate_aggregation_totals(nodes)
            
            final_data_list.append({
                "coordinador": coordinador,
                "totals": coord_totals,
                "nodes": nodes,
                "is_rf": False
            })
            
        # 5. Agregar al final el bloque consolidado RF
        if rf_nodes:
            sorted_rf_nodes = sorted(rf_nodes, key=lambda x: x["activos_final"], reverse=True)
            rf_totals = calculate_aggregation_totals(sorted_rf_nodes)
            final_data_list.append({
                "coordinador": "NODOS RADIOFRECUENCIA (RF)",
                "totals": rf_totals,
                "nodes": sorted_rf_nodes,
                "is_rf": True
            })

        return {
            "status": "success",
            "period": target_period,
            "periods": available_periods,
            "dia": dia,
            "ftth_summary": ftth_summary,
            "data": final_data_list
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}