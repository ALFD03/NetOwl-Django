"""Lectura de lo ya calculado por el analisis de suscripciones.

Aqui no se calcula churn: se leen las tablas de resultados y se les da la forma
que esperan las paginas. Las dos excepciones son los reportes comerciales
(Sales Report y Business Units), que agrupan en memoria por site, tecnologia y
coordinador usando el catalogo de zonas.

Con el parametro `dia`, la fuente deja de ser el cierre del mes y pasa a ser la
fila precalculada de `analyzer_day_metrics`: una sola lectura, sin recalcular
nada.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import available_zones, sites_order, zones
from core.utils import typed_records, zero_nulls

logger = logging.getLogger(__name__)


def get_site_sort_index(site_name: str) -> int:
    """Posicion del site en el orden comercial del catalogo.

    El orden ya no es una lista en el codigo sino la columna `Site.orden`; lo
    que no este dado de alta se va al final, igual que antes.
    """
    order = sites_order()
    try:
        return order.index(site_name)
    except ValueError:
        return len(order)

CLOSE_INTS = (
    "activos_inicio", "activos_final", "nuevos_mes", "ingresos", "bajas", "reactivaciones", "react_val",
    "react_6_churn", "react_8_30days", "react_4_paused", "react_4_p", "react_4_h", "corte_impagado",
    "total_inactivos", "adiciones_brutas", "adiciones_netas", "clientes_gratuitos", "gratuitos_nuevos",
    "gratuitos_retornados",
)
CLOSE_FLOATS = (
    "crecimiento", "churn_neto_pct", "churn_bruto_pct", "tasa_winback_pct", "total_billing", "arpu",
    "porcentaje_suspensiones", "tasa_aporte_react_pct", "indice_reemplazo_react_pct",
)
DIMENSION_INTS = tuple(c for c in CLOSE_INTS if c not in ("nuevos_mes", "ingresos", "total_inactivos")) + ("nuevos",)
DIMENSION_FLOATS = CLOSE_FLOATS
# Postgres guarda las columnas en minuscula; la API las nombra con la letra del estado.
REACT_KEYS = {"react_4_p": "react_4_P", "react_4_h": "react_4_H"}
NODE_INTS = (
    "activos_inicio", "activos_final", "nuevos", "bajas", "react_val", "adiciones_netas", "adiciones_brutas",
    "corte_impagado",
)
NODE_FLOATS = ("crecimiento", "churn_neto_pct", "churn_bruto_pct")


def _zone_nodes(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Un nodo por fila de `zona_sucursal`, con la zona y la sucursal separadas.

    `reactivaciones` de un nodo son las validas (`react_val`).
    """
    value = df["valor"].astype(str)
    parts = value.str.split(" - ")
    nodes = pd.DataFrame({
        "zona_sucursal": value,
        "zona": parts.str[0].str.strip(),
        "sucursal": parts.str[1].str.strip().fillna("Sin Sucursal"),
    })
    metrics = typed_records(df, ints=NODE_INTS, floats=NODE_FLOATS, rename={"react_val": "reactivaciones"})
    return [{**node, **m} for node, m in zip(nodes.to_dict("records"), metrics, strict=True)]


