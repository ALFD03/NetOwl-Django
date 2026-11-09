"""Importacion de los logs de etapa de los tickets ("Registros de tiempo").

Es la unica importacion que **no reemplaza** su tabla. El historial completo son
millones de filas y Odoo no lo exporta de una vez, asi que se sube por lotes
mensuales -los logs de los tickets creados en el mes y los de los tickets cuya
ultima actualizacion de etapa cae en el mes- y cada lote se **suma** a lo que ya
habia. Un log es inmutable (un cambio de etapa del 14 de abril lo es para
siempre) y su `ID` de Odoo es unico entre todos los tickets, asi que entra una
sola vez: `ON CONFLICT (log_id) DO NOTHING` hace que solapar lotes, o repetir
uno, no duplique nada.

El CSV se lee por bloques y pasa por una tabla temporal: el volumen de un mes
cabe en memoria, pero el del historico que alguien suba de golpe no tiene por
que. Todo va en una transaccion: un fallo a mitad deja la tabla como estaba.
"""

from __future__ import annotations

import io
import logging
import re
import unicodedata

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.config import (
    LOGS_COLUMNS,
    LOGS_CSV_COLUMN_MAP,
    LOGS_PREFIJO,
    LOGS_REQUIRED_COLUMNS,
)

logger = logging.getLogger(__name__)

# Filas por bloque al leer el CSV. Con seis columnas de texto, unos 50 MB de
# DataFrame por bloque.
_FILAS_POR_BLOQUE = 200_000

_VACIOS = ["", "nan", "None", "<NA>", "False", "NaT"]


class LogsInvalidos(ValueError):
    """El CSV no trae las columnas de los logs: el mensaje dice cuales."""


def _normalizar(texto: str) -> str:
    """Sin BOM, sin acentos, sin caja y con los espacios colapsados."""
    base = unicodedata.normalize("NFKD", str(texto).replace("\ufeff", ""))
    base = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", base).strip().lower()


def _clave(cabecera: str) -> str:
    """Clave de comparacion de una cabecera: normalizada y sin el prefijo del modelo."""
    base = _normalizar(cabecera)
    prefijo = _normalizar(LOGS_PREFIJO)
    return base[len(prefijo):].strip() if base.startswith(prefijo) else base


def _resolver_columnas(cabeceras) -> dict[str, str]:
    """Cabecera del CSV -> columna de la tabla. Gana la primera que coincide."""
    por_clave = {_normalizar(k): v for k, v in LOGS_CSV_COLUMN_MAP.items()}
    resuelto: dict[str, str] = {}
    usados: set[str] = set()
    for cabecera in cabeceras:
        destino = por_clave.get(_clave(cabecera))
        if destino and destino not in usados:
            resuelto[cabecera] = destino
            usados.add(destino)
    return resuelto


def campos_odoo_logs() -> list[dict]:
    """Las cabeceras del export de logs, para la tarjeta de requisitos."""
    requeridas = set(LOGS_REQUIRED_COLUMNS)
    return [
        {"nombre": f"{LOGS_PREFIJO}{cabecera}", "requerido": destino in requeridas, "alias": [cabecera]}
        for cabecera, destino in LOGS_CSV_COLUMN_MAP.items()
    ]


