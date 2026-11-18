"""El recorrido de cada ticket entre ATC y Soporte, reconstruido desde sus logs.

Los tickets dicen como acabaron; los logs, por donde pasaron. De los logs sale
`support_ticket_flujo`, una fila por ticket con lo que el export de tickets no
puede dar:

* **el escalamiento** (`escalado_el`): el paso a `Nuevo - Soporte Técnico` desde
  una etapa que no es de Soporte. Como mucho uno por ticket, sin vuelta atras.
  Un ticket que nace en Soporte (etapa anterior vacia) no esta escalado. Con
  esa fecha `escalation.py` reparte cada escalado entre las cohortes de ATC y
  de Soporte, que es donde se miden volumenes, tasas y tiempos.
* **el tiempo de cada equipo**: cada tramo entre dos logs es del equipo de su
  etapa segun el catalogo (`EtapaSoporte`); los de una etapa compartida o sin
  clasificar son de ATC antes del escalamiento y de Soporte despues. Y dentro de
  cada equipo, cola (nadie lo ha tomado), pausa (espera algo de fuera) y
  gestion: «en que se va el tiempo».
* **cuando cada equipo lo tomo**: la salida de su primera cola, que es la
  asignacion de Soporte de un escalado (la del export es la de ATC).
* **los abiertos de hoy**, con su etapa actual (`get_open_tickets`).

Solo cuentan las horas de los tickets con la secuencia completa (su primer log
es la creacion, etapa anterior vacia).

El calculo pesado va en SQL: los tramos (`LEAD` sobre millones de logs) se
arman en una tabla temporal y de ahi sale el resumen por ticket, que se rehace
entero en cada analisis porque depende del catalogo de etapas: reclasificar una
cambia todos los meses.
"""

from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from psycopg2.extras import execute_values

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.tables import ensure
from services.support.analytics.config import (
    CANCELED_STAGES,
    ESCALATION_STAGE,
    KIND_CLOSE,
    KIND_HANDLING,
    KIND_PAUSE,
    KIND_QUEUE,
    KIND_UNCLASSIFIED,
    RESOLVED_STAGES,
    TEAM_ATC,
    TEAM_SUPPORT,
    TENURE_TIERS,
    TIME_ZONE,
)
from services.support.analytics.metrics import _compute_stats_for_series as stats
from services.support.analytics.tables import TICKET_LOGS

logger = logging.getLogger(__name__)

LOGS = f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}"
FLOW = f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_FLOW}"

CLOSES = sorted(RESOLVED_STAGES | CANCELED_STAGES)
TEAMS = (TEAM_ATC, TEAM_SUPPORT)
KINDS = (KIND_QUEUE, KIND_PAUSE, KIND_HANDLING, KIND_UNCLASSIFIED)

UNSPECIFIED = "Sin Especificar"


def now_caracas() -> pd.Timestamp:
    """La hora de Caracas sin zona, como se guardan las fechas de Odoo."""
    return pd.Timestamp(datetime.now(ZoneInfo(TIME_ZONE)).replace(tzinfo=None))


def stage_classification() -> dict[str, tuple[str, str]]:
    """`nombre en minusculas -> (equipo, tipo)`, del catalogo de etapas."""
    # Import diferido: el paquete de analitica tambien se importa sin las apps
    # de Django cargadas (comandos, el worker antes de `setup`).
    from services.support.models import SupportStage

    return {
        name.strip().lower(): (team, kind)
        for name, team, kind in SupportStage.objects.values_list("name", "team", "kind")
    }


