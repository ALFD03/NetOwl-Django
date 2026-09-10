# backend/support/loader.py

from __future__ import annotations

import logging
import re
import unicodedata

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.config import (
    SUPPORT_CSV_COLUMN_ALIASES,
    SUPPORT_CSV_COLUMN_MAP,
    SUPPORT_LOADER_REQUIRED_COLUMNS,
    SUPPORT_TEXT_COLUMNS,
    SUPPORT_TICKET_COLUMNS,
)

logger = logging.getLogger(__name__)

_DATE_COLUMNS = ["creado_el", "primera_fecha_asignada", "ultima_actualizacion_etapa"]


def _normalize_header(name: str) -> str:
    """Clave de comparación de una cabecera: sin BOM, sin acentos, sin caja."""
    base = unicodedata.normalize("NFKD", str(name).replace("\ufeff", ""))
    base = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", base).strip().lower()


def _resolve_columns(columnas) -> dict[str, str]:
    """
    Mapa cabecera del CSV → columna de la BD, tolerante a cómo la escribe Odoo.

    `rename` con el mapa literal exige coincidencia exacta, y Odoo no la da
    siempre: cambia la caja y los acentos, traduce el género del campo, y al
    exportar un campo relacional le añade el sub-campo detrás de una barra
    ("Asignado a/Nombre para mostrar"). Cada fallo era silencioso —la columna
    quedaba fuera del DataFrame y el relleno de `SUPPORT_TEXT_COLUMNS` la
    dejaba entera en "Sin Especificar"—, así que aquí se compara por clave
    normalizada y sólo después, si nada coincide, se prueba el prefijo.
    """
    por_clave = {_normalize_header(k): v for k, v in SUPPORT_CSV_COLUMN_MAP.items()}
    por_clave.update(SUPPORT_CSV_COLUMN_ALIASES)

    resuelto: dict[str, str] = {}
    destinos: set[str] = set()

    for col in columnas:
        clave = _normalize_header(col)
        destino = por_clave.get(clave)

        # El prefijo se prueba sólo si la cabecera completa no coincidió, para
        # no partir los nombres que ya llevan barra ("Suscripción/Sucursal").
        if destino is None and "/" in clave:
            destino = por_clave.get(clave.rsplit("/", 1)[0].strip())

        # Dos cabeceras pueden resolver al mismo destino (el campo relacional
        # exportado dos veces). Gana la primera: renombrar ambas dejaría dos
        # columnas con el mismo nombre y `df[SUPPORT_TICKET_COLUMNS]` devolvería
        # un DataFrame donde se espera una Serie.
        if destino is not None and destino not in destinos:
            resuelto[col] = destino
            destinos.add(destino)

    return resuelto


