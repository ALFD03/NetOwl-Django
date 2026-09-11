"""Lectura de lo calculado por soporte, mas lo que se calcula al vuelo.

Dos cosas no estan persistidas a proposito y se recalculan aqui sobre los
tickets del mes: el **cruce dimension x desglose** (el producto cartesiano son
decenas de miles de filas JSONB por periodo para algo que se mira de una en
una) y la **incidencia por zona**, que necesita cruzar con los activos que
calculo el modulo de suscripciones.
"""

# backend/support/queries.py

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import zonas_por_nombre
from core.utils import parse_jsonb
from services.support.analytics.cohorts import PeriodCohort, build_cohort, classify_tickets
from services.support.analytics.config import (
    DIM_GRUPO,
    SUPPORT_DESGLOSES,
    SUPPORT_DIMENSION_COLUMNS,
    SUPPORT_DIMENSIONES,
)
from services.support.analytics.metrics import compute_metrics_for_period

logger = logging.getLogger(__name__)

# --- Lecturas de tablas ya calculadas ---------------------------------------

def get_support_periodos() -> list[str]:
    """Los periodos con cierre calculado, del mas reciente al mas antiguo."""
    db = DBConnector()
    try:
        df = db.query(f"""
            SELECT DISTINCT periodo_reporte
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
            ORDER BY periodo_reporte DESC
        """)
        return df["periodo_reporte"].tolist() if not df.empty else []
    except Exception:
        logger.exception("Error al consultar periodos de soporte")
        return []


def get_support_cierre_historico(periodos: list[str] | None = None) -> list[dict]:
    """
    El histórico de cierres, con las métricas del JSONB ya aplanadas.

    Se aplanan aquí y no en el front porque las tablas y las sparklines leen los
    escalares por nombre; el JSONB es un detalle de almacenamiento.
    """
    db = DBConnector()
    try:
        where = ["1=1"]
        params: list[Any] = []

        if periodos:
            where.append(f"periodo_reporte IN ({', '.join(['%s'] * len(periodos))})")
            params.extend(periodos)

        df = db.query(f"""
            SELECT periodo_reporte, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}
            WHERE {" AND ".join(where)}
            ORDER BY periodo_reporte ASC
        """, params=params)

        if df.empty:
            return []

        return [
            {
                "periodo_reporte": row["periodo_reporte"],
                **(parse_jsonb(row["metricas"]) or {}),
            }
            for _, row in df.iterrows()
        ]
    except Exception:
        logger.exception("Error al consultar cierre histórico de soporte")
        return []


def get_support_metric_totals() -> dict:
    """El dashboard de empresa: promedio de todos los periodos, más su serie."""
    db = DBConnector()
    try:
        df = db.query(f"""
            SELECT resumen_global, por_grupo_trabajo, periodos_evaluados
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES}
            WHERE id = 1
        """)

        resumen: dict = {}
        por_grupo: dict = {}
        periodos_evaluados = 0

        if not df.empty:
            fila = df.iloc[0]
            resumen = parse_jsonb(fila["resumen_global"]) or {}
            por_grupo = parse_jsonb(fila["por_grupo_trabajo"]) or {}
            periodos_evaluados = int(fila["periodos_evaluados"] or 0)

        return {
            "periodos_evaluados": periodos_evaluados,
            "resumen_global": resumen,
            "por_grupo_trabajo": por_grupo,
            "historico_tendencias": get_support_cierre_historico(),
        }
    except Exception:
        logger.exception("Error al consultar métricas globales de soporte")
        return {
            "periodos_evaluados": 0,
            "resumen_global": {}, "por_grupo_trabajo": {}, "historico_tendencias": [],
        }


def get_support_dimension_metrics(
    periodo: str, grupo: str | None = None, dimension: str | None = None,
) -> list[dict]:
    """Las filas dimensionales persistidas de un periodo."""
    db = DBConnector()
    try:
        where = ["periodo_reporte = %s"]
        params: list[Any] = [periodo]

        if grupo:
            where.append("grupo_trabajo = %s")
            params.append(grupo)
        if dimension:
            where.append("dimension = %s")
            params.append(dimension)

        df = db.query(f"""
            SELECT grupo_trabajo, dimension, valor, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}
            WHERE {" AND ".join(where)}
            ORDER BY grupo_trabajo ASC, dimension ASC, valor ASC
        """, params=params)

        if df.empty:
            return []

        return [
            {
                "grupo_trabajo": row["grupo_trabajo"],
                "dimension": row["dimension"],
                "valor": row["valor"],
                "metricas": parse_jsonb(row["metricas"]) or {},
            }
            for _, row in df.iterrows()
        ]
    except Exception:
        logger.exception("Error al consultar métricas dimensionales de soporte")
        return []