def ensure_logs_schema(cur) -> None:
    """La tabla de logs, si falta. Nunca la borra: es la suma de todos los lotes."""
    tabla = f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}"
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {tabla} (
            log_id TEXT PRIMARY KEY,
            ticket_sequence TEXT NOT NULL,
            creado_el TIMESTAMP NOT NULL,
            etapa_anterior TEXT,
            etapa_nueva TEXT,
            duracion_horas NUMERIC,
            importado_en TIMESTAMP DEFAULT NOW()
        );
    """)
    cur.execute(
        f"CREATE INDEX IF NOT EXISTS idx_support_logs_ticket ON {tabla}(ticket_sequence, creado_el);"
    )
    cur.execute(f"CREATE INDEX IF NOT EXISTS idx_support_logs_creado ON {tabla}(creado_el);")


def _normalizar_bloque(df: pd.DataFrame) -> pd.DataFrame:
    """Un bloque del CSV con las columnas de la tabla y los tipos ya resueltos.

    Se descartan las filas sin id, sin ticket o sin fecha: un export hecho desde
    el ticket trae una fila por ticket aunque no tenga logs, y un log sin fecha
    no se puede colocar en la secuencia.
    """
    for col in LOGS_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[LOGS_COLUMNS].copy()

    for col in ("log_id", "ticket_sequence", "etapa_anterior", "etapa_nueva"):
        df[col] = df[col].astype(str).str.strip().replace(_VACIOS, None)
    df["creado_el"] = pd.to_datetime(df["creado_el"], errors="coerce")
    df["duracion_horas"] = pd.to_numeric(df["duracion_horas"], errors="coerce")

    return df.dropna(subset=["log_id", "ticket_sequence", "creado_el"])


def _copiar_a_temporal(cur, df: pd.DataFrame) -> None:
    """COPY del bloque a la tabla temporal (que no lleva esquema)."""
    salida = io.StringIO()
    df.to_csv(salida, sep="\t", header=False, index=False, na_rep="NULL", date_format="%Y-%m-%d %H:%M:%S")
    salida.seek(0)
    cur.copy_expert(
        f"COPY _logs_lote ({', '.join(LOGS_COLUMNS)}) FROM STDIN WITH (FORMAT csv, DELIMITER '\t', NULL 'NULL')",
        salida,
    )


def import_support_logs_csv(csv_path: str) -> dict:
    """Suma un lote de logs a `support_ticket_logs`. Devuelve el resumen del lote.

    `nuevos` son los que no estaban; `repetidos`, los que ya habia cargado otro
    lote (o el mismo, si se sube dos veces). Un lote solo de repetidos no es un
    error: es lo que pasa al reexportar el mes en curso.
    """
    db = DBConnector()
    leidos = descartados = 0

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            ensure_logs_schema(cur)
            cur.execute("""
                CREATE TEMP TABLE _logs_lote (
                    log_id TEXT, ticket_sequence TEXT, creado_el TIMESTAMP,
                    etapa_anterior TEXT, etapa_nueva TEXT, duracion_horas NUMERIC
                ) ON COMMIT DROP;
            """)

            lector = pd.read_csv(
                csv_path, dtype=str, keep_default_na=False, encoding="utf-8-sig",
                chunksize=_FILAS_POR_BLOQUE,
            )
            mapa: dict[str, str] | None = None
            for bloque in lector:
                if mapa is None:
                    cabeceras = [str(c) for c in bloque.columns]
                    mapa = _resolver_columnas(cabeceras)
                    faltan = [
                        f"{LOGS_PREFIJO}{etiqueta}" for col, etiqueta in LOGS_REQUIRED_COLUMNS.items()
                        if col not in mapa.values()
                    ]
                    if faltan:
                        raise LogsInvalidos(
                            f"El CSV de logs no trae la(s) columna(s): {', '.join(faltan)}. "
                            f"Cabeceras encontradas: {', '.join(cabeceras)}."
                        )
                bloque = _normalizar_bloque(bloque.rename(columns=mapa))
                leidos += len(bloque)
                _copiar_a_temporal(cur, bloque)

            if mapa is None:
                raise LogsInvalidos("El archivo de logs está vacío.")

            cur.execute("SELECT COUNT(DISTINCT log_id), COUNT(DISTINCT ticket_sequence), MIN(creado_el), MAX(creado_el) FROM _logs_lote")
            distintos, tickets, desde, hasta = cur.fetchone()
            descartados = leidos - distintos

            # DISTINCT ON: el mismo id repetido dentro del propio archivo (un
            # export desde el ticket puede repetir filas) entra una vez.
            cur.execute(f"""
                INSERT INTO {DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}
                    ({', '.join(LOGS_COLUMNS)})
                SELECT DISTINCT ON (log_id) {', '.join(LOGS_COLUMNS)}
                FROM _logs_lote
                ORDER BY log_id
                ON CONFLICT (log_id) DO NOTHING
            """)
            nuevos = cur.rowcount
        conn.commit()

    return {
        "filas": leidos,
        "nuevos": nuevos,
        "repetidos": distintos - nuevos,
        "duplicados_en_archivo": descartados,
        "tickets": tickets,
        "desde": desde.strftime("%Y-%m-%d") if desde is not None else None,
        "hasta": hasta.strftime("%Y-%m-%d") if hasta is not None else None,
    }


def resumen_logs_cargados() -> dict:
    """Cuantos logs hay y de que fechas: lo que la pantalla de importacion muestra."""
    db = DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT to_regclass(%s)",
                [f"{DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}"],
            )
            if cur.fetchone()[0] is None:
                return {"logs": 0, "tickets": 0, "desde": None, "hasta": None, "por_mes": []}
            cur.execute(f"""
                SELECT COUNT(*), COUNT(DISTINCT ticket_sequence), MIN(creado_el), MAX(creado_el)
                FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}
            """)
            logs, tickets, desde, hasta = cur.fetchone()
            cur.execute(f"""
                SELECT to_char(creado_el, 'YYYY-MM') AS mes, COUNT(*)
                FROM {DB_SCHEMA}.{TableNames.SUPPORT_TICKET_LOGS}
                GROUP BY 1 ORDER BY 1
            """)
            por_mes = [{"mes": mes, "logs": n} for mes, n in cur.fetchall()]
    return {
        "logs": logs,
        "tickets": tickets,
        "desde": desde.strftime("%Y-%m-%d %H:%M") if desde else None,
        "hasta": hasta.strftime("%Y-%m-%d %H:%M") if hasta else None,
        "por_mes": por_mes,
    }
