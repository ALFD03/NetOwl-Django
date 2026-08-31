# backend/support/loader.py

from __future__ import annotations

import logging

import pandas as pd

from backend.conf_config import DB_SCHEMA, TableNames
from backend.database import DBConnector
from backend.support.config import (
    SUPPORT_CSV_COLUMN_MAP,
    SUPPORT_TEXT_COLUMNS,
    SUPPORT_TICKET_COLUMNS,
)

logger = logging.getLogger(__name__)

_DATE_COLUMNS = ["creado_el", "primera_fecha_asignada", "ultima_actualizacion_etapa"]


def import_support_csv(csv_path: str) -> int:
    """Carga el export de Odoo, reemplazando por completo `support_tickets`."""
    db = DBConnector()
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False, encoding="utf-8")
    df = df.rename(columns=SUPPORT_CSV_COLUMN_MAP)

    if "ticket_sequence" not in df.columns:
        raise ValueError("El archivo CSV no contiene la columna 'Secuencia ID del ticket'.")

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

    recreate_support_schema(db)
    db.copy_dataframe(df, TableNames.SUPPORT_TICKETS)
    return len(df)


def recreate_support_schema(db: DBConnector) -> None:
    """
    Rehace el esquema de soporte desde cero.

    Se hace DROP en lugar de ALTER porque el módulo cambió de forma: los tickets
    ganaron `asignado_a` y perdieron `municipio`, y las tablas de resultados
    pasaron de decenas de columnas escalares a un JSONB por periodo. Migrar
    entre esas dos formas no tiene sentido — los datos hay que recalcularlos de
    todos modos, y `import_support_csv` los repuebla enteros.
    """
    statements = [
        f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS};",
        f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO};",
        f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO};",
        f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES};",
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
        f"""
        CREATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            periodo_reporte VARCHAR(7) NOT NULL,
            metricas JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE (periodo_reporte)
        );
        """,
        f"""
        CREATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} (
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
        CREATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            resumen_global JSONB,
            por_grupo_trabajo JSONB,
            periodos_evaluados INT DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"CREATE INDEX idx_support_tickets_creado ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(creado_el);",
        f"CREATE INDEX idx_support_tickets_cierre ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(ultima_actualizacion_etapa);",
        f"CREATE INDEX idx_support_dim_lookup ON {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}(periodo_reporte, dimension);",
    ]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()