# --- Cálculo al vuelo -------------------------------------------------------

def _load_period_cohort(db: DBConnector, periodo: str) -> PeriodCohort:
    """
    La cohorte de un periodo, reconstruida desde los tickets.

    Se leen sólo los tickets que nacieron o cerraron en el mes —del orden de
    veinte mil filas— y se clasifican con las mismas reglas del analizador, así
    que lo que sale de aquí es idéntico a lo que se persistió.
    """
    df = db.query(f"""
        SELECT * FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
        WHERE TO_CHAR(creado_el, 'YYYY-MM') = %s
           OR TO_CHAR(ultima_actualizacion_etapa, 'YYYY-MM') = %s
    """, params=[periodo, periodo])

    if df.empty:
        return PeriodCohort(periodo, df)

    return build_cohort(classify_tickets(df), periodo)


def get_support_breakdown(
    periodo: str, dimension: str, valor: str, grupo: str | None = None,
) -> dict:
    """
    El desglose de un valor dimensional por tipo, razón y solución.

    Este cruce no está persistido a propósito: el producto cartesiano de zonas,
    sucursales y técnicos contra las ~160 razones y soluciones son decenas de
    miles de filas JSONB por periodo, para algo que sólo se mira de una en una.
    Recalcularlo sobre los tickets del mes cuesta milisegundos.
    """
    if dimension not in SUPPORT_DIMENSION_COLUMNS:
        return {"metricas": {}, "desgloses": {}}

    db = DBConnector()
    try:
        cohorte = _load_period_cohort(db, periodo)
        if grupo:
            cohorte = cohorte.filter(DIM_GRUPO, grupo)
        cohorte = cohorte.filter(dimension, valor)

        return {
            "periodo": periodo,
            "grupo_trabajo": grupo or "",
            "dimension": dimension,
            "valor": valor,
            "metricas": compute_metrics_for_period(cohorte),
            "desgloses": {
                desglose: [
                    {"nombre": nombre, "metricas": compute_metrics_for_period(sub)}
                    for nombre, sub in cohorte.desglosar(desglose)
                ]
                for desglose in SUPPORT_DESGLOSES
            },
        }
    except Exception:
        logger.exception("Error al calcular el desglose dimensional de soporte")
        return {"metricas": {}, "desgloses": {}}


# --- Incidencia por zona ----------------------------------------------------

