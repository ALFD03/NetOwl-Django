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
from datetime import date, datetime
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import zones_by_name
from core.models import Period
from core.utils import parse_jsonb, zero_nulls
from services.support.analytics.cohorts import PeriodCohort, build_cohort, classify_tickets
from services.support.analytics.config import (
    GROUP_DIM,
    SUPPORT_BREAKDOWNS,
    SUPPORT_DIMENSION_COLUMNS,
    SUPPORT_DIMENSIONS,
)
from services.support.analytics.escalation import (
    add_escalation,
    escalated_between,
    read_paths,
)
from services.support.analytics.metrics import average_blocks, compute_metrics_for_period
from services.support.analytics.users import annotate_departments

logger = logging.getLogger(__name__)

# --- Lecturas de tablas ya calculadas ---------------------------------------

def get_support_periods() -> list[str]:
    """Los periodos con cierre calculado, del mas reciente al mas antiguo."""
    db = DBConnector()
    try:
        df = db.query(f"""
            SELECT DISTINCT periodo_reporte
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_CLOSE_HISTORY}
            ORDER BY periodo_reporte DESC
        """)
        return df["periodo_reporte"].tolist() if not df.empty else []
    except Exception:
        logger.exception("Error al consultar periodos de soporte")
        return []


def get_support_close_history(periods: list[str] | None = None) -> list[dict]:
    """
    El histórico de cierres, con las métricas del JSONB ya aplanadas.

    Se aplanan aquí y no en el front porque las tablas y las sparklines leen los
    escalares por nombre; el JSONB es un detalle de almacenamiento.
    """
    db = DBConnector()
    try:
        where = ["1=1"]
        params: list[Any] = []

        if periods:
            where.append(f"periodo_reporte IN ({', '.join(['%s'] * len(periods))})")
            params.extend(periods)

        df = db.query(f"""
            SELECT periodo_reporte, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_CLOSE_HISTORY}
            WHERE {" AND ".join(where)}
            ORDER BY periodo_reporte ASC
        """, params=params)

        if df.empty:
            return []

        return [
            {"periodo_reporte": period, **(metrics or {})}
            for period, metrics in zip(df["periodo_reporte"], df["metricas"].map(parse_jsonb), strict=True)
        ]
    except Exception:
        logger.exception("Error al consultar cierre histórico de soporte")
        return []


def get_support_metric_totals(only: str | None = None) -> dict:
    """El dashboard de empresa: promedio de todos los periodos, más su serie.

    Con `solo`, el mismo bloque construido con ese periodo y nada mas: es el
    dashboard de quien no ve todos los periodos (`services/config/periods.py`).
    """
    if only:
        return _period_metric_totals(only)
    db = DBConnector()
    try:
        df = db.query(f"""
            SELECT resumen_global, por_grupo_trabajo, periodos_evaluados
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_GLOBAL_METRICS}
            WHERE id = 1
        """)

        summary: dict = {}
        by_group: dict = {}
        evaluated_periods = 0

        if not df.empty:
            row = df.iloc[0]
            summary = parse_jsonb(row["resumen_global"]) or {}
            by_group = parse_jsonb(row["por_grupo_trabajo"]) or {}
            evaluated_periods = int(row["periodos_evaluados"] or 0)

        return {
            "periodos_evaluados": evaluated_periods,
            "resumen_global": summary,
            "por_grupo_trabajo": by_group,
            "historico_tendencias": get_support_close_history(),
        }
    except Exception:
        logger.exception("Error al consultar métricas globales de soporte")
        return {
            "periodos_evaluados": 0,
            "resumen_global": {}, "por_grupo_trabajo": {}, "historico_tendencias": [],
        }


