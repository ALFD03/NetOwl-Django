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
from typing import Any, Dict, List, Optional
from .database import DBConnector


def get_cierre_churn(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Recupera los datos de cierre de churn agrupados por período.

    Lee la tabla ``cierre_churn_historico`` y transforma las filas en
    una lista de diccionarios agrupados por ``periodo_reporte``, donde cada
    período contiene una lista de métodos (Financiero/Operativo) con sus
    indicadores.

    Args:
        periodos: Lista opcional de períodos a filtrar (etiquetas como
                  ``"2024-01-01 al 2024-01-31"``). Si es None, se devuelven todos.

    Returns:
        Lista de dicts ordenada por período descendente, cada uno con:
        ``{"periodo_reporte": str, "metodos": [dict_de_indicadores, ...]}``.
        Retorna lista vacía si la tabla está vacía o hay error.
    """
    # Crea conector e intenta leer la tabla
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        # Filtra por períodos si se especificaron
        if periodos:
            df = df[df["periodo_reporte"].isin(periodos)]

        # Agrupa filas en dict anidado: periodo_reporte → lista de métodos
        pd_dict: Dict[str, Dict] = {}
        for _, row in df.iterrows():
            p = str(row.get("periodo_reporte", ""))
            if p not in pd_dict:
                pd_dict[p] = {"periodo_reporte": p, "metodos": []}
            # Extrae cada indicador con valor por defecto seguro
            pd_dict[p]["metodos"].append({
                "metodo": str(row.get("metodo", "")),
                "activos_inicio": int(row.get("activos_inicio") or 0),
                "activos_final": int(row.get("activos_final") or 0),
                "nuevos_mes": int(row.get("nuevos_mes") or 0),
                "bajas_netas_balance": int(row.get("bajas_netas_balance") or 0),
                "bajas_brutas_auditoria": int(row.get("bajas_brutas_auditoria") or 0),
                "churn_neto_pct": float(row.get("churn_neto_pct") or 0),
                "churn_bruto_pct": float(row.get("churn_bruto_pct") or 0),
                "reactivaciones": int(row.get("reactivaciones") or 0),
                "react_6_churn": int(row.get("react_6_churn") or 0),
                "react_8_30days": int(row.get("react_8_30days") or 0),
                "react_4_paused": int(row.get("react_4_paused") or 0),
                "tasa_winback_pct": float(row.get("tasa_winback_pct") or 0),
                "total_billing": float(row.get("total_billing") or 0),
                "arpu": float(row.get("arpu") or 0),
                "corte_impagado": int(row.get("corte_impagado") or 0),
                "total_inactivos": int(row.get("total_inactivos") or 0),
                "tasa_aporte_react_pct": float(row.get("tasa_aporte_react_pct") or 0),
                "indice_reemplazo_react_pct": float(row.get("indice_reemplazo_react_pct") or 0),
                "adiciones_brutas": int(row.get("adiciones_brutas") or 0),
                "adiciones_netas": int(row.get("adiciones_netas") or 0),
            })
        # Ordena por período descendente (más reciente primero)
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        # Ante cualquier error (BD caída, tabla faltante), retorna vacío
        return []


def get_dimensiones(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Recupera datos de churn desglosados por dimensiones.

    Lee la tabla ``master_churn_dimensiones`` y agrupa en una estructura
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
        df = db.read_table("master_churn_dimensiones")
        if df.empty:
            return []
        if periodos:
            df = df[df["periodo_reporte"].isin(periodos)]

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
                "prom_dias_activo": float(row.get("prom_dias_activo") or 0),
                "prom_dias_cancelado": float(row.get("prom_dias_cancelado") or 0),
            })
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        return []


def get_periodos() -> List[str]:
    """
    Obtiene la lista de períodos disponibles en los datos históricos.

    Lee todos los valores únicos de la columna ``periodo_reporte`` en
    ``cierre_churn_historico``.

    Returns:
        Lista de etiquetas de período ordenadas descendente.
        Retorna lista vacía si la tabla está vacía o hay error.
    """
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        return sorted(df["periodo_reporte"].unique().tolist(), reverse=True)
    except Exception:
        return []


def get_tiempos_globales(
    periodos: Optional[List[str]] = None,
) -> Dict[str, Dict[str, float]]:
    """
    Recupera métricas globales de tiempo de vida (días activo/cancelado promedio).

    Lee la tabla ``master_tiempo_global`` y retorna un dict indexado por
    período.

    Args:
        periodos: Lista opcional de períodos a filtrar.

    Returns:
        Dict con la forma ``{periodo: {"prom_dias_activo": float, "prom_dias_cancelado": float}}``.
        Retorna dict vacío si la tabla está vacía o hay error.
    """
    db = DBConnector()
    try:
        df = db.read_table("master_tiempo_global")
        if df.empty:
            return {}
        if periodos:
            df = df[df["periodo_reporte"].isin(periodos)]
        result: Dict[str, Dict[str, float]] = {}
        for _, row in df.iterrows():
            p = str(row.get("periodo_reporte", ""))
            result[p] = {
                "prom_dias_activo": float(row.get("prom_dias_activo") or 0),
                "prom_dias_cancelado": float(row.get("prom_dias_cancelado") or 0),
            }
        return result
    except Exception:
        return {}


def get_dashboard_data() -> Dict[str, List[Dict[str, Any]]]:
    """
    Ensambla los datos completos para la vista del dashboard.

    Combina ``get_cierre_churn()`` con los tiempos globales, inyectando
    ``prom_dias_activo`` y ``prom_dias_cancelado`` en cada método de cada
    período.

    Returns:
        Dict con la clave ``"periodos"`` conteniendo la lista completa de
        datos de cierre de churn enriquecida con métricas de tiempo de vida.
    """
    # Obtiene datos de churn y tiempos sin filtrar (todos los períodos)
    periodos_data = get_cierre_churn()
    tiempos = get_tiempos_globales()
    # Enriquece cada método con métricas de tiempo de vida del período
    for p in periodos_data:
        t = tiempos.get(p["periodo_reporte"], {})
        for m in p.get("metodos", []):
            m["prom_dias_activo"] = t.get("prom_dias_activo", 0)
            m["prom_dias_cancelado"] = t.get("prom_dias_cancelado", 0)
    return {"periodos": periodos_data}


def get_analytics_data(
    periodos: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Ensambla datos completos para la vista de analytics.

    Combina resultados de ``get_cierre_churn``, ``get_tiempos_globales``
    y ``get_dimensiones``, opcionalmente filtrados por período.

    Args:
        periodos: Lista opcional de períodos a filtrar.

    Returns:
        Dict con las claves ``"periodos"`` y ``"dimensiones"``.
        Cada período incluye métricas de tiempo de vida inyectadas.
    """
    # Obtiene datos de churn filtrados (si aplica)
    periodos_data = get_cierre_churn(periodos)
    # Obtiene tiempos globales y los inyecta en cada método
    tiempos = get_tiempos_globales(periodos)
    for p in periodos_data:
        t = tiempos.get(p["periodo_reporte"], {})
        for m in p.get("metodos", []):
            m["prom_dias_activo"] = t.get("prom_dias_activo", 0)
            m["prom_dias_cancelado"] = t.get("prom_dias_cancelado", 0)
    return {
        "periodos": periodos_data,
        "dimensiones": get_dimensiones(periodos),
    }
