"""Los tickets escalados dentro de las cohortes de cada grupo de trabajo.

El export de tickets dice el grupo que cada ticket tiene **hoy**, así que un
ticket que ATC escaló a Soporte figura sólo en Soporte, con su creación en ATC
y su cierre en Soporte. Leído así, ATC no despachó nada de lo que escaló y
Soporte arrastra horas que pasaron en ATC. Los logs de etapa saben cuándo se
escaló (`support_ticket_flujo.escalado_el`) y con eso el ticket se parte en dos
filas, una por equipo:

* **la copia de ATC** — creada cuando se creó el ticket y *cerrada al escalar*:
  para ATC escalar es despachar. Cuenta en el total del grupo, en creados y en
  cerrados, no en resueltos ni en cancelados, y es rezagada si a fin de su mes
  de creación todavía no había escalado. Sus tiempos van de la creación al
  escalamiento. El export no sabe quién lo atendió en ATC ni cómo se solucionó,
  así que esos dos campos dicen que se escaló (`ASSIGNED_ESCALATED`,
  `ESCALATED_SOLUTION`) en vez de atribuirle a ATC el técnico de Soporte.
* **la fila de Soporte** — el ticket del export, pero *nacido al escalarse*: es
  cuando le entró a Soporte. Su espera de asignación va del escalamiento hasta
  que Soporte lo tomó (la salida de su primera cola, de los logs), y su
  duración, del escalamiento al cierre. `duracion_total_horas` de Odoo **no**
  vuelve a contar al escalar: mide desde la creación —en octubre de 2026 era
  exactamente cierre − creación en todos los escalados—, así que dejarla le
  cargaba a Soporte las horas que el ticket pasó en ATC, que ya cuentan en la
  copia de ATC.

El total de la empresa es la suma de los grupos: un escalado cuenta dos veces,
una por el trabajo de cada equipo. Fue decisión de negocio.

De paso cada fila recibe las horas que su equipo pasó en cola, pausa, gestión y
etapas sin clasificar (`h_cola`, …), que es de donde sale «en qué se va el
tiempo». Sin logs de etapa cargados nada de esto ocurre: los tickets quedan como
dice el export y las medidas que dependen de los logs salen vacías.
"""

from __future__ import annotations

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.cohorts import classify_tickets
from services.support.analytics.config import (
    ASSIGNED_ESCALATED,
    COMPOSITION_KINDS,
    ESCALATED_SOLUTION,
    GROUP_ATC,
    TEAM_ATC,
    TEAM_SUPPORT,
)

FLOW = f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_FLOW}"

_HOURS = [f"h_{e}_{t}" for e in (TEAM_ATC, TEAM_SUPPORT) for t in COMPOSITION_KINDS]
_DATES = ["escalado_el", "sale_cola_atc", "sale_cola_soporte"]
PATH_COLUMNS = ["ticket_sequence", "completa", *_DATES, *_HOURS]

# Lo que la cohorte necesita de cada fila además de lo que pone `classify_tickets`.
ROW_COLUMNS = ["es_escalado", "llego_escalado", "con_recorrido",
                 *(f"h_{t}" for t in COMPOSITION_KINDS)]


def _flow_exists(db: DBConnector) -> bool:
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass(%s)", [FLOW])
            return cur.fetchone()[0] is not None


def read_paths(db: DBConnector, sequences: list[str] | None = None) -> pd.DataFrame:
    """Del recorrido de cada ticket, lo que reparte sus filas entre equipos.

    Con `secuencias`, sólo esos tickets: la cohorte de un mes que se arma al
    vuelo (un desglose) no necesita los ciento cincuenta mil.
    """
    empty = pd.DataFrame(columns=PATH_COLUMNS)
    if not _flow_exists(db):
        return empty

    columns = ", ".join(PATH_COLUMNS)
    if sequences is None:
        return db.query(f"SELECT {columns} FROM {FLOW}")
    if not sequences:
        return empty
    return db.query(
        f"SELECT {columns} FROM {FLOW} WHERE ticket_sequence = ANY(%s::text[])",
        params=[list(sequences)],
    )


def escalated_between(db: DBConnector, since, until) -> list[str]:
    """Los tickets escalados en `[desde, hasta)`: entran en ese mes aunque no
    nacieran ni cerraran en él, porque ese mes ATC los despachó y Soporte los
    recibió."""
    if not _flow_exists(db):
        return []
    df = db.query(
        f"SELECT ticket_sequence FROM {FLOW} WHERE escalado_el >= %s AND escalado_el < %s",
        params=[since, until],
    )
    return df["ticket_sequence"].astype(str).tolist() if not df.empty else []


def _without_path(df: pd.DataFrame) -> pd.DataFrame:
    """Las columnas de fila con su valor neutro: sin logs nada se reparte."""
    out = df.copy()
    out["es_escalado"] = False
    out["llego_escalado"] = False
    out["con_recorrido"] = False
    for kind in COMPOSITION_KINDS:
        out[f"h_{kind}"] = float("nan")
    return out