def _period_metric_totals(period: str) -> dict:
    """`get_support_metric_totals` sobre un solo periodo, con la misma forma.

    El total sale del cierre del periodo y cada grupo de su fila de la
    dimension `grupo_trabajo`, ya persistida; los dos pasan por
    `average_blocks` para que las claves sean exactamente las del global.
    """
    historical = get_support_close_history([period])
    if not historical:
        return {
            "periodos_evaluados": 0,
            "resumen_global": {}, "por_grupo_trabajo": {}, "historico_tendencias": [],
        }
    block = {k: v for k, v in historical[0].items() if k != "periodo_reporte"}
    by_group = {
        row["grupo_trabajo"]: average_blocks([row["metricas"]])
        for row in get_support_dimension_metrics(period, dimension=GROUP_DIM)
    }
    return {
        "periodos_evaluados": 1,
        "resumen_global": average_blocks([block]),
        "por_grupo_trabajo": by_group,
        "historico_tendencias": historical,
    }


def get_support_dimension_metrics(
    period: str, group: str | None = None, dimension: str | None = None,
) -> list[dict]:
    """Las filas dimensionales persistidas de un periodo."""
    db = DBConnector()
    try:
        where = ["periodo_reporte = %s"]
        params: list[Any] = [period]

        if group:
            where.append("grupo_trabajo = %s")
            params.append(group)
        if dimension:
            where.append("dimension = %s")
            params.append(dimension)

        df = db.query(f"""
            SELECT grupo_trabajo, dimension, valor, metricas
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONS_HISTORICAL}
            WHERE {" AND ".join(where)}
            ORDER BY grupo_trabajo ASC, dimension ASC, valor ASC
        """, params=params)

        if df.empty:
            return []

        df["metricas"] = df["metricas"].map(lambda v: parse_jsonb(v) or {})
        return df[["grupo_trabajo", "dimension", "valor", "metricas"]].to_dict("records")
    except Exception:
        logger.exception("Error al consultar métricas dimensionales de soporte")
        return []


# --- Cálculo al vuelo -------------------------------------------------------

