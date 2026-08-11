# NetOwl-Django/backend/support/queries.py

from __future__ import annotations
import json
import logging
import pathlib
from typing import Any
import pandas as pd
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames

logger = logging.getLogger(__name__)

ZONAS_PATH = pathlib.Path(__file__).resolve().parent.parent.parent / "Zonas.json"

def _parse_jsonb(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val

def get_support_periodos() -> list[str]:
    db = DBConnector()
    try:
        df = db.query(f"SELECT DISTINCT periodo_reporte FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} ORDER BY periodo_reporte DESC")
        if df.empty:
            return []
        return df["periodo_reporte"].tolist()
    except Exception:
        logger.exception("Error al consultar periodos de soporte")
        return []

def get_support_cierre_historico(periodos: list[str] | None = None) -> list[dict]:
    db = DBConnector()
    try:
        where_clause = ""
        params = []
        if periodos:
            placeholders = ", ".join(["%s"] * len(periodos))
            where_clause = f"WHERE periodo_reporte IN ({placeholders})"
            params = periodos

        df = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
            {where_clause}
            ORDER BY periodo_reporte DESC
        """, params=params)

        if df.empty:
            return []
        return df.to_dict(orient="records")
    except Exception:
        logger.exception("Error al consultar cierre histórico de soporte")
        return []

def get_support_metric_totals(periodo: str | None = None) -> dict:
    db = DBConnector()
    try:
        df_mg = db.query(f"SELECT resumen_global, por_grupo_trabajo FROM {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} WHERE id = 1")
        
        resumen_global = {}
        por_grupo = {}
        if not df_mg.empty:
            resumen_global = _parse_jsonb(df_mg.iloc[0]["resumen_global"]) or {}
            por_grupo = _parse_jsonb(df_mg.iloc[0]["por_grupo_trabajo"]) or {}

        df_hist = db.query(f"""
            SELECT * FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
            ORDER BY periodo_reporte ASC
        """)
        historico = df_hist.to_dict(orient="records") if not df_hist.empty else []

        if not resumen_global and historico:
            df_h = pd.DataFrame(historico)
            resumen_global = {
                "total_tickets_promedio_mensual": round(float(df_h["total_tickets"].mean()), 2),
                "tickets_resueltos_promedio_mensual": round(float(df_h["tickets_resueltos"].mean()), 2),
                "tickets_cancelados_promedio_mensual": round(float(df_h["tickets_cancelados"].fillna(0).mean()), 2),
                "tickets_rezagados_promedio_mensual": round(float(df_h["tickets_rezagados"].fillna(0).mean()), 2),
                "pct_resueltos": round(float(df_h["pct_resueltos"].mean()), 2),
                "pct_cancelados": round(float(df_h["pct_cancelados"].fillna(0).mean()), 2),
                "pct_rezagados": round(float(df_h["pct_rezagados"].fillna(0).mean()), 2),
                "tiempo_medio_cierre_horas": round(float(df_h["tiempo_medio_cierre_horas"].mean()), 2),
                "tiempo_mediana_cierre_horas": round(float(df_h["tiempo_mediana_cierre_horas"].fillna(0).mean()), 2),
                "tiempo_promedio_primera_respuesta_horas": round(float(df_h["tiempo_promedio_primera_respuesta_horas"].fillna(0).mean()), 2),
                "pct_excede_promedio_cierre": round(float(df_h["pct_excede_promedio_cierre"].fillna(0).mean()), 2),
                "pct_excede_mediana_cierre": round(float(df_h["pct_excede_mediana_cierre"].fillna(0).mean()), 2),
            }

        return {
            "resumen_global": resumen_global,
            "por_grupo_trabajo": por_grupo,
            "historico_tendencias": historico
        }
    except Exception:
        logger.exception("Error al consultar métricas globales de soporte")
        return {"resumen_global": {}, "por_grupo_trabajo": {}, "historico_tendencias": []}

def get_support_analytics_structured(periodo: str | None = None) -> dict:
    """Estructura Analytics calculando la Tasa de Incidencia por Cliente (%) por Site."""
    db = DBConnector()
    try:
        zone_info = {}
        if ZONAS_PATH.exists():
            with open(ZONAS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                for z in data.get("zonas", []):
                    zone_info[z["name"].strip().lower()] = {
                        "site": z.get("Site", "Valencia").strip(),
                        "type": z.get("Type", "RF").strip()
                    }

        # 1. Consultar base de suscriptores para sacar la población real de clientes por zona
        df_subs_cnt = db.query(f"""
            SELECT zona, COUNT(*)::int AS total_suscriptores
            FROM {DB_SCHEMA}.{TableNames.SUBSCRIPTIONS}
            GROUP BY zona
        """)
        
        site_subs_map = {}
        if not df_subs_cnt.empty:
            for _, srow in df_subs_cnt.iterrows():
                z_name = str(srow["zona"]).strip().lower()
                z_meta = zone_info.get(z_name, {"site": "Otros / Desconocido"})
                s_name = z_meta["site"]
                site_subs_map[s_name] = site_subs_map.get(s_name, 0) + int(srow["total_suscriptores"])

        where_p = ""
        params_p = []
        where_t = ""
        params_t = []
        if periodo and periodo != "ALL":
            where_p = "WHERE periodo_reporte = %s"
            params_p = [periodo]
            where_t = "WHERE TO_CHAR(creado_el, 'YYYY-MM') = %s"
            params_t = [periodo]
        else:
            periodos = get_support_periodos()
            if periodos:
                where_p = "WHERE periodo_reporte = %s"
                params_p = [periodos[0]]
                where_t = "WHERE TO_CHAR(creado_el, 'YYYY-MM') = %s"
                params_t = [periodos[0]]

        df_dims = db.query(f"""
            SELECT periodo_reporte, dimension, grupo_trabajo, tipo_solicitud, razon_falla, valor, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
            {where_p}
        """, params=params_p)

        df_soluciones = db.query(f"""
            SELECT grupo_trabajo, solucion_falla, COUNT(*)::int AS total
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
            {where_t}
              AND solucion_falla IS NOT NULL AND solucion_falla != '' AND solucion_falla != 'Sin Especificar'
            GROUP BY grupo_trabajo, solucion_falla
            ORDER BY total DESC
        """, params=params_t)

        if df_dims.empty:
            return {"grupos": {}}

        grupos_dict = {}

        for _, row in df_dims.iterrows():
            g = row["grupo_trabajo"]
            dim = row["dimension"]
            t_sol = row["tipo_solicitud"]
            r_fal = row["razon_falla"]
            val = row["valor"]
            m = _parse_jsonb(row["metricas"]) or {}

            if g not in grupos_dict:
                grupos_dict[g] = {
                    "total_tickets_grupo": 0,
                    "metricas_grupo": {},
                    "tipos_solicitud": [],
                    "razones_falla": [],
                    "soluciones_falla": [],
                    "sucursales": [],
                    "sites_summary": []
                }

            if dim == "grupo_trabajo":
                grupos_dict[g]["total_tickets_grupo"] = m.get("total_tickets", 0)
                grupos_dict[g]["metricas_grupo"] = m
            elif dim == "tipo_solicitud" and t_sol != "Todas" and r_fal == "Todas":
                grupos_dict[g]["tipos_solicitud"].append({"nombre": val, "metricas": m})
            elif dim == "razon_falla" and r_fal != "Todas":
                grupos_dict[g]["razones_falla"].append({"nombre": val, "metricas": m})
            elif dim == "sucursal" and val != "Todas" and t_sol == "Todas" and r_fal == "Todas":
                grupos_dict[g]["sucursales"].append({"nombre": val, "metricas": m})
            elif dim == "zona" and val != "Todas" and t_sol == "Todas" and r_fal == "Todas":
                val_zs = val
                parts = val_zs.split(" - ")
                z_name = parts[0].strip() if len(parts) > 0 else val_zs
                z_meta = zone_info.get(z_name.lower(), {"site": "Otros / Desconocido", "type": "RF"})
                site_name = z_meta["site"]

                sites_map = grupos_dict[g].setdefault("_sites_temp", {})
                if site_name not in sites_map:
                    sites_map[site_name] = {"site": site_name, "total_tickets": 0, "tickets_resueltos": 0, "suma_mttr": 0.0, "count_mttr": 0}

                s_obj = sites_map[site_name]
                s_obj["total_tickets"] += m.get("total_tickets", 0)
                s_obj["tickets_resueltos"] += m.get("tickets_resueltos", 0)
                s_obj["suma_mttr"] += (m.get("tiempo_medio_cierre_horas", 0) * m.get("tickets_resueltos", 0))
                s_obj["count_mttr"] += m.get("tickets_resueltos", 0)

        # Cargar soluciones técnicas
        if not df_soluciones.empty:
            for _, srow in df_soluciones.iterrows():
                g = srow["grupo_trabajo"]
                if g in grupos_dict:
                    tot_g = grupos_dict[g]["total_tickets_grupo"] or 1
                    cant = int(srow["total"])
                    pct = round((cant / tot_g) * 100, 2)
                    grupos_dict[g]["soluciones_falla"].append({
                        "nombre": srow["solucion_falla"],
                        "total": cant,
                        "pct": pct
                    })

        # Estructurar la Tasa de Incidencia por Cliente (%) por Site
        for g, data_g in grupos_dict.items():
            tot_g = data_g["total_tickets_grupo"] or 1
            
            for r in data_g["razones_falla"]:
                cant = r["metricas"].get("total_tickets", 0)
                r["metricas"]["pct_del_grupo"] = round((cant / tot_g) * 100, 2)

            sites_temp = data_g.pop("_sites_temp", {})
            sites_summary = []

            for s_name, s_data in sites_temp.items():
                tot_tkts = s_data["total_tickets"]
                pop_subs = site_subs_map.get(s_name, 0)
                
                # TASA DE INCIDENCIA REAL: (Tickets del Site / Suscriptores del Site) * 100
                tasa_incidencia = round((tot_tkts / pop_subs) * 100, 2) if pop_subs > 0 else 0.0
                mttr_avg = round(s_data["suma_mttr"] / s_data["count_mttr"], 2) if s_data["count_mttr"] > 0 else 0.0

                sites_summary.append({
                    "site": s_name,
                    "total_tickets": tot_tkts,
                    "total_suscriptores": pop_subs,
                    "tasa_incidencia_pct": tasa_incidencia,
                    "mttr_promedio": mttr_avg
                })

            # Ordenar los Sites de mayor a menor Tasa de Incidencia (%) para destacar los Sites con más fallas por cliente
            sites_summary.sort(key=lambda x: x["tasa_incidencia_pct"], reverse=True)
            data_g["sites_summary"] = sites_summary

        return {"grupos": grupos_dict}
    except Exception:
        logger.exception("Error estructurando Analytics de Soporte")
        return {"grupos": {}}

def get_support_dimension_metrics(periodos: list[str] | None = None) -> list[dict]:
    db = DBConnector()
    try:
        where_clause = ""
        params = []
        if periodos:
            placeholders = ", ".join(["%s"] * len(periodos))
            where_clause = f"WHERE periodo_reporte IN ({placeholders})"
            params = periodos

        df = db.query(f"""
            SELECT periodo_reporte, dimension, grupo_trabajo, tipo_solicitud, razon_falla, valor, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
            {where_clause}
            ORDER BY periodo_reporte DESC, grupo_trabajo ASC
        """, params=params)

        if df.empty:
            return []

        result = []
        for _, row in df.iterrows():
            result.append({
                "periodo": row["periodo_reporte"],
                "dimension": row["dimension"],
                "grupo_trabajo": row["grupo_trabajo"],
                "tipo_solicitud": row["tipo_solicitud"],
                "razon_falla": row["razon_falla"],
                "valor": row["valor"],
                "metricas": _parse_jsonb(row["metricas"]) or {}
            })
        return result
    except Exception:
        logger.exception("Error al consultar métricas dimensionales de soporte")
        return []

def get_support_tickets_list(limit: int = 500, grupo: str | None = None, periodo: str | None = None) -> list[dict]:
    db = DBConnector()
    try:
        where_clause = "WHERE 1=1"
        params = []
        if grupo:
            where_clause += " AND grupo_trabajo = %s"
            params.append(grupo)
        if periodo and len(periodo) == 7:
            where_clause += " AND TO_CHAR(creado_el, 'YYYY-MM') = %s"
            params.append(periodo)
        
        df = db.query(f"""
            SELECT ticket_sequence, cliente, etapa, grupo_trabajo, sucursal, zona, municipio,
                   tipo_solicitud, razon_falla, solucion_falla, creado_el,
                   ultima_actualizacion_etapa, duracion_total_horas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
            {where_clause}
            ORDER BY creado_el DESC
            LIMIT {limit}
        """, params=params)
        
        if df.empty:
            return []
            
        df["creado_el"] = df["creado_el"].astype(str)
        df["ultima_actualizacion_etapa"] = df["ultima_actualizacion_etapa"].astype(str)
        df["duracion_total_horas"] = df["duracion_total_horas"].astype(float).round(2)
        return df.to_dict(orient="records")
    except Exception:
        logger.exception("Error al consultar lista de tickets de soporte")
        return []