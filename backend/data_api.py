"""data_api.py - Capa de acceso a datos para vistas (thin views)."""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from .database import DBConnector


def get_cierre_churn(periodos=None):
    """Retorna cierre_churn_historico agrupado por periodo_reporte -> metodos."""
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        if periodos:
            df = df[df["periodo_reporte"].isin(periodos)]
        pd_dict = {}
        for _, row in df.iterrows():
            p = str(row.get("periodo_reporte", ""))
            if p not in pd_dict:
                pd_dict[p] = {"periodo_reporte": p, "metodos": []}
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
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        return []


def get_dimensiones(periodos=None):
    """Retorna dimensiones agrupado por periodo_reporte -> dimensiones -> valores."""
    db = DBConnector()
    try:
        df = db.read_table("master_churn_dimensiones")
        if df.empty:
            return []
        if periodos:
            df = df[df["periodo_reporte"].isin(periodos)]
        pd_dict = {}
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
            })
        return sorted(pd_dict.values(), key=lambda x: x["periodo_reporte"], reverse=True)
    except Exception:
        return []


def get_periodos():
    """Lista de periodos disponibles."""
    db = DBConnector()
    try:
        df = db.read_table("cierre_churn_historico")
        if df.empty:
            return []
        return sorted(df["periodo_reporte"].unique().tolist(), reverse=True)
    except Exception:
        return []


def get_dashboard_data():
    """Datos completos para el dashboard."""
    return {"periodos": get_cierre_churn()}


def get_analytics_data(periodos=None):
    """Datos para analytics (cierre churn + dimensiones)."""
    return {
        "periodos": get_cierre_churn(periodos),
        "dimensiones": get_dimensiones(periodos),
    }
