from __future__ import annotations
import pandas as pd
import numpy as np
import logging
from backend.database import DBConnector
from backend.conf_config import DB_SCHEMA, TableNames
from backend.support.config import SUPPORT_CSV_COLUMN_MAP

logger = logging.getLogger(__name__)

def import_support_csv(csv_path: str) -> int:
    db = DBConnector()
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False, encoding="utf-8")
    
    df = df.rename(columns=SUPPORT_CSV_COLUMN_MAP)
    
    if "ticket_sequence" not in df.columns:
        raise ValueError("El archivo CSV no contiene la columna 'Secuencia de Ticket'.")
        
    df["ticket_sequence"] = df["ticket_sequence"].astype(str).str.strip()
    df = df[df["ticket_sequence"] != ""].copy()
    
    if "creado_el" in df.columns:
        df["creado_el"] = pd.to_datetime(df["creado_el"], errors="coerce")
    else:
        df["creado_el"] = pd.NaT

    if "ultima_actualizacion_etapa" in df.columns:
        df["ultima_actualizacion_etapa"] = pd.to_datetime(df["ultima_actualizacion_etapa"], errors="coerce")
    else:
        df["ultima_actualizacion_etapa"] = df["creado_el"]

    if "duracion_total_horas" in df.columns:
        df["duracion_total_horas"] = pd.to_numeric(df["duracion_total_horas"], errors="coerce").fillna(0.0)
    else:
        df["duracion_total_horas"] = 0.0
    
    text_cols = [
        "cliente", "etapa", "grupo_trabajo", "sucursal",
        "zona", "municipio", "tipo_solicitud", "razon_falla", "solucion_falla"
    ]
    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip().replace(["", "nan", "None", "<NA>"], "Sin Especificar")
        else:
            df[col] = "Sin Especificar"

    cols_to_keep = [
        "ticket_sequence", "cliente", "etapa", "grupo_trabajo", "sucursal",
        "zona", "municipio", "tipo_solicitud", "razon_falla", "solucion_falla",
        "creado_el", "ultima_actualizacion_etapa", "duracion_total_horas"
    ]
    df = df[cols_to_keep]

    _create_support_tables_if_not_exist(db)
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.{TableNames.SUPPORT_TICKETS}")
        conn.commit()
        
    db.copy_dataframe(df, TableNames.SUPPORT_TICKETS)
    return len(df)

def _create_support_tables_if_not_exist(db: DBConnector):
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
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            periodo_reporte VARCHAR(7) NOT NULL UNIQUE,
            total_tickets INT DEFAULT 0,
            tickets_resueltos INT DEFAULT 0,
            tickets_cancelados INT DEFAULT 0,
            tickets_rezagados INT DEFAULT 0,
            pct_resueltos NUMERIC DEFAULT 0,
            pct_cancelados NUMERIC DEFAULT 0,
            pct_rezagados NUMERIC DEFAULT 0,
            tiempo_medio_cierre_horas NUMERIC DEFAULT 0,
            tiempo_mediana_cierre_horas NUMERIC DEFAULT 0,
            tiempo_p25_cierre_horas NUMERIC DEFAULT 0,
            tiempo_p75_cierre_horas NUMERIC DEFAULT 0,
            tiempo_std_cierre_horas NUMERIC DEFAULT 0,
            pct_excede_promedio_cierre NUMERIC DEFAULT 0,
            pct_excede_mediana_cierre NUMERIC DEFAULT 0,
            tiempo_promedio_primera_respuesta_horas NUMERIC DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"ALTER TABLE {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} ADD COLUMN IF NOT EXISTS tickets_cancelados INT DEFAULT 0;",
        f"ALTER TABLE {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO} ADD COLUMN IF NOT EXISTS pct_cancelados NUMERIC DEFAULT 0;",
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
            periodo_reporte VARCHAR(7) NOT NULL,
            dimension TEXT NOT NULL,
            grupo_trabajo TEXT NOT NULL DEFAULT 'Todos',
            tipo_solicitud TEXT NOT NULL DEFAULT 'Todas',
            razon_falla TEXT NOT NULL DEFAULT 'Todas',
            valor TEXT NOT NULL,
            metricas JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"CREATE INDEX IF NOT EXISTS idx_support_cierre_periodo ON {DB_SCHEMA}.{TableNames.SUPPORT_CIERRE_HISTORICO}(periodo_reporte);",
        f"CREATE INDEX IF NOT EXISTS idx_support_dim_periodo ON {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}(periodo_reporte);",
        f"CREATE INDEX IF NOT EXISTS idx_support_dim_jerarquia ON {DB_SCHEMA}.{TableNames.SUPPORT_DIMENSIONES_HISTORICO}(dimension, grupo_trabajo, tipo_solicitud);",
    ]
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()