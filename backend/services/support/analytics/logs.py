"""Importación de los logs de etapa de los tickets ("Registros de tiempo").

Es la única importación que **no reemplaza** su tabla. El historial completo
son millones de filas y Odoo no lo exporta de una vez, así que se sube por
lotes mensuales y cada lote se **suma** a lo que ya había. Un log es inmutable
y su `ID` de Odoo es único entre todos los tickets, así que entra una sola vez:
solapar lotes, o repetir uno, no duplica nada.

El CSV se lee por bloques y pasa por una tabla temporal; todo va en una
transacción: un fallo a mitad deja la tabla como estaba.
"""

from __future__ import annotations

from psycopg2 import sql

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.exports import ExportSpec, iter_export
from core.tables import FLOAT, TIMESTAMP, Table, coerce, copy, ensure

from .tables import TICKET_LOGS

LOGS_EXPORT = ExportSpec(
    label="logs de soporte",
    columns={
        "ID": "log_id",
        "Ticket/Secuencia ID del ticket": "ticket_sequence",
        "Creado el": "creado_el",
        "Etapa anterior": "etapa_anterior",
        "Nueva etapa": "etapa_nueva",
        "Duración (horas)": "duracion_horas",
    },
    required=("ID", "Ticket/Secuencia ID del ticket", "Creado el", "Etapa anterior", "Nueva etapa"),
    prefix="Registros de tiempo/",
    types={"creado_el": TIMESTAMP, "duracion_horas": FLOAT},
    blanks=("false",),
)
_COLUMNS = list(LOGS_EXPORT.columns.values())

# Filas por bloque al leer el CSV: unos 50 MB de DataFrame.
_CHUNK_ROWS = 200_000

# La tabla temporal del lote: sin esquema, vive lo que dura la transacción.
_BATCH = Table("_logs_lote", {c: TICKET_LOGS.columns[c] for c in _COLUMNS}, schema="pg_temp")


def import_ticket_logs(csv_path: str) -> dict:
    """Suma un lote de logs a `support_ticket_logs`. Devuelve el resumen del lote.

    `nuevos` son los que no estaban; `repetidos`, los que ya había cargado otro
    lote (o el mismo, si se sube dos veces). Un lote solo de repetidos no es un
    error: es lo que pasa al reexportar el mes en curso.
    """
    read = 0
    with DBConnector().transaction() as cur:
        ensure(cur, TICKET_LOGS)
        cols = sql.SQL(", ").join(map(sql.Identifier, _COLUMNS))
        cur.execute(
            sql.SQL("CREATE TEMP TABLE _logs_lote ON COMMIT DROP AS SELECT {} FROM {} LIMIT 0").format(
                cols, TICKET_LOGS.ident,
            )
        )
        for chunk in iter_export(csv_path, LOGS_EXPORT, chunksize=_CHUNK_ROWS):
            # Un export hecho desde el ticket trae una fila por ticket aunque no
            # tenga logs, y un log sin fecha no se puede colocar en la secuencia.
            chunk = chunk.reindex(columns=_COLUMNS).dropna(subset=["log_id", "ticket_sequence", "creado_el"])
            read += copy(cur, coerce(chunk, _BATCH), _BATCH)

        cur.execute(
            "SELECT COUNT(DISTINCT log_id), COUNT(DISTINCT ticket_sequence), MIN(creado_el), MAX(creado_el)"
            " FROM _logs_lote"
        )
        distinct, tickets, since, until = cur.fetchone()
        # DISTINCT ON: el mismo id repetido dentro del propio archivo entra una vez.
        cur.execute(
            sql.SQL(
                "INSERT INTO {} ({cols}) SELECT DISTINCT ON (log_id) {cols} FROM _logs_lote ORDER BY log_id"
                " ON CONFLICT (log_id) DO NOTHING"
            ).format(TICKET_LOGS.ident, cols=cols)
        )
        new = cur.rowcount

    return {
        "filas": read,
        "nuevos": new,
        "repetidos": distinct - new,
        "duplicados_en_archivo": read - distinct,
        "tickets": tickets,
        "desde": since.strftime("%Y-%m-%d") if since is not None else None,
        "hasta": until.strftime("%Y-%m-%d") if until is not None else None,
    }


def loaded_logs_summary() -> dict:
    """Cuántos logs hay y de qué fechas: lo que muestra la pantalla de importación."""
    db = DBConnector()
    if not db.table_exists(TableNames.SUPPORT_TICKET_LOGS):
        return {"logs": 0, "tickets": 0, "desde": None, "hasta": None, "por_mes": []}
    table = f'"{DB_SCHEMA}"."{TableNames.SUPPORT_TICKET_LOGS}"'
    with db.get_connection() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*), COUNT(DISTINCT ticket_sequence), MIN(creado_el), MAX(creado_el) FROM {table}")
        logs, tickets, since, until = cur.fetchone()
        cur.execute(f"SELECT to_char(creado_el, 'YYYY-MM') AS mes, COUNT(*) FROM {table} GROUP BY 1 ORDER BY 1")
        by_month = [{"mes": month, "logs": n} for month, n in cur.fetchall()]
    return {
        "logs": logs,
        "tickets": tickets,
        "desde": since.strftime("%Y-%m-%d %H:%M") if since else None,
        "hasta": until.strftime("%Y-%m-%d %H:%M") if until else None,
        "por_mes": by_month,
    }


def odoo_fields() -> list[dict]:
    """Las cabeceras del export de logs, para la tarjeta de requisitos."""
    return LOGS_EXPORT.fields()