def _hours(start: pd.Series, end: pd.Series) -> pd.Series:
    return (end - start).dt.total_seconds() / 3600.0


def _first_valid(*candidates: pd.Series, mask) -> pd.Series:
    """La primera fecha de las candidatas que cumple su condición, fila a fila."""
    result = pd.Series(pd.NaT, index=candidates[0].index, dtype="datetime64[ns]")
    for series, condition in zip(candidates, mask):
        result = result.where(result.notna(), series.where(condition))
    return result


def add_escalation(df: pd.DataFrame, paths: pd.DataFrame) -> pd.DataFrame:
    """Parte cada escalado en su copia de ATC y su fila de Soporte (ver el módulo).

    `df` tiene que venir de `classify_tickets`. Un ticket escalado que hoy está
    en ATC —volvió— no se toca: es de ATC y su escalamiento no se le cuenta.
    """
    if df.empty or paths is None or paths.empty:
        return _without_path(df)

    rec = paths.drop_duplicates("ticket_sequence").copy()
    rec["ticket_sequence"] = rec["ticket_sequence"].astype(str)
    for col in _DATES:
        rec[col] = pd.to_datetime(rec[col], errors="coerce")
    for col in _HOURS:
        rec[col] = pd.to_numeric(rec[col], errors="coerce").fillna(0.0)
    rec["completa"] = rec["completa"].fillna(False).astype(bool)
    rec["_con_logs"] = True

    out = df.copy()
    out["ticket_sequence"] = out["ticket_sequence"].astype(str)
    out = out.merge(rec, on="ticket_sequence", how="left")
    out["_con_logs"] = out["_con_logs"].eq(True)
    out["con_recorrido"] = out["_con_logs"] & out["completa"].eq(True)

    in_atc = out["grupo_trabajo"].eq(GROUP_ATC)
    escalated = out["escalado_el"].notna() & ~in_atc

    # --- La copia de ATC, sacada del ticket tal y como venía.
    atc = out[escalated].copy()
    esc = atc["escalado_el"]
    atc["grupo_trabajo"] = GROUP_ATC
    atc["asignado_a"] = ASSIGNED_ESCALATED
    atc["solucion_falla"] = ESCALATED_SOLUTION
    atc["etapa"] = ESCALATED_SOLUTION
    # Quién lo tomó en ATC: la primera asignación del export si fue antes del
    # escalamiento; si no, la salida de la cola de ATC según los logs.
    atc["dt_asignacion"] = _first_valid(
        atc["dt_asignacion"], atc["sale_cola_atc"],
        mask=[atc["dt_asignacion"] <= esc, atc["sale_cola_atc"] <= esc],
    )
    atc["dt_cierre"] = esc
    atc["periodo_cierre"] = esc.dt.strftime("%Y-%m")
    atc["duracion_total_horas"] = _hours(atc["dt_creacion"], esc)
    atc["es_resuelto"] = False
    atc["es_cancelado"] = False
    atc["es_cerrado"] = True
    atc["es_rezagado"] = atc["periodo_creacion"] != atc["periodo_cierre"]
    atc["es_escalado"] = True
    atc["llego_escalado"] = False

    # --- La fila de Soporte: el mismo ticket, nacido al escalarse.
    sop = escalated
    esc = out.loc[sop, "escalado_el"]
    out.loc[sop, "dt_asignacion"] = _first_valid(
        out.loc[sop, "sale_cola_soporte"], out.loc[sop, "dt_asignacion"],
        mask=[out.loc[sop, "sale_cola_soporte"] >= esc, out.loc[sop, "dt_asignacion"] >= esc],
    )
    # Las columnas del export llegan como texto: numérica antes de mezclarle horas.
    out["duracion_total_horas"] = pd.to_numeric(out.get("duracion_total_horas"), errors="coerce")
    out.loc[sop, "duracion_total_horas"] = _hours(esc, out.loc[sop, "dt_cierre"])
    out.loc[sop, "dt_creacion"] = esc
    out.loc[sop, "periodo_creacion"] = esc.dt.strftime("%Y-%m")
    out["es_escalado"] = False
    out["llego_escalado"] = sop
    out["es_rezagado"] = ~out["es_cerrado"] | (out["periodo_creacion"] != out["periodo_cierre"])

    rows = pd.concat([out, atc], ignore_index=True)

    # Las horas de cada fila son las de su equipo.
    from_atc = rows["grupo_trabajo"].eq(GROUP_ATC)
    for kind in COMPOSITION_KINDS:
        hours = rows[f"h_{TEAM_ATC}_{kind}"].where(from_atc, rows[f"h_{TEAM_SUPPORT}_{kind}"])
        rows[f"h_{kind}"] = hours.where(rows["con_recorrido"])

    return rows.drop(columns=[c for c in PATH_COLUMNS if c != "ticket_sequence"] + ["_con_logs"])


def load_tickets(db: DBConnector) -> pd.DataFrame:
    """Todos los tickets, clasificados y con los escalados repartidos."""
    df = db.read_table(TableNames.SUPPORT_TICKETS)
    if df.empty:
        return df
    return add_escalation(classify_tickets(df), read_paths(db))
