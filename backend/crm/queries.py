"""
Capa de acceso a datos para las vistas del frontend CRM.
Lee de crm_metricas_globales (dashboard) y tablas detalle + dimensiones.
"""
from __future__ import annotations
import json
from typing import Any, Dict, List, Optional

from ..database import DBConnector


def get_crm_cierre(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Recupera los datos de cierre CRM por período desde crm_metricas_globales.
    """
    db = DBConnector()
    try:
        df = db.read_table("crm_metricas_globales")
        if df.empty:
            return []

        if periodos:
            df = df[df["periodo"].isin(periodos)]

        result = []
        for _, row in df.sort_values("periodo", ascending=False).iterrows():
            entry: dict = {"periodo": row["periodo"]}

            ti_total = row["ti_total_instalados"]
            ti_total = int(ti_total) if pd_notnull(ti_total) else 0
            ti_prom = row["ti_horas_promedio"]
            ti_prom = float(ti_prom) if pd_notnull(ti_prom) else None
            ti_p25 = row["ti_horas_p25"]
            ti_p25 = float(ti_p25) if pd_notnull(ti_p25) else None
            ti_med = row["ti_horas_mediana"]
            ti_med = float(ti_med) if pd_notnull(ti_med) else None
            ti_p75 = row["ti_horas_p75"]
            ti_p75 = float(ti_p75) if pd_notnull(ti_p75) else None
            ti_min = row["ti_horas_min"]
            ti_min = float(ti_min) if pd_notnull(ti_min) else None
            ti_max = row["ti_horas_max"]
            ti_max = float(ti_max) if pd_notnull(ti_max) else None
            ti_std = row["ti_horas_std"]
            ti_std = float(ti_std) if pd_notnull(ti_std) else None

            entry["tiempo_instalacion"] = {
                "total_instalados": ti_total,
                "horas_promedio": ti_prom,
                "horas_p25": ti_p25,
                "horas_mediana": ti_med,
                "horas_p75": ti_p75,
                "horas_min": ti_min,
                "horas_max": ti_max,
                "horas_std": ti_std,
            }

            tpe_raw = row.get("tiempo_por_etapa")
            if tpe_raw is not None and not pd_isna(tpe_raw):
                if isinstance(tpe_raw, str):
                    tpe_raw = json.loads(tpe_raw)
                entry["tiempo_por_etapa"] = tpe_raw
            else:
                entry["tiempo_por_etapa"] = {}

            ef_raw = row.get("efectividad")
            if ef_raw is not None and not pd_isna(ef_raw):
                if isinstance(ef_raw, str):
                    ef_raw = json.loads(ef_raw)
                entry["efectividad"] = ef_raw
            else:
                entry["efectividad"] = []

            pe8_tc = row["pe8_total_clientes"]
            pe8_c8 = row["pe8_count_etapa8"]
            pe8_cp = row["pe8_count_perdidos"]
            pe8_p8 = row["pe8_pct_etapa8"]
            pe8_pp = row["pe8_pct_perdidos"]

            entry["probabilidad_etapa8_perdidos"] = {
                "resumen": {
                    "total_clientes": int(pe8_tc) if pd_notnull(pe8_tc) else 0,
                    "count_etapa8": int(pe8_c8) if pd_notnull(pe8_c8) else 0,
                    "count_perdidos": int(pe8_cp) if pd_notnull(pe8_cp) else 0,
                    "pct_etapa8": float(pe8_p8) if pd_notnull(pe8_p8) else 0,
                    "pct_perdidos": float(pe8_pp) if pd_notnull(pe8_pp) else 0,
                },
                "motivos_perdida": [],
            }

            rp_tp = row["rp_total_perdidos"]
            rp_r = row["rp_rescatados"]
            rp_pr = row["rp_pct_rescate"]
            entry["rescate_perdidos"] = {
                "total_perdidos": int(rp_tp) if pd_notnull(rp_tp) else 0,
                "rescatados": int(rp_r) if pd_notnull(rp_r) else 0,
                "pct_rescate": float(rp_pr) if pd_notnull(rp_pr) else 0,
            }

            tc = row["total_clientes"]
            g = row["ganados"]
            p = row["perdidos"]
            e8 = row["etapa_8_count"]
            e7 = row["etapa_7_count"]
            entry["total_clientes"] = int(tc) if pd_notnull(tc) else 0
            entry["ganados"] = int(g) if pd_notnull(g) else 0
            entry["perdidos"] = int(p) if pd_notnull(p) else 0
            entry["etapa_8_count"] = int(e8) if pd_notnull(e8) else 0
            entry["etapa_7_count"] = int(e7) if pd_notnull(e7) else 0

            result.append(entry)

        return result
    except Exception:
        import traceback
        traceback.print_exc()
        return []


def get_crm_dimensiones(
    periodos: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Recupera datos de CRM desglosados por dimensiones.
    Lee crm_dimensiones_historico.
    """
    db = DBConnector()
    try:
        df = db.read_table("crm_dimensiones_historico")
        if df.empty:
            return []

        if periodos:
            df = df[df["periodo"].isin(periodos)]

        pd_dict: Dict[str, Dict] = {}
        for _, row in df.iterrows():
            p = str(row.get("periodo", ""))
            if p not in pd_dict:
                pd_dict[p] = {"periodo": p, "dimensiones": {}}

            dim = str(row.get("dimension", ""))
            if dim not in pd_dict[p]["dimensiones"]:
                pd_dict[p]["dimensiones"][dim] = []

            tpe_raw = row.get("tiempo_por_etapa_json", "{}")
            if isinstance(tpe_raw, str):
                try:
                    tpe_raw = json.loads(tpe_raw)
                except Exception:
                    tpe_raw = {}

            ef_raw = row.get("efectividad_json", "{}")
            if isinstance(ef_raw, str):
                try:
                    ef_raw = json.loads(ef_raw)
                except Exception:
                    ef_raw = {}

            pd_dict[p]["dimensiones"][dim].append({
                "valor": str(row.get("valor", "")),
                "total_clientes": _int(row.get("total_clientes")),
                "ganados": _int(row.get("ganados")),
                "perdidos": _int(row.get("perdidos")),
                "etapa_8_count": _int(row.get("etapa_8_count")),
                "etapa_7_count": _int(row.get("etapa_7_count")),
                "pct_etapa8": _float(row.get("pct_etapa8")),
                "pct_perdidos": _float(row.get("pct_perdidos")),
                "tiempo_instalacion_promedio_horas": _float(row.get("tiempo_instalacion_promedio_horas")),
                "tiempo_por_etapa": tpe_raw if isinstance(tpe_raw, dict) else {},
                "efectividad": ef_raw if isinstance(ef_raw, dict) else {},
                "pct_rescate_perdidos": _float(row.get("pct_rescate_perdidos")),
            })

        return sorted(pd_dict.values(), key=lambda x: x["periodo"], reverse=True)
    except Exception:
        return []


def get_crm_periodos() -> List[str]:
    """Períodos disponibles en crm_metricas_globales."""
    db = DBConnector()
    try:
        df = db.read_table("crm_metricas_globales")
        if df.empty:
            return []
        return sorted(df["periodo"].unique().tolist(), reverse=True)
    except Exception:
        return []


def get_crm_dashboard_data() -> Dict[str, Any]:
    return {"periodos": get_crm_cierre()}


def get_crm_analytics_data(
    periodos: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return {
        "periodos": get_crm_cierre(periodos),
        "dimensiones": get_crm_dimensiones(periodos),
    }


def get_crm_results_detail(periodo: str) -> Dict[str, Any]:
    """Detalle completo de un período: resumen + dimensiones."""
    cierre = get_crm_cierre([periodo])
    dims = get_crm_dimensiones([periodo])
    summary = cierre[0] if cierre else {}
    dimensions = dims[0]["dimensiones"] if dims else {}

    # Enriquecer con motivos de pérdida desde tabla detalle
    try:
        db = DBConnector()
        df = db.read_table("crm_motivos_perdida")
        if not df.empty:
            df_periodo = df[df["periodo"] == periodo]
            if not df_periodo.empty:
                motivos_raw = df_periodo.to_dict("records")
                motivos = []
                for m in motivos_raw:
                    motivos.append({
                        "motivo_perdida": m.get("motivo_perdida"),
                        "cantidad": _int(m.get("cantidad")),
                        "pct": _float(m.get("pct")),
                    })
                summary["probabilidad_etapa8_perdidos"]["motivos_perdida"] = motivos
    except Exception:
        pass

    return {
        "periodo": periodo,
        "summary": summary,
        "dimensions": dimensions,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def pd_notnull(v) -> bool:
    """Verifica si un valor no es nulo."""
    if v is None:
        return False
    if isinstance(v, dict):
        return True
    try:
        import pandas as pd
        return not bool(pd.isna(v).any()) if hasattr(pd.isna(v), 'any') else not pd.isna(v)
    except Exception:
        return v is not None


def pd_isna(v) -> bool:
    if v is None:
        return True
    if isinstance(v, (dict, list)):
        return False
    try:
        import pandas as pd
        result = pd.isna(v)
        return bool(result.any()) if hasattr(result, 'any') else bool(result)
    except Exception:
        return False