def _exists(cur, table: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", [table])
    return cur.fetchone()[0] is not None


# --- Los tramos y el resumen por ticket (SQL) ------------------------------

def _build_segments(cur, stages: dict[str, tuple[str, str]]) -> None:
    """`_tiers`: una fila por log, con el tramo que abre, su equipo y su tipo.

    El tramo de un log va de su fecha a la del siguiente log del ticket (`fin`
    nulo en el ultimo: es la etapa en la que esta hoy). Temporal y con
    `ON COMMIT DROP`: vive lo que dura el analisis.
    """
    cur.execute("""
        CREATE TEMP TABLE _etapas (clave TEXT PRIMARY KEY, equipo TEXT NOT NULL, tipo TEXT NOT NULL)
        ON COMMIT DROP;
    """)
    rows = [(key, team, kind) for key, (team, kind) in stages.items() if key not in CLOSES]
    if rows:
        execute_values(cur, "INSERT INTO _etapas (clave, equipo, tipo) VALUES %s ON CONFLICT DO NOTHING", rows)

    cur.execute(f"""
        CREATE TEMP TABLE _tramos ON COMMIT DROP AS
        WITH l AS (
            SELECT
                g.log_id,
                g.ticket_sequence,
                g.creado_el AS inicio,
                NULLIF(btrim(g.etapa_anterior), '') AS anterior,
                NULLIF(btrim(g.etapa_nueva), '') AS etapa,
                ROW_NUMBER() OVER w AS rn,
                LEAD(g.creado_el) OVER w AS fin
            FROM {LOGS} g
            WINDOW w AS (PARTITION BY g.ticket_sequence ORDER BY g.creado_el, g.log_id)
        ),
        c AS (
            SELECT l.*,
                   ea.equipo AS equipo_anterior,
                   en.equipo AS equipo_etapa,
                   en.tipo AS tipo_etapa
            FROM l
            LEFT JOIN _etapas ea ON ea.clave = lower(l.anterior)
            LEFT JOIN _etapas en ON en.clave = lower(l.etapa)
        ),
        esc AS (
            SELECT ticket_sequence, MIN(inicio) AS escalado_el
            FROM c
            WHERE lower(etapa) = lower(%(escalamiento)s)
              AND anterior IS NOT NULL
              AND COALESCE(equipo_anterior, '') <> %(soporte)s
            GROUP BY ticket_sequence
        ),
        ori AS (
            SELECT ticket_sequence,
                   inicio AS creado,
                   anterior IS NULL AS completa,
                   CASE WHEN (CASE WHEN anterior IS NULL THEN equipo_etapa ELSE equipo_anterior END) = %(soporte)s
                        THEN %(soporte)s ELSE %(atc)s END AS origen
            FROM c
            WHERE rn = 1
        )
        SELECT
            c.log_id, c.ticket_sequence, c.rn, c.anterior, c.etapa, c.inicio, c.fin,
            ori.creado, ori.completa, ori.origen, esc.escalado_el,
            COALESCE(
                c.tipo_etapa,
                CASE WHEN lower(COALESCE(c.etapa, '')) = ANY(%(cierres)s) THEN %(cierre)s ELSE %(sin_clasificar)s END
            ) AS tipo,
            CASE
                WHEN c.equipo_etapa IN (%(atc)s, %(soporte)s) THEN c.equipo_etapa
                WHEN esc.escalado_el IS NOT NULL AND c.inicio >= esc.escalado_el THEN %(soporte)s
                WHEN esc.escalado_el IS NOT NULL THEN %(atc)s
                ELSE ori.origen
            END AS equipo,
            (lower(COALESCE(c.anterior, '')) = ANY(%(cierres)s)
             AND NOT lower(COALESCE(c.etapa, '')) = ANY(%(cierres)s)) AS es_reapertura,
            (c.equipo_anterior = %(atc)s AND c.equipo_etapa = %(soporte)s
             AND lower(c.etapa) <> lower(%(escalamiento)s)) AS es_transferencia,
            (EXTRACT(EPOCH FROM (c.fin - c.inicio)) / 3600.0)::float8 AS horas
        FROM c
        JOIN ori USING (ticket_sequence)
        LEFT JOIN esc USING (ticket_sequence);
    """, {
        "escalamiento": ESCALATION_STAGE,
        "atc": TEAM_ATC,
        "soporte": TEAM_SUPPORT,
        "cierres": CLOSES,
        "cierre": KIND_CLOSE,
        "sin_clasificar": KIND_UNCLASSIFIED,
    })
    cur.execute("CREATE INDEX ON _tramos (inicio)")
    cur.execute("CREATE INDEX ON _tramos (fin)")
    cur.execute("ANALYZE _tramos")


def _persist_flow(cur) -> None:
    """`support_ticket_flujo`: una fila por ticket, rehecha entera."""
    hours = ",\n".join(
        f"SUM(horas) FILTER (WHERE equipo = '{e}' AND tipo = '{t}') AS h_{e}_{t}"
        for e in TEAMS for t in KINDS
    )
    cur.execute(f"DROP TABLE IF EXISTS {FLOW}")
    cur.execute(f"""
        CREATE TABLE {FLOW} AS
        SELECT
            ticket_sequence,
            MIN(creado) AS creado,
            BOOL_AND(completa) AS completa,
            MIN(origen) AS origen,
            MIN(escalado_el) AS escalado_el,
            COUNT(*) AS logs,
            MAX(inicio) AS ultimo_log,
            (ARRAY_AGG(etapa ORDER BY rn DESC))[1] AS etapa_actual,
            (ARRAY_AGG(equipo ORDER BY rn DESC))[1] AS equipo_actual,
            (ARRAY_AGG(tipo ORDER BY rn DESC))[1] AS tipo_actual,
            MIN(inicio) FILTER (WHERE tipo = '{KIND_CLOSE}') AS primer_cierre,
            COUNT(*) FILTER (WHERE es_reapertura) AS reaperturas,
            BOOL_OR(es_transferencia) AS transferencia_sin_escalar,
            MIN(inicio) FILTER (WHERE equipo = '{TEAM_ATC}' AND tipo = '{KIND_QUEUE}') AS entra_cola_atc,
            MIN(fin) FILTER (WHERE equipo = '{TEAM_ATC}' AND tipo = '{KIND_QUEUE}') AS sale_cola_atc,
            MIN(inicio) FILTER (WHERE equipo = '{TEAM_SUPPORT}' AND tipo = '{KIND_QUEUE}') AS entra_cola_soporte,
            MIN(fin) FILTER (WHERE equipo = '{TEAM_SUPPORT}' AND tipo = '{KIND_QUEUE}') AS sale_cola_soporte,
            {hours}
        FROM _tramos
        GROUP BY ticket_sequence
    """)
    cur.execute(f"ALTER TABLE {FLOW} ADD PRIMARY KEY (ticket_sequence)")


# --- Los abiertos, en pandas -----------------------------------------------

_OPEN_DIMENSIONS = ["grupo_trabajo", "asignado_a", "tipo_solicitud", "zona"]


def _read_open(db: DBConnector) -> pd.DataFrame:
    """Los tickets que los logs dan por abiertos, con las dimensiones del export.

    `LEFT JOIN`: un ticket con logs que ya no esta en el export de tickets
    conserva su recorrido, con las dimensiones en "Sin Especificar".
    """
    dims = ", ".join(f"t.{d}" for d in _OPEN_DIMENSIONS)
    df = db.query(f"""
        SELECT f.ticket_sequence, f.creado, f.completa, f.escalado_el, f.ultimo_log,
               f.etapa_actual, f.equipo_actual, f.tipo_actual,
               {dims}, t.etapa AS etapa_ticket, t.creado_el AS creado_ticket
        FROM {FLOW} f
        LEFT JOIN (
            SELECT DISTINCT ON (ticket_sequence) *
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
            ORDER BY ticket_sequence, id DESC
        ) t USING (ticket_sequence)
        WHERE f.tipo_actual IS DISTINCT FROM %s
    """, params=[KIND_CLOSE])
    for col in ("creado", "escalado_el", "ultimo_log", "creado_ticket"):
        df[col] = pd.to_datetime(df[col], errors="coerce")
    df["completa"] = df["completa"].fillna(False).astype(bool)
    for col in _OPEN_DIMENSIONS:
        df[col] = df[col].fillna(UNSPECIFIED)
    df["escalado"] = df["escalado_el"].notna()
    return df


def _hours(start: pd.Series, end: pd.Series) -> pd.Series:
    return (end - start).dt.total_seconds() / 3600.0


def _r(value, decimals: int = 2):
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else round(v, decimals)


def _pct(part, total) -> float:
    return round(float(part) / float(total) * 100, 2) if total else 0.0


# --- La pieza del analisis -------------------------------------------------

def run_flow_analysis(db: DBConnector | None = None) -> dict:
    """Rehace `support_ticket_flujo` desde los logs de etapa.

    Lo llama `run_support_analysis` antes de calcular las cohortes, que leen de
    aqui el escalamiento de cada ticket. Sin logs cargados no hace nada: el
    resto de soporte funciona sin ellos.
    """
    db = db or DBConnector()
    stages = stage_classification()

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            ensure(cur, TICKET_LOGS)
            cur.execute(f"SELECT COUNT(*) FROM {LOGS}")
            if not cur.fetchone()[0]:
                conn.commit()
                print("ℹ️ Sin logs de etapa cargados: los escalados quedan en Soporte, como dice el export.")
                return {"status": "empty"}

            print("🔀 Reconstruyendo el recorrido de los tickets desde sus logs...")
            _build_segments(cur, stages)
            _persist_flow(cur)
            cur.execute(f"SELECT COUNT(*), COUNT(escalado_el) FROM {FLOW}")
            tickets, escalated = cur.fetchone()
        # El resumen por ticket se confirma junto con los temporales que lo
        # alimentan: un fallo no deja `support_ticket_flujo` a medias.
        conn.commit()

    print(f"   · {tickets} tickets con logs, {escalated} escalados de ATC a Soporte")
    unclassified = stages_to_classify(db, stages)
    if unclassified:
        print(f"⚠️ {len(unclassified)} etapa(s) sin clasificar en el catálogo: "
              + ", ".join(e["etapa"] for e in unclassified[:10]))
    return {"status": "ok", "tickets": int(tickets), "escalados": int(escalated)}


# --- Lectura ---------------------------------------------------------------

def stages_to_classify(db: DBConnector | None = None, stages: dict | None = None) -> list[dict]:
    """Etapas que aparecen en los logs y no estan en el catalogo (ni son de cierre)."""
    db = db or DBConnector()
    stages = stage_classification() if stages is None else stages
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            if not _exists(cur, LOGS):
                return []
            cur.execute(f"""
                SELECT btrim(etapa_nueva) AS etapa, COUNT(*) AS logs, COUNT(DISTINCT ticket_sequence) AS tickets,
                       MAX(creado_el) AS ultimo
                FROM {LOGS}
                WHERE NULLIF(btrim(etapa_nueva), '') IS NOT NULL
                GROUP BY 1
            """)
            rows = cur.fetchall()
    known = set(stages) | set(CLOSES)
    return sorted(
        (
            {"etapa": stage, "logs": int(n), "tickets": int(t), "ultimo": last.strftime("%Y-%m-%d") if last else None}
            for stage, n, t, last in rows
            if stage.lower() not in known
        ),
        key=lambda f: -f["logs"],
    )


def stage_usage(db: DBConnector | None = None) -> dict[str, int]:
    """Cuantos logs entran en cada etapa: lo que el catalogo ensena junto a cada fila."""
    db = db or DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            if not _exists(cur, LOGS):
                return {}
            cur.execute(f"""
                SELECT lower(btrim(etapa_nueva)), COUNT(*) FROM {LOGS}
                WHERE NULLIF(btrim(etapa_nueva), '') IS NOT NULL GROUP BY 1
            """)
            return {stage: int(n) for stage, n in cur.fetchall()}


def get_open_tickets(list_limit: int = 300) -> dict | None:
    """Los tickets abiertos hoy: cuanto llevan abiertos y cuanto en su etapa actual.

    Se lee del recorrido del ultimo analisis y el reloj corre hasta ahora (hora
    de Caracas). Un ticket que los logs dan por abierto y el export de tickets
    ya da por cerrado no se cuenta: le faltan sus ultimos logs, y se dice cuantos.
    """
    db = DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            if not _exists(cur, FLOW):
                return None
            cur.execute(f"SELECT MAX(creado_el) FROM {LOGS}")
            logs_until = cur.fetchone()[0]

    now = now_caracas()
    open_count = _read_open(db)
    ticket_stage = open_count["etapa_ticket"].fillna("").str.strip().str.lower()
    closed_in_tickets = ticket_stage.isin(CLOSES)
    lagging = int(closed_in_tickets.sum())
    open_count = open_count[~closed_in_tickets]

    # Sin secuencia completa no hay log de creacion: la del export de tickets.
    open_count["desde"] = open_count["creado"].where(open_count["completa"], open_count["creado_ticket"])
    open_count["desde"] = open_count["desde"].fillna(open_count["creado"])
    open_count["edad_h"] = _hours(open_count["desde"], pd.Series(now, index=open_count.index)).clip(lower=0)
    open_count["en_etapa_h"] = _hours(open_count["ultimo_log"], pd.Series(now, index=open_count.index)).clip(lower=0)
    open_count["en_soporte_h"] = _hours(open_count["escalado_el"], pd.Series(now, index=open_count.index))

    def group(columns: list[str]) -> list[dict]:
        rows = []
        for key, sub in open_count.groupby(columns, sort=False, dropna=False):
            key = key if isinstance(key, tuple) else (key,)
            rows.append({
                **{c: (UNSPECIFIED if pd.isna(v) else str(v)) for c, v in zip(columns, key)},
                "abiertos": len(sub),
                "edad_media": _r(sub["edad_h"].mean()),
                "edad_mediana": _r(sub["edad_h"].median()),
                "edad_max": _r(sub["edad_h"].max()),
                "en_etapa_media": _r(sub["en_etapa_h"].mean()),
                "en_etapa_mediana": _r(sub["en_etapa_h"].median()),
                "escalados": int(sub["escalado"].sum()),
            })
        return sorted(rows, key=lambda f: -f["abiertos"])

    total = len(open_count)
    age = []
    for label, from_h, until_h in TENURE_TIERS:
        mask = open_count["edad_h"].ge(from_h)
        if until_h is not None:
            mask &= open_count["edad_h"].lt(until_h)
        n = int(mask.sum())
        age.append({"tramo": label, "abiertos": n, "pct": _pct(n, total)})

    entries = open_count.sort_values("edad_h", ascending=False).head(list_limit)
    return {
        "ahora": now.isoformat(),
        "logs_hasta": logs_until.isoformat() if logs_until else None,
        "resumen": {
            "abiertos": total,
            "escalados": int(open_count["escalado"].sum()),
            "en_atc": int(open_count["equipo_actual"].eq(TEAM_ATC).sum()),
            "en_soporte": int(open_count["equipo_actual"].eq(TEAM_SUPPORT).sum()),
            "edad": stats(open_count["edad_h"]),
            "en_etapa": stats(open_count["en_etapa_h"]),
            "en_soporte_desde_escalamiento": stats(open_count["en_soporte_h"]),
            "desfasados": lagging,
        },
        "antiguedad": age,
        "por_etapa": group(["etapa_actual", "equipo_actual", "tipo_actual"]),
        "por_grupo": group(["grupo_trabajo"]),
        "por_asignado": group(["asignado_a"]),
        "por_tipo_solicitud": group(["tipo_solicitud"]),
        "por_zona": group(["zona"]),
        "lista": [
            {
                "ticket": r.ticket_sequence,
                "etapa": r.etapa_actual or UNSPECIFIED,
                "equipo": r.equipo_actual,
                "tipo": r.tipo_actual,
                "grupo_trabajo": r.grupo_trabajo,
                "asignado_a": r.asignado_a,
                "tipo_solicitud": r.tipo_solicitud,
                "zona": r.zona,
                "creado": r.desde.isoformat() if pd.notna(r.desde) else None,
                "escalado": bool(r.escalado),
                "edad_h": _r(r.edad_h),
                "en_etapa_h": _r(r.en_etapa_h),
            }
            for r in entries.itertuples()
        ],
        "lista_limite": list_limit,
    }

