"""
Limpieza y normalización de datos CRM post-carga.
Similar a subscriptions/analyzer/cleaner.py
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from ..config import DB_SCHEMA
from .config import ETAPA_MAP, ETAPA_ORDER, DIMENSIONES, GANADO_STATES


def build_clean_data(df_clients_raw: pd.DataFrame, df_logs_raw: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Limpia y normaliza los datos crudos en DataFrames listos para análisis.
    
    Returns:
        (df_clients_clean, df_logs_clean): DataFrames limpios.
    """
    df_clients = df_clients_raw.copy()
    df_logs = df_logs_raw.copy()
    
    # Normalizar columnas a minúsculas
    df_clients.columns = df_clients.columns.str.lower()
    df_logs.columns = df_logs.columns.str.lower()
    
    # Asegurar tipos en clients
    if "id" in df_clients.columns:
        df_clients["id"] = df_clients["id"].astype(str).str.strip()
    
    # Normalizar etapas a clave canónica
    if "etapa_actual" in df_clients.columns:
        df_clients["etapa_actual"] = df_clients["etapa_actual"].astype(str).str.strip()
        df_clients["etapa_actual"] = df_clients["etapa_actual"].map(ETAPA_MAP).fillna(df_clients["etapa_actual"])
    
    if "etapa_anterior" in df_logs.columns:
        df_logs["etapa_anterior"] = df_logs["etapa_anterior"].astype(str).str.strip()
        df_logs["etapa_anterior"] = df_logs["etapa_anterior"].map(ETAPA_MAP).fillna(df_logs["etapa_anterior"])
    
    if "nueva_etapa" in df_logs.columns:
        df_logs["nueva_etapa"] = df_logs["nueva_etapa"].astype(str).str.strip()
        df_logs["nueva_etapa"] = df_logs["nueva_etapa"].map(ETAPA_MAP).fillna(df_logs["nueva_etapa"])
    
    # Normalizar ganado
    if "ganado" in df_clients.columns:
        df_clients["ganado"] = df_clients["ganado"].astype(str).str.strip().str.lower()
        df_clients["ganado"] = df_clients["ganado"].where(df_clients["ganado"].isin(GANADO_STATES), "pendiente")
    
    # Parsear fechas si son strings
    for col in ["creado_el", "fecha_cierre", "ultima_actualizacion"]:
        if col in df_clients.columns and df_clients[col].dtype == "object":
            df_clients[col] = pd.to_datetime(df_clients[col], errors="coerce")
    
    if "created_at_log" in df_logs.columns and df_logs["created_at_log"].dtype == "object":
        df_logs["created_at_log"] = pd.to_datetime(df_logs["created_at_log"], errors="coerce")
    
    # Numéricos
    for col in ["duracion_total_horas"]:
        if col in df_clients.columns:
            df_clients[col] = pd.to_numeric(df_clients[col], errors="coerce")
    
    if "duracion_horas" in df_logs.columns:
        df_logs["duracion_horas"] = pd.to_numeric(df_logs["duracion_horas"], errors="coerce")
    
    # Booleanos
    for col in ["activo", "devolver_oportunidad"]:
        if col in df_clients.columns:
            df_clients[col] = df_clients[col].astype(str).str.lower().map({
                "true": True, "false": False, "1": True, "0": False,
                "si": True, "no": False, "yes": True, "no": False
            }).astype("boolean")
    
    # Dimensiones - normalizar textos
    for dim in DIMENSIONES:
        if dim in df_clients.columns:
            df_clients[dim] = df_clients[dim].astype(str).str.strip()
            df_clients[dim] = df_clients[dim].replace({"nan": None, "none": None, "": None})
    
    # Ordenar logs por cliente y fecha
    if not df_logs.empty and "client_id" in df_logs.columns and "created_at_log" in df_logs.columns:
        df_logs = df_logs.sort_values(["client_id", "created_at_log"]).reset_index(drop=True)
    
    # Eliminar duplicados en clients por id
    if "id" in df_clients.columns:
        df_clients = df_clients.drop_duplicates(subset=["id"]).reset_index(drop=True)
    
    return df_clients, df_logs


def normalize_text(value) -> str:
    """Normaliza texto: minúsculas, sin acentos, strip."""
    import unicodedata
    if pd.isna(value):
        return ""
    text = str(value)
    text = (
        unicodedata.normalize("NFD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    return text.lower().strip()