def _load_period_cohort(db: DBConnector, period: str) -> PeriodCohort:
    """
    La cohorte de un periodo, reconstruida desde los tickets.

    Se leen sólo los tickets que nacieron o cerraron en el mes —del orden de
    veinte mil filas— y se clasifican con las mismas reglas del analizador, así
    que lo que sale de aquí es idéntico a lo que se persistió.
    """
    # Rango de fechas y no `TO_CHAR(columna, 'YYYY-MM') = %s`: envolver la
    # columna en una funcion impide usar el indice, asi que cada clic de
    # desglose costaba un barrido secuencial de la tabla entera. Los dos
    # indices ya existen (ver loader.py). El rango es semiabierto —desde el dia
    # 1 hasta el 1 del mes siguiente, excluido— que es exactamente el mismo
    # conjunto de filas que devolvia la comparacion de texto.
    since = Period.build(f"{period}-01").start_date
    # Primer instante del mes siguiente, sin dependencias extra.
    until = datetime(since.year + since.month // 12, since.month % 12 + 1, 1)

    # Más los escalados en el mes, que nacieron y cerraron fuera de él pero que
    # ese mes ATC despachó y Soporte recibió (ver `escalation.py`).
    escalated = escalated_between(db, since, until)
    df = db.query(f"""
        SELECT * FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
        WHERE (creado_el >= %s AND creado_el < %s)
           OR (ultima_actualizacion_etapa >= %s AND ultima_actualizacion_etapa < %s)
           OR ticket_sequence = ANY(%s::text[])
    """, params=[since, until, since, until, escalated])

    if df.empty:
        return PeriodCohort(period, df)

    paths = read_paths(db, df["ticket_sequence"].astype(str).unique().tolist())
    return build_cohort(add_escalation(classify_tickets(df), paths), period)


def get_support_breakdown(
    period: str, dimension: str, value: str, group: str | None = None,
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
        cohort = _load_period_cohort(db, period)
        if group:
            cohort = cohort.filter(GROUP_DIM, group)
        cohort = cohort.filter(dimension, value)

        return {
            "periodo": period,
            "grupo_trabajo": group or "",
            "dimension": dimension,
            "valor": value,
            "metricas": compute_metrics_for_period(cohort),
            "desgloses": {
                breakdown: [
                    {"nombre": name, "metricas": compute_metrics_for_period(sub)}
                    for name, sub in cohort.break_down(breakdown)
                ]
                for breakdown in SUPPORT_BREAKDOWNS
            },
        }
    except Exception:
        logger.exception("Error al calcular el desglose dimensional de soporte")
        return {"metricas": {}, "desgloses": {}}


# --- Incidencia por zona ----------------------------------------------------

def _load_zone_info() -> dict:
    """Mapa zona → {site, type} desde el catálogo, indexado en minúsculas.

    La fuente es `core.fixtures`, no el antiguo `Zonas.json`: las zonas son hoy
    una tabla que se mantiene desde el modulo de Catalogos (`/catalogos/`).
    """
    zone_info: dict[str, dict] = {}
    for name, z in zones_by_name().items():
        zone_info[name] = {
            "site": z.get("Site", "Valencia").strip(),
            "type": z.get("Type", "RF").strip(),
        }
    return zone_info


def _get_active_by_zone(db: DBConnector, period: str | None) -> dict[str, int]:
    """
    Suscriptores activos por zona al cierre del periodo, según el módulo de
    suscripciones (`analyzer_churn_dimensiones`, dimensión `zona_sucursal`).

    Se toma de ahí y no de un COUNT sobre la tabla de suscripciones porque esa
    cuenta es la de hoy: comparar los tickets de un mes antiguo contra la base
    actual convierte el crecimiento de clientes en una caída de la incidencia.
    Si el periodo pedido aún no está calculado en suscripciones, se usa el más
    reciente disponible.
    """
    df_periods = db.query(f"""
        SELECT DISTINCT periodo_reporte
        FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONS}
        WHERE dimension = 'zona_sucursal'
        ORDER BY periodo_reporte DESC
    """)
    if df_periods.empty:
        return {}

    available = df_periods["periodo_reporte"].astype(str).tolist()
    target = period if period in available else available[0]

    df = zero_nulls(db.query(f"""
        SELECT valor, activos_final
        FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONS}
        WHERE periodo_reporte = %s AND dimension = 'zona_sucursal'
    """, params=[target]))

    # `valor` viene como "<zona> - <sucursal>"; la misma zona puede aparecer en
    # varias sucursales, así que se acumulan.
    zone = df["valor"].astype(str).str.split(" - ").str[0].str.strip().str.lower()
    active = pd.to_numeric(df["activos_final"], errors="coerce").fillna(0).astype(int)
    return {str(z): int(n) for z, n in active.groupby(zone).sum().items()}


def _incidence_rows(
    cohort: PeriodCohort, zone_info: dict, active_map: dict[str, int]
) -> list[dict]:
    """Las filas de zona de una cohorte ya recortada al grupo de trabajo."""
    rows = []
    for zone, sub in cohort.break_down("zona"):
        metrics = compute_metrics_for_period(sub)
        key = zone.strip().lower()
        meta = zone_info.get(key, {"site": "Otros / Desconocido", "type": "RF"})
        active = active_map.get(key, 0)
        tickets = metrics["total_tickets"]

        rows.append({
            "zona": zone,
            "site": meta["site"],
            "tecnologia": meta["type"],
            "total_tickets": tickets,
            "total_suscriptores": active,
            # Sin población conocida no hay denominador: se deja en 0 y el front
            # lo distingue de una zona realmente sana por `total_suscriptores`.
            "tasa_incidencia_pct": round((tickets / active) * 100, 2) if active > 0 else 0.0,
            "mttr_promedio": metrics["tiempo_medio_cierre_creado_cerrados_horas"],
            "pct_resueltos": metrics["pct_resueltos"],
        })

    rows.sort(key=lambda x: x["tasa_incidencia_pct"], reverse=True)
    return rows


def context_incidence(db: DBConnector, period: str) -> tuple[dict, dict[str, int]]:
    """Las zonas del catalogo y los activos del periodo, para reutilizarlos.

    Los cortes diarios de un mes recorren treinta y un cohortes contra las mismas
    zonas y los mismos activos: se leen una vez y se pasan a cada llamada.
    """
    return _load_zone_info(), _get_active_by_zone(db, period)


def get_incidence_by_zone(
    db: DBConnector,
    cohort: PeriodCohort,
    zone_info: dict | None = None,
    active_map: dict[str, int] | None = None,
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
    no debe costar una vuelta al servidor. El catálogo de zonas y los activos se
    leen una sola vez y se comparten entre grupos.

    `zone_info` y `active_map` permiten además compartirlos entre llamadas: los
    cortes diarios de un mes recorren treinta y un cohortes contra las mismas
    zonas y los mismos activos, y volver a leerlos en cada uno serían sesenta y
    dos consultas para el mismo resultado.
    """
    if cohort.empty:
        return {}

    zone_info = _load_zone_info() if zone_info is None else zone_info
    active_map = (
        _get_active_by_zone(db, cohort.period) if active_map is None else active_map
    )

    return {
        group: _incidence_rows(sub, zone_info, active_map)
        for group, sub in cohort.break_down(GROUP_DIM)
    }


# --- Payload de la vista Analytics ------------------------------------------

def structure_groups(rows: list[dict]) -> dict[str, dict]:
    """Agrupa las filas dimensionales por grupo de trabajo.

    Es la forma que consume la vista: cada grupo con sus metricas totales y una
    lista por cada eje y desglose. La usan por igual las filas persistidas del
    mes y las que un corte diario trae ya calculadas, para que el front reciba
    exactamente lo mismo en los dos casos.
    """
    groups: dict[str, dict] = {}
    for row in rows:
        group = groups.setdefault(row["grupo_trabajo"], {
            "metricas": {},
            **{dim: [] for dim in (*SUPPORT_DIMENSIONS, *SUPPORT_BREAKDOWNS)},
        })

        if row["dimension"] == GROUP_DIM:
            group["metricas"] = row["metricas"]
        elif row["dimension"] in group:
            group[row["dimension"]].append({
                "nombre": row["valor"],
                "metricas": row["metricas"],
            })

    return groups


def _end_date(period: str) -> date | None:
    """El ultimo dia de una etiqueta `"YYYY-MM-DD al YYYY-MM-DD"`, o None."""
    try:
        return date.fromisoformat(period[-10:])
    except ValueError:
        return None


def get_support_analytics_structured(period: str | None = None) -> dict:
    """
    Todo lo que la vista de periodo necesita en una sola carga.

    Las dimensiones llegan enteras —los tres ejes y los tres desgloses de cada
    grupo— porque el selector de dimensión es client-side: cambiarlo no debe
    costar una vuelta al servidor. Sólo el drill-down de un valor concreto pide
    datos nuevos, a `get_support_breakdown`.
    """
    periods = get_support_periods()
    if not periods:
        return {"periodo": "", "grupos": {}, "incidencia_zonas": {}}

    period = period if period in periods else periods[0]

    db = DBConnector()
    try:
        groups = annotate_departments(
            structure_groups(get_support_dimension_metrics(period)),
            _end_date(period),
        )
        cohort = _load_period_cohort(db, period)

        return {
            "periodo": period,
            "grupos": groups,
            "incidencia_zonas": get_incidence_by_zone(db, cohort),
        }
    except Exception:
        logger.exception("Error estructurando Analytics de Soporte")
        return {"periodo": period, "grupos": {}, "incidencia_zonas": {}}