def import_support_csv(csv_path: str) -> int:
    """Carga el export de Odoo, reemplazando `support_tickets` y sólo esa tabla."""
    db = DBConnector()
    # utf-8-sig y no utf-8: es lo que ya usa el validador de estructura, y sin
    # él el BOM de Excel se queda pegado a la primera cabecera.
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False, encoding="utf-8-sig")

    cabeceras = [str(c) for c in df.columns]
    df = df.rename(columns=_resolve_columns(cabeceras))

    # Se listan las cabeceras encontradas porque el fallo típico no es que la
    # columna no exista, sino que Odoo la nombró de otra forma: verlas es lo
    # que permite añadir el alias que falte.
    faltantes = [
        etiqueta for col, etiqueta in SUPPORT_LOADER_REQUIRED_COLUMNS.items()
        if col not in df.columns
    ]
    if faltantes:
        raise ValueError(
            f"El archivo CSV no contiene la(s) columna(s): {', '.join(faltantes)}. "
            f"Cabeceras encontradas: {', '.join(cabeceras)}."
        )

    df["ticket_sequence"] = df["ticket_sequence"].astype(str).str.strip()
    df = df[df["ticket_sequence"] != ""].copy()

    for col in _DATE_COLUMNS:
        df[col] = pd.to_datetime(df[col], errors="coerce") if col in df.columns else pd.NaT

    # La duración de Odoo se conserva como NULL cuando no viene: es la fuente de
    # la medida creación → cierre, y un 0 ahí sería un cierre instantáneo falso.
    df["duracion_total_horas"] = (
        pd.to_numeric(df["duracion_total_horas"], errors="coerce")
        if "duracion_total_horas" in df.columns
        else pd.Series([None] * len(df), dtype="float64")
    )

    # Las columnas de texto son claves de agrupación: un vacío tiene que
    # colapsar a un único valor visible, o la misma zona o el mismo técnico se
    # partirían en varias filas del reporte.
    for col in SUPPORT_TEXT_COLUMNS:
        if col in df.columns:
            df[col] = (
                df[col].astype(str).str.strip()
                .replace(["", "nan", "None", "<NA>", "False"], "Sin Especificar")
            )
        else:
            df[col] = "Sin Especificar"

    df = df[SUPPORT_TICKET_COLUMNS]

    reset_support_tickets(db)
    # Las tablas de resultados no se tocan, pero se garantiza que existan: en una
    # instalación nueva la importación es lo primero que corre y el dashboard
    # puede consultarlas antes de que haya un análisis.
    ensure_support_schema(db)
    db.copy_dataframe(df, TableNames.SUPPORT_TICKETS)
    return len(df)


def reset_support_tickets(db: DBConnector) -> None:
    """
    Deja `support_tickets` vacía y con la forma actual, sin tocar lo calculado.

    Sólo los tickets se rehacen desde cero: el CSV de Odoo es un export completo
    y su esquema ha cambiado de forma (ganaron `asignado_a`, perdieron
    `municipio`), así que DROP + CREATE es más barato que migrar. Las tablas de
    resultados —cierre, dimensiones y métricas globales— NO se tocan aquí:
    guardan los periodos ya evaluados y `run_support_analysis` las reescribe
    periodo a periodo. Borrarlas en cada importación vaciaba el histórico
    completo aunque después sólo se recalculara un mes.
    """
    statements = [
        f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS};",
        f"""
        CREATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS} (
            id BIGSERIAL PRIMARY KEY,
            ticket_sequence TEXT NOT NULL,
            cliente TEXT,
            etapa TEXT,
            grupo_trabajo TEXT,
            asignado_a TEXT,
            sucursal TEXT,
            zona TEXT,
            tipo_solicitud TEXT,
            razon_falla TEXT,
            solucion_falla TEXT,
            creado_el TIMESTAMP,
            primera_fecha_asignada TIMESTAMP,
            ultima_actualizacion_etapa TIMESTAMP,
            duracion_total_horas NUMERIC
        );
        """,
        f"CREATE INDEX idx_support_tickets_creado ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(creado_el);",
        f"CREATE INDEX idx_support_tickets_cierre ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(ultima_actualizacion_etapa);",
    ]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()


def ensure_support_schema(db: DBConnector) -> None:
    """
    Crea las tablas de resultados si faltan, sin borrar las que ya existen.

    Es idempotente a propósito: se llama antes de cada análisis para que una
    instalación nueva funcione, y en una con datos no debe perder nada.
    """
    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            periodo_reporte VARCHAR(7) NOT NULL,
            metricas JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (periodo_reporte)
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            periodo_reporte VARCHAR(7) NOT NULL,
            grupo_trabajo TEXT NOT NULL,
            dimension TEXT NOT NULL,
            valor TEXT NOT NULL,
            metricas JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            resumen_global JSONB,
            por_grupo_trabajo JSONB,
            periodos_evaluados INT DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"CREATE INDEX IF NOT EXISTS idx_support_dim_lookup ON "
        f"{DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}(periodo_reporte, dimension);",
    ]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()
