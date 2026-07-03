"""
Carga eficiente de CSV Odoo (200k+ filas) usando chunking y vectorización.
Patrón similar a subscriptions/imports.py pero adaptado a formato Odoo flat.
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Iterator, Tuple
from ..database import DBConnector
from ..config import DB_SCHEMA, TableNames
from .config import CSV_COLUMN_MAP, CLIENT_FIELDS, LOG_FIELDS, ETAPA_MAP, GANADO_STATES


def normalize_col(col: str) -> str:
    """Normaliza nombre de columna a snake_case sin acentos."""
    import unicodedata
    text = str(col).strip()
    text = (
        unicodedata.normalize("NFD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    text = text.lower()
    text = text.replace(" ", "_").replace("/", "_").replace(".", "_").replace("(", "").replace(")", "")
    text = text.replace("%", "pct").replace("-", "_")
    # Colapsar múltiples underscores
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def iter_odoo_chunks(csv_path: str, chunksize: int = 50000) -> Iterator[pd.DataFrame]:
    """Itera CSV en chunks para memoria eficiente."""
    return pd.read_csv(csv_path, sep=",", chunksize=chunksize, dtype=str, keep_default_na=False, encoding="utf-8")


def parse_odoo_chunk(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Procesa un chunk: separa clientes y logs.
    Retorna (df_clients, df_logs) listos para upsert/insert.
    """
    df = df.rename(columns=CSV_COLUMN_MAP)
    df.columns = [normalize_col(c) for c in df.columns]
    
    # Identificar filas de nueva oportunidad (id no vacío)
    mask_new_client = df["id"].astype(str).str.strip() != ""
    mask_new_client &= df["id"].str.lower() != "nan"
    mask_new_client &= df["id"].str.lower() != "none"
    
    # Forward fill del client_id para logs
    df["client_id"] = df["id"].where(mask_new_client).ffill()
    df["client_id"] = df["client_id"].astype(str).str.strip()
    
    # Separar clientes (primera fila de cada grupo)
    df_clients = df[mask_new_client].copy()
    # Solo mantener columnas que existen en el DataFrame
    available_client_fields = [c for c in CLIENT_FIELDS if c in df_clients.columns]
    df_clients = df_clients[available_client_fields].drop_duplicates(subset=["id"])
    
    # Separar logs (filas con datos de entrada de tiempo)
    mask_has_log = df["entradas_de_tiempo_iniciativa_id"].astype(str).str.strip() != ""
    mask_has_log &= df["entradas_de_tiempo_iniciativa_id"].str.lower() != "nan"
    mask_has_log &= df["entradas_de_tiempo_iniciativa_id"].str.lower() != "none"
    df_logs = df[mask_has_log].copy()
    
    # Preparar df_logs - solo columnas que existan
    log_cols_needed = [
        "client_id", "entradas_de_tiempo_iniciativa_id",
        "entradas_de_tiempo_etapa_anterior", "entradas_de_tiempo_nueva_etapa",
        "entradas_de_tiempo_duracion_horas", "entradas_de_tiempo_creado_el"
    ]
    available_log_cols = [c for c in log_cols_needed if c in df_logs.columns]
    df_logs = df_logs[available_log_cols].copy()
    
    # Renombrar columnas existentes
    rename_map = {
        "client_id": "client_id",
        "entradas_de_tiempo_iniciativa_id": "entrada_id",
        "entradas_de_tiempo_etapa_anterior": "etapa_anterior",
        "entradas_de_tiempo_nueva_etapa": "nueva_etapa",
        "entradas_de_tiempo_duracion_horas": "duracion_horas",
        "entradas_de_tiempo_creado_el": "created_at_log"
    }
    df_logs.columns = [rename_map.get(c, c) for c in df_logs.columns]
    
    # Normalizar etapas (clave canónica)
    df_clients["etapa_actual"] = df_clients["etapa"].map(ETAPA_MAP).fillna(df_clients["etapa"])
    df_logs["etapa_anterior"] = df_logs["etapa_anterior"].map(ETAPA_MAP).fillna(df_logs["etapa_anterior"])
    df_logs["nueva_etapa"] = df_logs["nueva_etapa"].map(ETAPA_MAP).fillna(df_logs["nueva_etapa"])
    
    # Parsear fechas y numéricos vectorizado
    for col in ["creado_el", "fecha_cierre", "ultima_actualizacion"]:
        if col in df_clients.columns:
            df_clients[col] = pd.to_datetime(df_clients[col], errors="coerce")
    
    df_clients["duracion_total_horas"] = pd.to_numeric(df_clients["duracion_total_horas"], errors="coerce")
    
    # Booleanos
    if "activo" in df_clients.columns:
        df_clients["activo"] = df_clients["activo"].astype(str).str.lower().map({
            "true": True, "false": False, "1": True, "0": False,
            "si": True, "no": False, "yes": True, "no": False
        })
    # devolver_oportunidad se guarda como texto (motivo)
    
    # Normalizar ganado (primera mayúscula -> minúscula)
    if "ganado" in df_clients.columns:
        df_clients["ganado"] = df_clients["ganado"].astype(str).str.strip().str.lower()
        df_clients["ganado"] = df_clients["ganado"].where(df_clients["ganado"].isin(GANADO_STATES), "pendiente")
    
    df_logs["duracion_horas"] = pd.to_numeric(df_logs["duracion_horas"], errors="coerce")
    df_logs["created_at_log"] = pd.to_datetime(df_logs["created_at_log"], errors="coerce")
    
    # Limpiar strings vacíos
    for col in df_clients.select_dtypes(include=["object"]).columns:
        df_clients[col] = df_clients[col].replace("", None)
    for col in df_logs.select_dtypes(include=["object"]).columns:
        df_logs[col] = df_logs[col].replace("", None)
    
    return df_clients, df_logs


