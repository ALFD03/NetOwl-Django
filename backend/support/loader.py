# backend/support/loader.py
from __future__ import annotations
import pandas as pd
import numpy as np
import logging
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import SUPPORT_CSV_COLUMN_MAP

logger = logging.getLogger(__name__)

def import_support_csv(csv_path: str) -> int:
    """Importa el CSV exportado de Odoo Support a la base de datos PostgreSQL."""
    db = DBConnector()
    
    # Leer CSV asegurando lectura correcta de texto
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False, encoding="utf-8")
    
    # Normalización de cabeceras
    df = df.rename(columns=SUPPORT_CSV_COLUMN_MAP)
    
    if "ticket_sequence" not in df.columns:
        raise ValueError("El archivo CSV no contiene la columna 'Secuencia de Ticket'.")
        
    df["ticket_sequence"] = df["ticket_sequence"].astype(str).str.strip()
    df = df[df["ticket_sequence"] != ""].copy()
    
    # Formateo de fechas y números
    df["creado_el"] = pd.to_datetime(df["creado_el"], errors="coerce")
    df["ultima_actualizacion_etapa"] = pd.to_datetime(df["ultima_actualizacion_etapa"], errors="coerce")
    df["duracion_total_horas"] = pd.to_numeric(df["duracion_total_horas"], errors="coerce").fillna(0.0)
    
    # Limpieza de textos y valores nulos
    text_cols = [
        "cliente", "etapa", "grupo_trabajo", "sucursal",
        "zona", "municipio", "tipo_solicitud", "razon_falla", "solucion_falla"
    ]
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace(["", "nan", "None", "<NA>"], "Sin Especificar")
        else:
            df[col] = "Sin Especificar"

    # Seleccionar sólo columnas conocidas
    cols_to_keep = [
        "ticket_sequence", "cliente", "etapa", "grupo_trabajo", "sucursal",
        "zona", "municipio", "tipo_solicitud", "razon_falla", "solucion_falla",
        "creado_el", "ultima_actualizacion_etapa", "duracion_total_horas"
    ]
    df = df[cols_to_keep]

    # Recrear tablas si no existen y truncar
    _create_support_tables_if_not_exist(db)
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}")
        conn.commit()
        
    # Inserción rápida mediante COPY
    db.copy_dataframe(df, TableNames.SUPPORT_TICKETS)
    return len(df)


def _create_support_tables_if_not_exist(db: DBConnector):
    """Crea la estructura de tablas para el módulo Technical Support si no existen."""
    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS} (
            id BIGSERIAL PRIMARY KEY,
            ticket_sequence TEXT NOT NULL,
            cliente TEXT,
            etapa TEXT,
            grupo_trabajo TEXT,
            sucursal TEXT,
            zona TEXT,
            municipio TEXT,
            tipo_solicitud TEXT,
            razon_falla TEXT,
            solucion_falla TEXT,
            creado_el TIMESTAMP,
            ultima_actualizacion_etapa TIMESTAMP,
            duracion_total_horas NUMERIC DEFAULT 0
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_METRICAS_GLOBALES} (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            resumen_global JSONB,
            por_grupo_trabajo JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            dimension TEXT NOT NULL,
            valor TEXT NOT NULL,
            grupo_trabajo TEXT,
            metricas JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"CREATE INDEX IF NOT EXISTS idx_support_tickets_grupo ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(grupo_trabajo);",
        f"CREATE INDEX IF NOT EXISTS idx_support_tickets_sucursal ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(sucursal);",
        f"CREATE INDEX IF NOT EXISTS idx_support_tickets_zona ON {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}(zona);",
    ]
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()