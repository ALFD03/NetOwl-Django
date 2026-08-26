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

def _load_zone_info() -> dict:
    """Mapa zona → {site, type} desde `Zonas.json`, indexado en minúsculas."""
    zone_info = {}
    if not ZONAS_PATH.exists():
        logger.warning("No se encontró Zonas.json: la incidencia por zona no podrá mapear sites.")
        return zone_info

    with open(ZONAS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    for z in data.get("zonas", []):
        zone_info[z["name"].strip().lower()] = {
            "site": z.get("Site", "Valencia").strip(),
            "type": z.get("Type", "RF").strip(),
        }
    return zone_info


def _get_activos_por_zona(db: DBConnector, periodo: str | None) -> dict[str, int]:
    """
    Suscriptores activos por zona al cierre del periodo, según el módulo de
    suscripciones (`analyzer_churn_dimensiones`, dimensión `zona_sucursal`).

    Se toma de ahí y no de un COUNT sobre la tabla de suscripciones porque esa
    cuenta es la de hoy: comparar los tickets de un mes antiguo contra la base
    actual convierte el crecimiento de clientes en una caída de la incidencia.
    Si el periodo pedido aún no está calculado en suscripciones, se usa el más
    reciente disponible.
    """
    df_periodos = db.query(f"""
        SELECT DISTINCT periodo_reporte
        FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONES}
        WHERE dimension = 'zona_sucursal'
        ORDER BY periodo_reporte DESC
    """)
    if df_periodos.empty:
        return {}

    disponibles = df_periodos["periodo_reporte"].astype(str).tolist()
    target = periodo if periodo in disponibles else disponibles[0]

    df = db.query(f"""
        SELECT valor, activos_final
        FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONES}
        WHERE periodo_reporte = %s AND dimension = 'zona_sucursal'
    """, params=[target])

    activos: dict[str, int] = {}
    for _, row in df.iterrows():
        # `valor` viene como "<zona> - <sucursal>"; la misma zona puede aparecer
        # en varias sucursales, así que se acumulan.
        zona = str(row["valor"]).split(" - ")[0].strip().lower()
        activos[zona] = activos.get(zona, 0) + int(row.get("activos_final") or 0)

    return activos


def _get_incidencia_por_zona(db: DBConnector, periodo: str | None, zone_info: dict) -> list[dict]:
    """
    Tasa de incidencia por zona: (tickets de la zona / activos de la zona) * 100.

    Los tickets se cuentan completos, sin filtrar por grupo de trabajo: la
    incidencia describe a los clientes de la zona, no el reparto interno del
    trabajo, así que el numerador tiene que abarcar todos los grupos.
    """
    where_t = ""
    params_t: list = []
    if periodo:
        where_t = "WHERE TO_CHAR(creado_el, 'YYYY-MM') = %s"
        params_t = [periodo]

    df = db.query(f"""
        SELECT
            zona,
            COUNT(*)::int AS total_tickets,
            COUNT(*) FILTER (WHERE LOWER(TRIM(etapa)) = 'resuelto')::int AS tickets_resueltos,
            AVG(EXTRACT(EPOCH FROM (ultima_actualizacion_etapa - primera_fecha_asignada)) / 3600.0)
                FILTER (
                    WHERE LOWER(TRIM(etapa)) = 'resuelto'
                      AND primera_fecha_asignada IS NOT NULL
                      AND ultima_actualizacion_etapa > primera_fecha_asignada
                ) AS mttr_horas
        FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
        {where_t}
        GROUP BY zona
    """, params=params_t)

    if df.empty:
        return []

    activos_map = _get_activos_por_zona(db, periodo)

    filas = []
    for _, row in df.iterrows():
        zona = str(row["zona"]).strip()
        clave = zona.lower()
        meta = zone_info.get(clave, {"site": "Otros / Desconocido", "type": "RF"})
        activos = activos_map.get(clave, 0)
        tickets = int(row["total_tickets"])
        mttr = row["mttr_horas"]

        filas.append({
            "zona": zona,
            "site": meta["site"],
            "tecnologia": meta["type"],
            "total_tickets": tickets,
            "total_suscriptores": activos,
            # Sin población conocida no hay denominador: se deja en 0 y el front
            # lo distingue de una zona realmente sana por `total_suscriptores`.
            "tasa_incidencia_pct": round((tickets / activos) * 100, 2) if activos > 0 else 0.0,
            "mttr_promedio": round(float(mttr), 2) if pd.notna(mttr) else 0.0,
        })

    filas.sort(key=lambda x: x["tasa_incidencia_pct"], reverse=True)
    return filas


def get_support_analytics_structured(periodo: str | None = None) -> dict:
    """Estructura Analytics calculando la Tasa de Incidencia por Cliente (%) por Site."""
    db = DBConnector()
    try:
        zone_info = _load_zone_info()

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
                    "sucursales": []
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

        for g, data_g in grupos_dict.items():
            tot_g = data_g["total_tickets_grupo"] or 1
            for r in data_g["razones_falla"]:
                cant = r["metricas"].get("total_tickets", 0)
                r["metricas"]["pct_del_grupo"] = round((cant / tot_g) * 100, 2)

        return {
            "grupos": grupos_dict,
            "incidencia_zonas": _get_incidencia_por_zona(db, params_t[0] if params_t else None, zone_info),
        }
    except Exception:
        logger.exception("Error estructurando Analytics de Soporte")
        return {"grupos": {}, "incidencia_zonas": []}

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