def import_crm_csv(csv_path: str) -> Tuple[int, int]:
    """
    Importación completa con COPY masivo (TRUNCATE + COPY para full reload).
    Retorna (n_clients_upserted, n_logs_inserted).
    """
    db = DBConnector()
    total_clients = 0
    total_logs = 0
    
    # Solo dropear tablas de datos crudos, no métricas históricas
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {DB_SCHEMA}.{TableNames.CRM_CLIENTS}, {DB_SCHEMA}.{TableNames.CRM_LOGS} CASCADE")
        conn.commit()
    
    _create_tables_if_not_exist(db)
    
    for chunk in iter_odoo_chunks(csv_path):
        df_clients, df_logs = parse_odoo_chunk(chunk)
        
        if not df_clients.empty:
            db.copy_dataframe(df_clients, TableNames.CRM_CLIENTS)
            total_clients += len(df_clients)
        
        if not df_logs.empty:
            db.copy_dataframe(df_logs, TableNames.CRM_LOGS)
            total_logs += len(df_logs)
    
    return total_clients, total_logs


def _create_tables_if_not_exist(db: DBConnector):
    """Crea las tablas CRM (datos + JSONB de métricas)."""
    statements = [
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_CLIENTS} (
            id TEXT PRIMARY KEY,
            oportunidad TEXT,
            cliente TEXT,
            cliente_municipio TEXT,
            campana TEXT,
            sucursal TEXT,
            vendedor TEXT,
            medio TEXT,
            medio_supervisor TEXT,
            equipo_ventas TEXT,
            etapa TEXT,
            etapa_actual TEXT,
            motivo_perdida TEXT,
            devolver_oportunidad TEXT,
            ganado TEXT,
            activo BOOLEAN,
            creado_el TIMESTAMP,
            fecha_cierre TIMESTAMP,
            ultima_actualizacion TIMESTAMP,
            duracion_total_horas NUMERIC,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_LOGS} (
            id BIGSERIAL PRIMARY KEY,
            client_id TEXT NOT NULL,
            entrada_id TEXT,
            etapa_anterior TEXT,
            nueva_etapa TEXT,
            duracion_horas NUMERIC,
            created_at_log TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
        # ---- Tabla global singleton (JSONB por métrica) ----
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            totals JSONB,
            tiempo_instalacion JSONB,
            tiempo_por_etapa JSONB,
            efectividad JSONB,
            etapa8 JSONB,
            perdido JSONB,
            rescate JSONB
        )
        """,
        # ---- Dimensiones (JSONB por métrica, sin periodo) ----
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            dimension TEXT NOT NULL,
            valor TEXT NOT NULL,
            totals JSONB,
            tiempo_instalacion JSONB,
            tiempo_por_etapa JSONB,
            efectividad JSONB,
            etapa8 JSONB,
            perdido JSONB,
            rescate JSONB
        )
        """,
        # Índices
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_client ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(client_id)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_created ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(created_at_log)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_nueva_etapa ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(nueva_etapa)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_etapas ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(etapa_anterior, nueva_etapa)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_etapa ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(etapa_actual)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_ganado ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(ganado)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_creado ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(creado_el)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_dims ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(cliente_municipio, campana, sucursal, vendedor, equipo_ventas)",
        f"CREATE INDEX IF NOT EXISTS idx_crm_dimension ON {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}(dimension)",
    ]
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()