from __future__ import annotations

import unicodedata
from collections.abc import Iterator

import pandas as pd

from core.config import ACTIVO_FALSE_TOKENS, ACTIVO_TRUE_TOKENS, DB_SCHEMA, TableNames
from core.database import DBConnector

from .config import CLIENT_FIELDS, CSV_COLUMN_MAP, ETAPA_MAP, GANADO_STATES


def normalize_col(col: str) -> str:
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
    return pd.read_csv(
        csv_path, 
        sep=",", 
        chunksize=chunksize, 
        dtype=str, 
        keep_default_na=False, 
        encoding="utf-8-sig",
        low_memory=False
    )


def map_stage_canonically(stage_value: any) -> str:
    """Normaliza y traduce nombres de etapas de Odoo a claves canónicas."""
    if pd.isna(stage_value) or not stage_value:
        return "desconocido"
        
    val_str = str(stage_value).strip()
    if val_str in ETAPA_MAP:
        return ETAPA_MAP[val_str]
        
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


def parse_odoo_chunk(df: pd.DataFrame, prev_client_id: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame, str | None]:
    df = df.rename(columns=CSV_COLUMN_MAP)
    df.columns = [normalize_col(c) for c in df.columns]
    
    mask_new_client = df["id"].astype(str).str.strip() != ""
    mask_new_client &= df["id"].str.lower() != "nan"
    mask_new_client &= df["id"].str.lower() != "none"
    
    # 1. Forward fill del client_id
    client_id_series = df["id"].where(mask_new_client)
    if prev_client_id and len(client_id_series) > 0 and not mask_new_client.iloc[0]:
        client_id_series.iloc[0] = prev_client_id
        
    df["client_id"] = client_id_series.ffill().astype(str).str.strip()
    last_valid_id = df["client_id"].iloc[-1] if not df.empty and df["client_id"].iloc[-1] not in ("", "nan", "None") else prev_client_id
    
    # Extraer clientes únicos
    df_clients = df[mask_new_client].copy()
    available_client_fields = [c for c in CLIENT_FIELDS if c in df_clients.columns]
    df_clients = df_clients[available_client_fields].drop_duplicates(subset=["id"])
    
    # Extraer logs válidos
    mask_has_log = df["entradas_de_tiempo_iniciativa_id"].astype(str).str.strip() != ""
    mask_has_log &= df["entradas_de_tiempo_iniciativa_id"].str.lower() != "nan"
    mask_has_log &= df["entradas_de_tiempo_iniciativa_id"].str.lower() != "none"
    mask_has_log &= df["client_id"] != ""
    mask_has_log &= df["client_id"].str.lower() != "nan"
    mask_has_log &= df["client_id"].str.lower() != "none"
    
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
        # Mismo export de Odoo que el loader de suscripciones, asi que mismo
        # vocabulario (antes este mapa era mas pobre: no reconocia "sí",
        # "verdadero" ni "t"/"f", y trataba la cadena vacia como desconocida
        # cuando en Odoo es justamente como se escribe el False). Lo que no
        # este en ninguno de los dos vocabularios sigue quedando como nulo.
        limpio = df_clients["activo"].astype(str).str.strip().str.lower()
        df_clients["activo"] = pd.Series(pd.NA, index=limpio.index, dtype="boolean")
        df_clients.loc[limpio.isin(ACTIVO_TRUE_TOKENS), "activo"] = True
        df_clients.loc[limpio.isin(ACTIVO_FALSE_TOKENS), "activo"] = False
        
    if "ganado" in df_clients.columns:
        df_clients["ganado"] = df_clients["ganado"].astype(str).str.strip().str.lower()
        df_clients["ganado"] = df_clients["ganado"].where(df_clients["ganado"].isin(GANADO_STATES), "pendiente")
    
    df_logs["duracion_horas"] = pd.to_numeric(df_logs["duracion_horas"], errors="coerce")
    df_logs["created_at_log"] = pd.to_datetime(df_logs["created_at_log"], errors="coerce")
    
    for col in df_clients.select_dtypes(include=["object"]).columns:
        df_clients[col] = df_clients[col].replace("", None)
    for col in df_logs.select_dtypes(include=["object"]).columns:
        if col != "client_id":
            df_logs[col] = df_logs[col].replace("", None)
    
    return df_clients, df_logs, last_valid_id