def get_churn_close(
    periods: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Los cierres mensuales, del mas reciente al mas antiguo.

    Las métricas que un cierre antiguo no calculaba llegan nulas y salen en 0.
    """
    db = DBConnector()
    try:
        df = zero_nulls(db.read_table_filtered(TableNames.ANALYZER_CLOSE_HISTORY, "periodo_reporte", periods))
        if df.empty:
            return []
        result = typed_records(
            df, texts=["periodo_reporte"], ints=CLOSE_INTS, floats=CLOSE_FLOATS, rename=REACT_KEYS,
        )
        return sorted(result, key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        logger.exception("Error getting churn cierre")
        return []

def get_dimensions(
    periods: list[str] | None = None,
) -> list[dict[str, Any]]:
    """El desglose dimensional de cada periodo, agrupado por dimension."""
    db = DBConnector()
    try:
        df = zero_nulls(db.read_table_filtered(TableNames.ANALYZER_CHURN_DIMENSIONS, "periodo_reporte", periods))
        if df.empty:
            return []

        rows = typed_records(
            df, texts=["periodo_reporte", "dimension", "valor"], ints=DIMENSION_INTS, floats=DIMENSION_FLOATS,
            rename=REACT_KEYS,
        )
        pd_dict: dict[str, dict] = {}
        for row in rows:
            period = row.pop("periodo_reporte")
            dim = row.pop("dimension")
            block = pd_dict.setdefault(period, {"periodo_reporte": period, "dimensiones": {}})
            block["dimensiones"].setdefault(dim, []).append(row)
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        logger.exception("Error getting churn dimensiones")
        return []

def get_periods() -> list[str]:
    """Las etiquetas de periodo que tienen cierre calculado."""
    db = DBConnector()
    try:
        df = db.read_table(TableNames.ANALYZER_CLOSE_HISTORY)
        if df.empty:
            return []
        return sorted(df["periodo_reporte"].unique().tolist(), reverse=True)
    except Exception:
        logger.exception("Error getting periodos list")
        return []

def get_analytics_data(
    periods: list[str] | None = None,
) -> dict[str, Any]:
    """Cierres y dimensiones de los periodos pedidos, para la pagina de Analytics."""
    return {
        "periodos": get_churn_close(periods),
        "dimensiones": get_dimensions(periods),
    }



def get_zones_config() -> dict[str, Any]:
    """Mapa de zonas para que el cliente agrupe los reportes sin ir al servidor.

    Es la misma fuente (el catalogo) que usan `get_sales_report_data` y
    `get_business_units_data`; se envia en los props para que cambiar de dia en
    la barra de corte sea una reagrupacion en memoria y no un round-trip.
    `siteOrder` viaja aparte para no duplicar el orden en TypeScript.
    """
    if not available_zones():
        return {"zonas": [], "siteOrder": sites_order()}
    catalog_zones = [
        {
            "name": str(z.get("name", "")).strip(),
            "site": str(z.get("Site", "Valencia")).strip(),
            "type": str(z.get("Type", "FTTH")).strip(),
            "coordinador": str(z.get("Coordinador") or "").strip(),
            # Para la herencia de objetivos: una zona sin objetivo propio toma
            # el de su coordinador, su site o su estado (ver `targets.py`).
            "estado": str(z.get("Estado") or "").strip(),
        }
        for z in zones()
        if str(z.get("name", "")).strip()
    ]
    return {"zonas": catalog_zones, "siteOrder": sites_order()}


def _dimension_df(db: DBConnector, target_period: str, day: int | None):
    """Filas de la dimension zona_sucursal, del cierre del mes o de un dia.

    Con `dia` la fuente es la fila precalculada de analyzer_day_metrics: una
    sola lectura, sin recalcular nada del pipeline.
    """
    import pandas as pd

    if day:
        from .day_metrics import get_day_metrics

        month = target_period[:7]
        payload = get_day_metrics(month).get("dias", {}).get(str(day))
        if not payload:
            return pd.DataFrame()
        return pd.DataFrame(payload.get("dimensiones", []))

    return zero_nulls(db.query(f"""
        SELECT valor, activos_inicio, activos_final, nuevos, bajas, crecimiento,
               churn_neto_pct, churn_bruto_pct, react_val,
               adiciones_netas, adiciones_brutas, corte_impagado
        FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONS}
        WHERE periodo_reporte = %s AND dimension = 'zona_sucursal'
    """, params=[target_period]))

def calculate_aggregation_totals(nodes: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Suma los valores absolutos de un conjunto de nodos y recalcula
    los indicadores porcentuales para evitar el error de promediar promedios.
    """
    act_ini = sum(n["activos_inicio"] for n in nodes)
    act_end = sum(n["activos_final"] for n in nodes)
    new = sum(n["nuevos"] for n in nodes)
    churns = sum(n["bajas"] for n in nodes)
    react = sum(n["reactivaciones"] for n in nodes)
    cutoff = sum(n["corte_impagado"] for n in nodes)
    net_adds = sum(n["adiciones_netas"] for n in nodes)
    gross_adds = sum(n["adiciones_brutas"] for n in nodes)

    # Fórmulas de agregación consistentes
    growth = round(((act_end - act_ini) / act_ini * 100), 2) if act_ini > 0 else 0.0
    
    net_churn_calc = max(0, act_ini - (act_end - new))
    net_churn = round((net_churn_calc / act_ini * 100), 2) if act_ini > 0 else 0.0
    gross_churn = round((churns / act_ini * 100), 2) if act_ini > 0 else 0.0

    return {
        "activos_inicio": act_ini,
        "activos_final": act_end,
        "nuevos": new,
        "bajas": churns,
        "reactivaciones": react,
        "crecimiento": growth,
        "churn_neto_pct": net_churn,
        "churn_bruto_pct": gross_churn,
        "adiciones_netas": net_adds,
        "adiciones_brutas": gross_adds,
        "corte_impagado": cutoff,
    }

