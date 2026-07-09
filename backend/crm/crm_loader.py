from __future__ import annotations
import pandas as pd
import numpy as np
from typing import Iterator, Tuple
from ..database import DBConnector
from ..conf_config import DB_SCHEMA, TableNames
from .crm_config import CSV_COLUMN_MAP, CLIENT_FIELDS, LOG_FIELDS, ETAPA_MAP, GANADO_STATES

def normalize_col(col: str) -> str:
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
    while "__" in text:
        text = text.replace("__", "_")
    return text.strip("_")


def iter_odoo_chunks(csv_path: str, chunksize: int = 50000) -> Iterator[pd.DataFrame]:
    return pd.read_csv(csv_path, sep=",", chunksize=chunksize, dtype=str, keep_default_na=False, encoding="utf-8")


def parse_odoo_chunk(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    df = df.rename(columns=CSV_COLUMN_MAP)
    df.columns = [normalize_col(c) for c in df.columns]
    
    mask_new_client = df["id"].astype(str).str.strip() != ""
    mask_new_client &= df["id"].str.lower() != "nan"
    mask_new_client &= df["id"].str.lower() != "none"
    
    df["client_id"] = df["id"].where(mask_new_client).ffill()
    df["client_id"] = df["client_id"].astype(str).str.strip()
    
    df_clients = df[mask_new_client].copy()
    available_client_fields = [c for c in CLIENT_FIELDS if c in df_clients.columns]
    df_clients = df_clients[available_client_fields].drop_duplicates(subset=["id"])
    
    mask_has_log = df["entradas_de_tiempo_iniciativa_id"].astype(str).str.strip() != ""
    mask_has_log &= df["entradas_de_tiempo_iniciativa_id"].str.lower() != "nan"
    mask_has_log &= df["entradas_de_tiempo_iniciativa_id"].str.lower() != "none"
    df_logs = df[mask_has_log].copy()
    
    log_cols_needed = [
        "client_id", "entradas_de_tiempo_iniciativa_id",
        "entradas_de_tiempo_etapa_anterior", "entradas_de_tiempo_nueva_etapa",
        "entradas_de_tiempo_duracion_horas", "entradas_de_tiempo_creado_el"
    ]
    available_log_cols = [c for c in log_cols_needed if c in df_logs.columns]
    df_logs = df_logs[available_log_cols].copy()
    
    rename_map = {
        "client_id": "client_id",
        "entradas_de_tiempo_iniciativa_id": "entrada_id",
        "entradas_de_tiempo_etapa_anterior": "etapa_anterior",
        "entradas_de_tiempo_nueva_etapa": "nueva_etapa",
        "entradas_de_tiempo_duracion_horas": "duracion_horas",
        "entradas_de_tiempo_creado_el": "created_at_log"
    }
    df_logs.columns = [rename_map.get(c, c) for c in df_logs.columns]
    
    df_clients["etapa_actual"] = df_clients["etapa"].apply(map_stage_canonically)
    df_logs["etapa_anterior"] = df_logs["etapa_anterior"].apply(map_stage_canonically)
    df_logs["nueva_etapa"] = df_logs["nueva_etapa"].apply(map_stage_canonically)
    
    for col in ["creado_el", "fecha_cierre", "ultima_actualizacion"]:
        if col in df_clients.columns:
            df_clients[col] = pd.to_datetime(df_clients[col], errors="coerce")
    
    df_clients["duracion_total_horas"] = pd.to_numeric(df_clients["duracion_total_horas"], errors="coerce")
    
    if "activo" in df_clients.columns:
        df_clients["activo"] = df_clients["activo"].astype(str).str.lower().map({
            "true": True, "false": False, "1": True, "0": False,
            "si": True, "no": False, "yes": True, "no": False
        })
        
    if "ganado" in df_clients.columns:
        df_clients["ganado"] = df_clients["ganado"].astype(str).str.strip().str.lower()
        df_clients["ganado"] = df_clients["ganado"].where(df_clients["ganado"].isin(GANADO_STATES), "pendiente")
    
    df_logs["duracion_horas"] = pd.to_numeric(df_logs["duracion_horas"], errors="coerce")
    df_logs["created_at_log"] = pd.to_datetime(df_logs["created_at_log"], errors="coerce")
    
    for col in df_clients.select_dtypes(include=["object"]).columns:
        df_clients[col] = df_clients[col].replace("", None)
    for col in df_logs.select_dtypes(include=["object"]).columns:
        df_logs[col] = df_logs[col].replace("", None)
    
    return df_clients, df_logs


def import_crm_csv(csv_path: str) -> Tuple[int, int]:
    db = DBConnector()
    total_clients = 0
    total_logs = 0
    
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

def map_stage_canonically(stage_value: Any) -> str:
    """
    Normaliza y traduce nombres de etapas de Odoo a claves de forma adaptativa.
    Soporta cambios de texto en Odoo siempre que se mantenga el número o palabras clave.
    """
    if pd.isna(stage_value) or not stage_value:
        return "desconocido"
        
    val_str = str(stage_value).strip()
    
    # Capa 1: Coincidencia rápida exacta contra el mapa estático
    from .crm_config import ETAPA_MAP
    if val_str in ETAPA_MAP:
        return ETAPA_MAP[val_str]
        
    # Capa 2: Extracción por prefijo numérico (ej: "5. GPI" o "5- GPI" o "5 GPI" -> 5)
    import re
    num_match = re.match(r"^(\d+)", val_str)
    if num_match:
        num = int(num_match.group(1))
        num_map = {
            1: "etapa_1_contacto",
            2: "etapa_2_recepcion",
            3: "etapa_3_factibilidad",
            4: "etapa_4_adecuaciones",
            5: "etapa_5_gpi",
            6: "etapa_6_contratistas",
            7: "etapa_7_instalados",
            8: "etapa_8_devueltos",
            9: "etapa_9_disponibles",
            10: "etapa_10_proyectos",
        }
        if num in num_map:
            return num_map[num]
            
    # Capa 3: Coincidencia por heurística de palabras clave (si Odoo no usa números de etapa)
    from ..utils import normalize_text
    norm = normalize_text(val_str)
    
    if "contacto" in norm: return "etapa_1_contacto"
    if "recepcion" in norm: return "etapa_2_recepcion"
    if "factibilidad" in norm or "evaluacion" in norm: return "etapa_3_factibilidad"
    if "adecuacion" in norm or "red optica" in norm: return "etapa_4_adecuaciones"
    if "gpi" in norm or "planificacion" in norm: return "etapa_5_gpi"
    if "contratista" in norm: return "etapa_6_contratistas"
    if "instalado" in norm: return "etapa_7_instalados"
    if "devuelto" in norm: return "etapa_8_devueltos"
    if "disponible" in norm or "otra fecha" in norm: return "etapa_9_disponibles"
    if "proyecto" in norm: return "etapa_10_proyectos"
    if "perdido" in norm: return "perdido"
    
    return "desconocido"