def import_crm_csv(csv_path: str) -> tuple[int, int]:
    db = DBConnector()
    total_clients = 0
    total_logs = 0
    
    _create_tables_if_not_exist(db)
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.{TableNames.CRM_CLIENTS}, {DB_SCHEMA}.{TableNames.CRM_LOGS} CASCADE")
        conn.commit()
    
    last_client_id = None
    
    for chunk in iter_odoo_chunks(csv_path):
        df_clients, df_logs, last_client_id = parse_odoo_chunk(chunk, prev_client_id=last_client_id)
        
        if not df_clients.empty:
            db.copy_dataframe(df_clients, TableNames.CRM_CLIENTS)
            total_clients += len(df_clients)
        
        if not df_logs.empty:
            df_logs = df_logs[df_logs["client_id"].notna() & (df_logs["client_id"].astype(str).str.strip() != "")]
            if not df_logs.empty:
                db.copy_dataframe(df_logs, TableNames.CRM_LOGS)
                total_logs += len(df_logs)
    
    return total_clients, total_logs


def ensure_crm_schema(db: DBConnector):
    """Crea o pone al día el esquema de CRM. Idempotente y barata de repetir."""
    _create_tables_if_not_exist(db)


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
        );
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
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            periodo_reporte VARCHAR(7) NOT NULL UNIQUE,
            total_oportunidades INT DEFAULT 0,
            ganados INT DEFAULT 0,
            perdidos INT DEFAULT 0,
            pendientes INT DEFAULT 0,
            pct_instalacion NUMERIC DEFAULT 0,
            pct_perdida NUMERIC DEFAULT 0,
            pct_pendientes NUMERIC DEFAULT 0,
            count_devueltos_e8 INT DEFAULT 0,
            pct_devueltos_e8 NUMERIC DEFAULT 0,
            
            -- Tiempos de Instalación (Ganados)
            horas_promedio_inst NUMERIC DEFAULT 0,
            horas_mediana_inst NUMERIC DEFAULT 0,
            horas_p25_inst NUMERIC DEFAULT 0,
            horas_p75_inst NUMERIC DEFAULT 0,
            horas_min_inst NUMERIC DEFAULT 0,
            horas_max_inst NUMERIC DEFAULT 0,
            horas_std_inst NUMERIC DEFAULT 0,
            pct_excede_prom_inst NUMERIC DEFAULT 0,
            
            -- Tiempos de Pérdida (Perdidos)
            horas_promedio_perd NUMERIC DEFAULT 0,
            horas_mediana_perd NUMERIC DEFAULT 0,
            horas_p25_perd NUMERIC DEFAULT 0,
            horas_p75_perd NUMERIC DEFAULT 0,
            horas_min_perd NUMERIC DEFAULT 0,
            horas_max_perd NUMERIC DEFAULT 0,
            horas_std_perd NUMERIC DEFAULT 0,
            pct_excede_prom_perd NUMERIC DEFAULT 0,

            -- Tiempo de Cierre (ganados + perdidos)
            horas_promedio_cierre NUMERIC DEFAULT 0,
            horas_mediana_cierre NUMERIC DEFAULT 0,
            horas_p25_cierre NUMERIC DEFAULT 0,
            horas_p75_cierre NUMERIC DEFAULT 0,
            horas_min_cierre NUMERIC DEFAULT 0,
            horas_max_cierre NUMERIC DEFAULT 0,
            horas_std_cierre NUMERIC DEFAULT 0,
            pct_excede_prom_cierre NUMERIC DEFAULT 0,

            -- Efectividad por etapa del periodo. Se calcula siempre, pero sólo
            -- cabe como JSON: es una fila por etapa, no un escalar.
            efectividad JSONB,

            -- Tiempo de permanencia por etapa del periodo. Misma forma que la
            -- efectividad: una fila por etapa, con su distribución y su
            -- desglose por desenlace.
            tiempo_por_etapa JSONB,

            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_METRICAS_GLOBALES} (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            resumen_global JSONB,
            tiempo_por_etapa JSONB,
            efectividad JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"""
        CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO} (
            id BIGSERIAL PRIMARY KEY,
            periodo_reporte VARCHAR(7) NOT NULL,
            dimension TEXT NOT NULL,
            valor TEXT NOT NULL,
            metricas JSONB,
            efectividad JSONB,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        """,
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_client ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(client_id);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_created ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(created_at_log);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_nueva_etapa ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(nueva_etapa);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_logs_etapas ON {DB_SCHEMA}.{TableNames.CRM_LOGS}(etapa_anterior, nueva_etapa);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_etapa ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(etapa_actual);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_ganado ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(ganado);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_creado ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(creado_el);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_clients_dims ON {DB_SCHEMA}.{TableNames.CRM_CLIENTS}(campana, sucursal, vendedor);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_cierre_periodo ON {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO}(periodo_reporte);",
        f"CREATE INDEX IF NOT EXISTS idx_crm_dim_periodo ON {DB_SCHEMA}.{TableNames.CRM_DIMENSIONES_HISTORICO}(periodo_reporte, dimension);",

        # Migración en caliente para esquemas creados antes de que la efectividad
        # por periodo se persistiera.
        f"ALTER TABLE {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} ADD COLUMN IF NOT EXISTS efectividad JSONB;",

        # Migración en caliente para el tiempo por etapa del periodo, que antes
        # sólo se guardaba —y sólo el del último mes— en métricas globales.
        f"ALTER TABLE {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} ADD COLUMN IF NOT EXISTS tiempo_por_etapa JSONB;",

        # Migración en caliente para el tiempo de cierre combinado, añadido
        # después de que existieran los tiempos de instalación y pérdida.
        *[
            f"ALTER TABLE {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} ADD COLUMN IF NOT EXISTS {col} NUMERIC DEFAULT 0;"
            for col in (
                "horas_promedio_cierre", "horas_mediana_cierre", "horas_p25_cierre",
                "horas_p75_cierre", "horas_min_cierre", "horas_max_cierre",
                "horas_std_cierre", "pct_excede_prom_cierre",
            )
        ],

        # Migración en caliente para el desglose del riesgo de devolución a la
        # etapa 8. Antes sólo se guardaba el conteo crudo de movimientos, sin la
        # población contra la que se mide ni de qué se compone: cuántas
        # devoluciones se excluyeron por motivo ajeno a la gestión, cuántas se
        # imputaron sin motivo legible y cuántas oportunidades distintas hay
        # detrás de las transiciones.
        *[
            f"ALTER TABLE {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} ADD COLUMN IF NOT EXISTS {col} INT DEFAULT 0;"
            for col in (
                "total_en_riesgo", "count_devueltos_e8_bruto",
                "e8_devueltos_excepcion", "e8_devueltos_con_motivo",
                "e8_devueltos_sin_motivo", "e8_devueltos_estimados",
                "e8_clientes_devueltos", "e8_reincidentes",
            )
        ],
        f"ALTER TABLE {DB_SCHEMA}.{TableNames.CRM_CIERRE_HISTORICO} "
        f"ADD COLUMN IF NOT EXISTS pct_devueltos_e8_bruto NUMERIC DEFAULT 0;",
    ]
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for stmt in statements:
                cur.execute(stmt)
        conn.commit()