def get_sales_report_data(
    report_period: str | None = None,
    day: int | None = None,
) -> dict[str, Any]:
    """
    Agrupa las métricas del periodo por Site regional -> Type (Tecnología) -> Nodos,
    calculando subtotales para cada tecnología y totales generales para cada Site.
    """
    db = DBConnector()
    try:
        available_periods = get_periods()
        if not available_periods:
            return {"status": "empty", "message": "No hay periodos calculados"}
        
        target_period = report_period or available_periods[0]
        
        if not available_zones():
            return {"status": "error", "message": "El catálogo de zonas está vacío. Configúralo en Catálogos → Estructura."}

        # Mapeamos zonas a su respectivo Site y Type (Tecnología)
        zone_info = {}
        for z in zones():
            name = z["name"].strip().lower()
            zone_info[name] = {
                "site": z.get("Site", "Valencia").strip(),
                "type": z.get("Type", "FTTH").strip()  # el mismo valor por defecto que el catalogo
            }
        
        df = _dimension_df(db, target_period, day)
        
        if df.empty:
            return {
                "status": "empty",
                "period": target_period,
                "periods": available_periods,
                "dia": day,
            }
            
        # Agrupación en estructura anidada en memoria
        # Estructura: site_groups[site][tech_type] = List[nodos]
        site_groups: dict[str, dict[str, list[dict[str, Any]]]] = {}
        
        for node in _zone_nodes(df):
            # Zona que no esta en el catalogo: se agrupa aparte, con la
            # tecnologia por defecto del catalogo.
            z_data = zone_info.get(node["zona"].lower(), {"site": "Otros / Desconocido", "type": "FTTH"})
            site_groups.setdefault(z_data["site"], {}).setdefault(z_data["type"], []).append(node)

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
            "dia": day,
            "data": final_data_list
        }
    except Exception:
        # `traceback.print_exc()` escribia a stdout, y dentro de la tarea de
        # Celery stdout esta redirigido a `JobConsole`: la traza entera —rutas
        # de fichero, nombres de funcion, fragmentos de SQL— acababa en
        # `AnalysisJob.log` y de ahi al navegador. El detalle va al log del
        # servidor y al cliente solo le llega que fallo.
        logger.exception("Error al construir el reporte de suscripciones")
        return {
            "status": "error",
            "message": "Error interno del servidor. Consulte el registro de la aplicación.",
        }
    
