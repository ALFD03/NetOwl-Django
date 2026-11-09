"""El recorrido de cada ticket entre ATC y Soporte, reconstruido desde sus logs.

Los tickets dicen como acabaron; los logs, por donde pasaron. De los logs sale
`support_ticket_flujo`, una fila por ticket con lo que el export de tickets no
puede dar:

* **el escalamiento** (`escalado_el`): el paso a `Nuevo - Soporte Técnico` desde
  una etapa que no es de Soporte. Como mucho uno por ticket, sin vuelta atras.
  Un ticket que nace en Soporte (etapa anterior vacia) no esta escalado. Con
  esa fecha `escalamiento.py` reparte cada escalado entre las cohortes de ATC y
  de Soporte, que es donde se miden volumenes, tasas y tiempos.
* **el tiempo de cada equipo**: cada tramo entre dos logs es del equipo de su
  etapa segun el catalogo (`EtapaSoporte`); los de una etapa compartida o sin
  clasificar son de ATC antes del escalamiento y de Soporte despues. Y dentro de
  cada equipo, cola (nadie lo ha tomado), pausa (espera algo de fuera) y
  gestion: «en que se va el tiempo».
* **cuando cada equipo lo tomo**: la salida de su primera cola, que es la
  asignacion de Soporte de un escalado (la del export es la de ATC).
* **los abiertos de hoy**, con su etapa actual (`get_tickets_abiertos`).

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
from services.support.analytics.config import (
    CANCELED_STAGES,
    EQUIPO_ATC,
    EQUIPO_SOPORTE,
    ETAPA_ESCALAMIENTO,
    RESOLVED_STAGES,
    TIPO_CIERRE,
    TIPO_COLA,
    TIPO_GESTION,
    TIPO_PAUSA,
    TIPO_SIN_CLASIFICAR,
    TRAMOS_ANTIGUEDAD,
    ZONA_HORARIA,
)
from services.support.analytics.logs import ensure_logs_schema
from services.support.analytics.metrics import _compute_stats_for_series as estadisticos

logger = logging.getLogger(__name__)

LOGS = f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}"
FLUJO = f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_FLUJO}"

CIERRES = sorted(RESOLVED_STAGES | CANCELED_STAGES)
EQUIPOS = (EQUIPO_ATC, EQUIPO_SOPORTE)
TIPOS = (TIPO_COLA, TIPO_PAUSA, TIPO_GESTION, TIPO_SIN_CLASIFICAR)

SIN_ESPECIFICAR = "Sin Especificar"


def ahora_caracas() -> pd.Timestamp:
    """La hora de Caracas sin zona, como se guardan las fechas de Odoo."""
    return pd.Timestamp(datetime.now(ZoneInfo(ZONA_HORARIA)).replace(tzinfo=None))


def clasificacion_etapas() -> dict[str, tuple[str, str]]:
    """`nombre en minusculas -> (equipo, tipo)`, del catalogo de etapas."""
    # Import diferido: el paquete de analitica tambien se importa sin las apps
    # de Django cargadas (comandos, el worker antes de `setup`).
    from services.support.models import EtapaSoporte

    return {
        nombre.strip().lower(): (equipo, tipo)
        for nombre, equipo, tipo in EtapaSoporte.objects.values_list("nombre", "equipo", "tipo")
    }


def _existe(cur, tabla: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", [tabla])
    return cur.fetchone()[0] is not None


# --- Los tramos y el resumen por ticket (SQL) ------------------------------

def _crear_tramos(cur, etapas: dict[str, tuple[str, str]]) -> None:
    """`_tramos`: una fila por log, con el tramo que abre, su equipo y su tipo.

    El tramo de un log va de su fecha a la del siguiente log del ticket (`fin`
    nulo en el ultimo: es la etapa en la que esta hoy). Temporal y con
    `ON COMMIT DROP`: vive lo que dura el analisis.
    """
    cur.execute("""
        CREATE TEMP TABLE _etapas (clave TEXT PRIMARY KEY, equipo TEXT NOT NULL, tipo TEXT NOT NULL)
        ON COMMIT DROP;
    """)
    filas = [(clave, equipo, tipo) for clave, (equipo, tipo) in etapas.items() if clave not in CIERRES]
    if filas:
        execute_values(cur, "INSERT INTO _etapas (clave, equipo, tipo) VALUES %s ON CONFLICT DO NOTHING", filas)

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
        "escalamiento": ETAPA_ESCALAMIENTO,
        "atc": EQUIPO_ATC,
        "soporte": EQUIPO_SOPORTE,
        "cierres": CIERRES,
        "cierre": TIPO_CIERRE,
        "sin_clasificar": TIPO_SIN_CLASIFICAR,
    })
    cur.execute("CREATE INDEX ON _tramos (inicio)")
    cur.execute("CREATE INDEX ON _tramos (fin)")
    cur.execute("ANALYZE _tramos")


def _persistir_flujo(cur) -> None:
    """`support_ticket_flujo`: una fila por ticket, rehecha entera."""
    horas = ",\n".join(
        f"SUM(horas) FILTER (WHERE equipo = '{e}' AND tipo = '{t}') AS h_{e}_{t}"
        for e in EQUIPOS for t in TIPOS
    )
    cur.execute(f"DROP TABLE IF EXISTS {FLUJO}")
    cur.execute(f"""
        CREATE TABLE {FLUJO} AS
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
            MIN(inicio) FILTER (WHERE tipo = '{TIPO_CIERRE}') AS primer_cierre,
            COUNT(*) FILTER (WHERE es_reapertura) AS reaperturas,
            BOOL_OR(es_transferencia) AS transferencia_sin_escalar,
            MIN(inicio) FILTER (WHERE equipo = '{EQUIPO_ATC}' AND tipo = '{TIPO_COLA}') AS entra_cola_atc,
            MIN(fin) FILTER (WHERE equipo = '{EQUIPO_ATC}' AND tipo = '{TIPO_COLA}') AS sale_cola_atc,
            MIN(inicio) FILTER (WHERE equipo = '{EQUIPO_SOPORTE}' AND tipo = '{TIPO_COLA}') AS entra_cola_soporte,
            MIN(fin) FILTER (WHERE equipo = '{EQUIPO_SOPORTE}' AND tipo = '{TIPO_COLA}') AS sale_cola_soporte,
            {horas}
        FROM _tramos
        GROUP BY ticket_sequence
    """)
    cur.execute(f"ALTER TABLE {FLUJO} ADD PRIMARY KEY (ticket_sequence)")


# --- Los abiertos, en pandas -----------------------------------------------

_DIMENSIONES_ABIERTOS = ["grupo_trabajo", "asignado_a", "tipo_solicitud", "zona"]


def _leer_abiertos(db: DBConnector) -> pd.DataFrame:
    """Los tickets que los logs dan por abiertos, con las dimensiones del export.

    `LEFT JOIN`: un ticket con logs que ya no esta en el export de tickets
    conserva su recorrido, con las dimensiones en "Sin Especificar".
    """
    dims = ", ".join(f"t.{d}" for d in _DIMENSIONES_ABIERTOS)
    df = db.query(f"""
        SELECT f.ticket_sequence, f.creado, f.completa, f.escalado_el, f.ultimo_log,
               f.etapa_actual, f.equipo_actual, f.tipo_actual,
               {dims}, t.etapa AS etapa_ticket, t.creado_el AS creado_ticket
        FROM {FLUJO} f
        LEFT JOIN (
            SELECT DISTINCT ON (ticket_sequence) *
            FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}
            ORDER BY ticket_sequence, id DESC
        ) t USING (ticket_sequence)
        WHERE f.tipo_actual IS DISTINCT FROM %s
    """, params=[TIPO_CIERRE])
    for col in ("creado", "escalado_el", "ultimo_log", "creado_ticket"):
        df[col] = pd.to_datetime(df[col], errors="coerce")
    df["completa"] = df["completa"].fillna(False).astype(bool)
    for col in _DIMENSIONES_ABIERTOS:
        df[col] = df[col].fillna(SIN_ESPECIFICAR)
    df["escalado"] = df["escalado_el"].notna()
    return df


def _horas(inicio: pd.Series, fin: pd.Series) -> pd.Series:
    return (fin - inicio).dt.total_seconds() / 3600.0


def _r(valor, decimales: int = 2):
    if valor is None:
        return None
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else round(v, decimales)


def _pct(parte, total) -> float:
    return round(float(parte) / float(total) * 100, 2) if total else 0.0


# --- La pieza del analisis -------------------------------------------------

def run_flujo_analysis(db: DBConnector | None = None) -> dict:
    """Rehace `support_ticket_flujo` desde los logs de etapa.

    Lo llama `run_support_analysis` antes de calcular las cohortes, que leen de
    aqui el escalamiento de cada ticket. Sin logs cargados no hace nada: el
    resto de soporte funciona sin ellos.
    """
    db = db or DBConnector()
    etapas = clasificacion_etapas()

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            ensure_logs_schema(cur)
            cur.execute(f"SELECT COUNT(*) FROM {LOGS}")
            if not cur.fetchone()[0]:
                conn.commit()
                print("ℹ️ Sin logs de etapa cargados: los escalados quedan en Soporte, como dice el export.")
                return {"status": "empty"}

            print("🔀 Reconstruyendo el recorrido de los tickets desde sus logs...")
            _crear_tramos(cur, etapas)
            _persistir_flujo(cur)
            cur.execute(f"SELECT COUNT(*), COUNT(escalado_el) FROM {FLUJO}")
            tickets, escalados = cur.fetchone()
        # El resumen por ticket se confirma junto con los temporales que lo
        # alimentan: un fallo no deja `support_ticket_flujo` a medias.
        conn.commit()

    print(f"   · {tickets} tickets con logs, {escalados} escalados de ATC a Soporte")
    sin_clasificar = etapas_por_clasificar(db, etapas)
    if sin_clasificar:
        print(f"⚠️ {len(sin_clasificar)} etapa(s) sin clasificar en el catálogo: "
              + ", ".join(e["etapa"] for e in sin_clasificar[:10]))
    return {"status": "ok", "tickets": int(tickets), "escalados": int(escalados)}


# --- Lectura ---------------------------------------------------------------

def etapas_por_clasificar(db: DBConnector | None = None, etapas: dict | None = None) -> list[dict]:
    """Etapas que aparecen en los logs y no estan en el catalogo (ni son de cierre)."""
    db = db or DBConnector()
    etapas = clasificacion_etapas() if etapas is None else etapas
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            if not _existe(cur, LOGS):
                return []
            cur.execute(f"""
                SELECT btrim(etapa_nueva) AS etapa, COUNT(*) AS logs, COUNT(DISTINCT ticket_sequence) AS tickets,
                       MAX(creado_el) AS ultimo
                FROM {LOGS}
                WHERE NULLIF(btrim(etapa_nueva), '') IS NOT NULL
                GROUP BY 1
            """)
            filas = cur.fetchall()
    conocidas = set(etapas) | set(CIERRES)
    return sorted(
        (
            {"etapa": etapa, "logs": int(n), "tickets": int(t), "ultimo": ultimo.strftime("%Y-%m-%d") if ultimo else None}
            for etapa, n, t, ultimo in filas
            if etapa.lower() not in conocidas
        ),
        key=lambda f: -f["logs"],
    )


def uso_de_etapas(db: DBConnector | None = None) -> dict[str, int]:
    """Cuantos logs entran en cada etapa: lo que el catalogo ensena junto a cada fila."""
    db = db or DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            if not _existe(cur, LOGS):
                return {}
            cur.execute(f"""
                SELECT lower(btrim(etapa_nueva)), COUNT(*) FROM {LOGS}
                WHERE NULLIF(btrim(etapa_nueva), '') IS NOT NULL GROUP BY 1
            """)
            return {etapa: int(n) for etapa, n in cur.fetchall()}


def get_tickets_abiertos(limite_lista: int = 300) -> dict | None:
    """Los tickets abiertos hoy: cuanto llevan abiertos y cuanto en su etapa actual.

    Se lee del recorrido del ultimo analisis y el reloj corre hasta ahora (hora
    de Caracas). Un ticket que los logs dan por abierto y el export de tickets
    ya da por cerrado no se cuenta: le faltan sus ultimos logs, y se dice cuantos.
    """
    db = DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            if not _existe(cur, FLUJO):
                return None
            cur.execute(f"SELECT MAX(creado_el) FROM {LOGS}")
            logs_hasta = cur.fetchone()[0]

    ahora = ahora_caracas()
    abiertos = _leer_abiertos(db)
    etapa_ticket = abiertos["etapa_ticket"].fillna("").str.strip().str.lower()
    cerrados_en_tickets = etapa_ticket.isin(CIERRES)
    desfasados = int(cerrados_en_tickets.sum())
    abiertos = abiertos[~cerrados_en_tickets]

    # Sin secuencia completa no hay log de creacion: la del export de tickets.
    abiertos["desde"] = abiertos["creado"].where(abiertos["completa"], abiertos["creado_ticket"])
    abiertos["desde"] = abiertos["desde"].fillna(abiertos["creado"])
    abiertos["edad_h"] = _horas(abiertos["desde"], pd.Series(ahora, index=abiertos.index)).clip(lower=0)
    abiertos["en_etapa_h"] = _horas(abiertos["ultimo_log"], pd.Series(ahora, index=abiertos.index)).clip(lower=0)
    abiertos["en_soporte_h"] = _horas(abiertos["escalado_el"], pd.Series(ahora, index=abiertos.index))

    def agrupar(columnas: list[str]) -> list[dict]:
        filas = []
        for clave, sub in abiertos.groupby(columnas, sort=False, dropna=False):
            clave = clave if isinstance(clave, tuple) else (clave,)
            filas.append({
                **{c: (SIN_ESPECIFICAR if pd.isna(v) else str(v)) for c, v in zip(columnas, clave)},
                "abiertos": len(sub),
                "edad_media": _r(sub["edad_h"].mean()),
                "edad_mediana": _r(sub["edad_h"].median()),
                "edad_max": _r(sub["edad_h"].max()),
                "en_etapa_media": _r(sub["en_etapa_h"].mean()),
                "en_etapa_mediana": _r(sub["en_etapa_h"].median()),
                "escalados": int(sub["escalado"].sum()),
            })
        return sorted(filas, key=lambda f: -f["abiertos"])

    total = len(abiertos)
    antiguedad = []
    for etiqueta, desde_h, hasta_h in TRAMOS_ANTIGUEDAD:
        mascara = abiertos["edad_h"].ge(desde_h)
        if hasta_h is not None:
            mascara &= abiertos["edad_h"].lt(hasta_h)
        n = int(mascara.sum())
        antiguedad.append({"tramo": etiqueta, "abiertos": n, "pct": _pct(n, total)})

    lista = abiertos.sort_values("edad_h", ascending=False).head(limite_lista)
    return {
        "ahora": ahora.isoformat(),
        "logs_hasta": logs_hasta.isoformat() if logs_hasta else None,
        "resumen": {
            "abiertos": total,
            "escalados": int(abiertos["escalado"].sum()),
            "en_atc": int(abiertos["equipo_actual"].eq(EQUIPO_ATC).sum()),
            "en_soporte": int(abiertos["equipo_actual"].eq(EQUIPO_SOPORTE).sum()),
            "edad": estadisticos(abiertos["edad_h"]),
            "en_etapa": estadisticos(abiertos["en_etapa_h"]),
            "en_soporte_desde_escalamiento": estadisticos(abiertos["en_soporte_h"]),
            "desfasados": desfasados,
        },
        "antiguedad": antiguedad,
        "por_etapa": agrupar(["etapa_actual", "equipo_actual", "tipo_actual"]),
        "por_grupo": agrupar(["grupo_trabajo"]),
        "por_asignado": agrupar(["asignado_a"]),
        "por_tipo_solicitud": agrupar(["tipo_solicitud"]),
        "por_zona": agrupar(["zona"]),
        "lista": [
            {
                "ticket": r.ticket_sequence,
                "etapa": r.etapa_actual or SIN_ESPECIFICAR,
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
            for r in lista.itertuples()
        ],
        "lista_limite": limite_lista,
    }