def _load_zone_info() -> dict:
    """Mapa zona → {site, type} desde el catálogo, indexado en minúsculas.

    La fuente es `core.fixtures`, no el antiguo `Zonas.json`: las zonas son hoy
    una tabla que se mantiene desde `/subscriptions/config/`.
    """
    zone_info: dict[str, dict] = {}
    for nombre, z in zonas_por_nombre().items():
        zone_info[nombre] = {
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


def _filas_incidencia(
    cohorte: PeriodCohort, zone_info: dict, activos_map: dict[str, int]
) -> list[dict]:
    """Las filas de zona de una cohorte ya recortada al grupo de trabajo."""
    filas = []
    for zona, sub in cohorte.desglosar("zona"):
        metricas = compute_metrics_for_period(sub)
        clave = zona.strip().lower()
        meta = zone_info.get(clave, {"site": "Otros / Desconocido", "type": "RF"})
        activos = activos_map.get(clave, 0)
        tickets = metricas["total_tickets"]

        filas.append({
            "zona": zona,
            "site": meta["site"],
            "tecnologia": meta["type"],
            "total_tickets": tickets,
            "total_suscriptores": activos,
            # Sin población conocida no hay denominador: se deja en 0 y el front
            # lo distingue de una zona realmente sana por `total_suscriptores`.
            "tasa_incidencia_pct": round((tickets / activos) * 100, 2) if activos > 0 else 0.0,
            "mttr_promedio": metricas["tiempo_medio_cierre_creado_cerrados_horas"],
            "pct_resueltos": metricas["pct_resueltos"],
        })

    filas.sort(key=lambda x: x["tasa_incidencia_pct"], reverse=True)
    return filas


def get_incidencia_por_zona(
    db: DBConnector, cohorte: PeriodCohort
) -> dict[str, list[dict]]:
    """
    Incidencia por zona de cada grupo de trabajo: (tickets del grupo en la zona
    / activos de la zona) * 100.

    El numerador se recorta al grupo y el denominador NO: no existe un reparto
    de suscriptores por grupo de soporte —`analyzer_churn_dimensiones` sólo
    conoce `zona_sucursal`—, así que la población de referencia es siempre la
    base completa de la zona. La lectura de cada fila es, por tanto, "tickets
    de este grupo por cada 100 clientes de la zona", y las tasas de los grupos
    suman la tasa total de la zona.

    Se devuelven todos los grupos en un mapa, y no sólo el seleccionado, porque
    el selector de grupo es client-side, igual que el de dimensión: cambiarlo
    no debe costar una vuelta al servidor. `Zonas.json` y los activos se leen
    una sola vez y se comparten entre grupos.
    """
    if cohorte.empty:
        return {}

    zone_info = _load_zone_info()
    activos_map = _get_activos_por_zona(db, cohorte.periodo)

    return {
        grupo: _filas_incidencia(sub, zone_info, activos_map)
        for grupo, sub in cohorte.desglosar(DIM_GRUPO)
    }


# --- Payload de la vista Analytics ------------------------------------------

def get_support_analytics_structured(periodo: str | None = None) -> dict:
    """
    Todo lo que la vista de periodo necesita en una sola carga.

    Las dimensiones llegan enteras —los tres ejes y los tres desgloses de cada
    grupo— porque el selector de dimensión es client-side: cambiarlo no debe
    costar una vuelta al servidor. Sólo el drill-down de un valor concreto pide
    datos nuevos, a `get_support_breakdown`.
    """
    periodos = get_support_periodos()
    if not periodos:
        return {"periodo": "", "grupos": {}, "incidencia_zonas": {}}

    periodo = periodo if periodo in periodos else periodos[0]

    db = DBConnector()
    try:
        filas = get_support_dimension_metrics(periodo)

        grupos: dict[str, dict] = {}
        for fila in filas:
            grupo = grupos.setdefault(fila["grupo_trabajo"], {
                "metricas": {},
                **{dim: [] for dim in (*SUPPORT_DIMENSIONES, *SUPPORT_DESGLOSES)},
            })

            if fila["dimension"] == DIM_GRUPO:
                grupo["metricas"] = fila["metricas"]
            elif fila["dimension"] in grupo:
                grupo[fila["dimension"]].append({
                    "nombre": fila["valor"],
                    "metricas": fila["metricas"],
                })

        cohorte = _load_period_cohort(db, periodo)

        return {
            "periodo": periodo,
            "grupos": grupos,
            "incidencia_zonas": get_incidencia_por_zona(db, cohorte),
        }
    except Exception:
        logger.exception("Error estructurando Analytics de Soporte")
        return {"periodo": periodo, "grupos": {}, "incidencia_zonas": {}}


# --- Listado de tickets -----------------------------------------------------

def get_support_tickets_list(
    limit: int = 500, grupo: str | None = None, periodo: str | None = None
) -> list[dict]:
    """Listado crudo de tickets, opcionalmente de un grupo y un periodo."""
    db = DBConnector()
    try:
        where = ["1=1"]
        params: list[Any] = []

        if grupo:
            where.append("grupo_trabajo = %s")
            params.append(grupo)
        if periodo and len(periodo) == 7:
            where.append("TO_CHAR(creado_el, 'YYYY-MM') = %s")
            params.append(periodo)

        df = db.query(f"""
            SELECT ticket_sequence, cliente, etapa, grupo_trabajo, asignado_a,
                   sucursal, zona, tipo_solicitud, razon_falla, solucion_falla,
                   creado_el, primera_fecha_asignada, ultima_actualizacion_etapa,
                   duracion_total_horas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
            WHERE {" AND ".join(where)}
            ORDER BY creado_el DESC
            LIMIT %s
        """, params=[*params, int(limit)])

        if df.empty:
            return []

        for col in ("creado_el", "primera_fecha_asignada", "ultima_actualizacion_etapa"):
            df[col] = df[col].astype(str)
        df["duracion_total_horas"] = pd.to_numeric(
            df["duracion_total_horas"], errors="coerce"
        ).round(2)

        return df.where(pd.notna(df), None).to_dict(orient="records")
    except Exception:
        logger.exception("Error al consultar lista de tickets de soporte")
        return []