def get_business_units_data(
    report_period: str | None = None,
    day: int | None = None,
) -> dict[str, Any]:
    """
    Genera el reporte de Business Units:
    1. Incluye un resumen consolidado en tarjeta al inicio para TODOS los nodos FTTH.
    2. Agrupa por Coordinador y sus zonas configuradas.
    3. Agrega al final un grupo consolidado para TODAS las zonas de tipo RF (Radiofrecuencia).
    """
    db = DBConnector()
    try:
        available_periods = get_periods()
        if not available_periods:
            return {"status": "empty", "message": "No hay periodos calculados"}
        
        target_period = report_period or available_periods[0]
        
        if not available_zones():
            return {"status": "error", "message": "El catálogo de zonas está vacío. Configúralo en Catálogos → Estructura."}

        # 1. Indexar zonas por Coordinador, RF y FTTH
        zone_coord_map = {}
        rf_zones_set = set()
        ftth_zones_set = set()

        for z in zones():
            z_name = z.get("name", "").strip().lower()
            if not z_name:
                continue

            # Mapeo de Coordinadores
            coordinator = z.get("Coordinador")
            if coordinator and str(coordinator).strip():
                zone_coord_map[z_name] = str(coordinator).strip()

            # Mapeo por Tecnología. El catálogo solo admite estas dos.
            z_type = str(z.get("Type", "")).strip().upper()
            if z_type == "RF":
                rf_zones_set.add(z_name)
            elif z_type == "FTTH":
                ftth_zones_set.add(z_name)

        df = _dimension_df(db, target_period, day)
        
        if df.empty:
            return {
                "status": "empty",
                "period": target_period,
                "periods": available_periods,
                "dia": day,
            }
            
        # 2. Agrupadores
        coord_groups: dict[str, list[dict[str, Any]]] = {}
        rf_nodes: list[dict[str, Any]] = []
        ftth_nodes: list[dict[str, Any]] = []

        for node_data in _zone_nodes(df):
            z_key = node_data["zona"].lower()
            node_data["type"] = "RF" if z_key in rf_zones_set else "FTTH"

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
        sorted_coordinators = sorted(coord_groups.keys())
        
        for coordinator in sorted_coordinators:
            nodes = sorted(coord_groups[coordinator], key=lambda x: x["activos_final"], reverse=True)
            coord_totals = calculate_aggregation_totals(nodes)
            
            final_data_list.append({
                "coordinador": coordinator,
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
            "dia": day,
            "ftth_summary": ftth_summary,
            "data": final_data_list
        }
    except Exception:
        # `traceback.print_exc()` escribia a stdout, y dentro de la tarea de
        # Celery stdout esta redirigido a `JobConsole`: la traza entera —rutas
        # de fichero, nombres de funcion, fragmentos de SQL— acababa en
        # `AnalysisJob.log` y de ahi al navegador. El detalle va al log del
        # servidor y al cliente solo le llega que fallo.
        logger.exception("Error al construir el reporte de suscripciones")
        return {
            "status": "error",
            "message": "Error interno del servidor. Consulte el registro de la aplicación.",
        }


def restrict_units(
    bu_data: dict[str, Any],
    day_metrics: dict[str, Any],
    zones_config: dict[str, Any],
    units: frozenset[str],
    rf: bool,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Unidades de negocio para quien no las ve todas (`services/config/units.py`).

    Deja solo las unidades de `unidades` (por nombre de coordinador) y el bloque
    RF si `rf`. El recorte es del servidor, no del selector: el cliente reagrupa
    cada dia a partir de `day_metrics` y `zones_config`, asi que esos dos se
    recortan tambien a las zonas visibles, y `dims` (solo de Analytics) se quita.

    El **consolidado FTTH se ve siempre**, y es el de toda la empresa. El
    cliente lo suma de los nodos FTTH de todas las unidades, que ya no le
    llegan; por eso viaja ya sumado en `ftth_consolidado`, un nodo por corte
    (`cierre` y cada dia) con los cinco campos que suma `aggregateNodes`. Un
    nodo con la suma da exactamente lo mismo que sumar los nodos, y su meta es
    la general, que tampoco depende del reparto por zonas.
    """
    zones = zones_config.get("zonas", [])
    coordinator_of = {z["name"].lower(): z["coordinador"] for z in zones if z.get("coordinador")}
    rf_zones = {z["name"].lower() for z in zones if str(z.get("type", "")).upper() == "RF"}
    visible = {zone for zone, c in coordinator_of.items() if c in units}
    if rf:
        visible |= rf_zones

    def zone_of(value: Any) -> str:
        return str(value).split(" - ")[0].strip().lower()

    def consolidate(nodes: list[dict[str, Any]], reactivations_key: str) -> dict[str, int]:
        total_sum = {
            field: sum(int(n.get(field) or 0) for n in nodes)
            for field in ("activos_inicio", "activos_final", "nuevos", "bajas")
        }
        total_sum["reactivaciones"] = sum(int(n.get(reactivations_key) or 0) for n in nodes)
        total_sum["total_nodos"] = len(nodes)
        return total_sum

    # Lo mismo que suma el cliente: los nodos FTTH de las unidades (no del
    # bloque RF, que agrupa por tecnologia).
    groups = bu_data.get("data") or []
    ftth_close = [
        node for g in groups if not g.get("is_rf")
        for node in g.get("nodes", []) if node.get("type") == "FTTH"
    ]
    days = (day_metrics or {}).get("dias") or {}
    ftth_days = {
        day: consolidate([
            row for row in cutoff.get("dimensiones", [])
            if zone_of(row.get("valor")) in coordinator_of
            and zone_of(row.get("valor")) not in rf_zones
        ], "react_val")
        for day, cutoff in days.items()
    }

    bu = dict(bu_data)
    if "data" in bu:
        bu["data"] = [
            g for g in groups
            if (rf if g.get("is_rf") else g.get("coordinador") in units)
        ]
    bu["ftth_consolidado"] = {
        "cierre": consolidate(ftth_close, "reactivaciones"),
        "dias": ftth_days,
    }
    bu["alcance"] = {"coordinadores": sorted(units), "rf": rf}

    dm = dict(day_metrics or {})
    if days:
        dm["dias"] = {
            day: {
                "global": cutoff.get("global", {}),
                "dimensiones": [
                    row for row in cutoff.get("dimensiones", [])
                    if zone_of(row.get("valor")) in visible
                ],
            }
            for day, cutoff in days.items()
        }

    zc = {**zones_config, "zonas": [z for z in zones if z["name"].lower() in visible]}
    return bu, dm, zc