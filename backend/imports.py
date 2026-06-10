"""
Módulo de importación de datos desde archivos CSV a la base de datos.

Dependencias esperadas:
- `pandas`: Lectura y transformación de DataFrames desde CSV.
- `numpy`: Valores nulos (NaN) para limpieza.
- `psycopg2.sql`: Construcción segura de consultas SQL.
- `config.DB_SCHEMA`: Esquema de base de datos destino.
- `database.DBConnector`: Conexión a PostgreSQL y copia masiva.
- `Planes.json`: Archivo JSON en el directorio raíz del proyecto con
  la lista de planes válidos (productos).
- Archivos CSV de entrada con columnas mapeadas según las constantes
  `SUBSCRIPTIONS_COLUMN_MAPPING` y `LOGS_COLUMN_MAPPING`.

Proporciona dos funciones de importación:
- `import_subscriptions_csv`: Importa suscripciones desde CSV a las tablas
  `Subscripciones-b` (detalle) y `Subscripciones` (consolidado).
- `import_logs_csv`: Importa logs desde CSV a la tabla `Subscripciones-logs`.
"""

from __future__ import annotations
import json
import pathlib

import numpy as np
import pandas as pd
from psycopg2 import sql

from .config import DB_SCHEMA
from .database import DBConnector

# Mapeo de nombres de columnas del CSV de suscripciones a nombres internos
SUBSCRIPTIONS_COLUMN_MAPPING = {
    "Líneas de la orden/Referencia de la orden": "Orden_Producto",
    "Líneas de la orden/Producto": "Producto",
    "Líneas de la orden/Producto/Nombre": "Producto",
    "Líneas de la orden/Cliente": "Cliente",
    "Líneas de la orden/Cliente/CI/RIF": "CI",
    "Sucursal": "Sucursal",
    "Zona": "Zona",
    "Líneas de la orden/Cliente/Municipio": "Municipio",
    "Tipo de Servicio": "Tipo",
    "Estado de la Suscripción": "Estado",
    "Campaña": "campanna",
    "Próxima Fecha de Factura": "fecha_factura",
    "Fecha de inicio": "fecha_inicio",
    "Tarifa": "tarifa",
    "Total": "Total",
}

# Columnas de metadatos que se propagan hacia adelante dentro de un mismo grupo
SUBSCRIPTIONS_METADATA_COLS = [
    "Cliente", "CI", "Sucursal", "Zona", "Municipio",
    "Tipo", "Estado", "campanna", "fecha_factura", "fecha_inicio",
    "tarifa", "Total",
]

# Mapeo de nombres de columnas del CSV de logs a nombres internos
LOGS_COLUMN_MAPPING = {
    "Logs de Cambios/Suscripción": "orden",
    "Logs de Cambios/Fecha de Cambio": "fecha_log",
    "Logs de Cambios/Nota": "log",
    "Logs de Cambios/Estado Interno de Suscripción": "estado",
}

# Columnas requeridas que deben estar presentes en el CSV de logs
LOGS_REQUIRED_COLS = ["orden", "fecha_log", "log", "estado"]

# Ruta al archivo JSON de planes (ubicado en el directorio raíz del proyecto)
PLANES_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "Planes.json"
)
# Variable global para cachear el conjunto de nombres de planes
_PLAN_SET = None


def _get_plan_set():
    """
    Carga y cachea el conjunto de nombres de planes desde `Planes.json`.

    Returns:
        Set[str] con los nombres de todos los planes definidos.
    """
    global _PLAN_SET
    if _PLAN_SET is None:
        with open(PLANES_PATH, "r", encoding="utf-8") as f:
            planes_data = json.load(f)
        _PLAN_SET = {p["name"] for p in planes_data["planes"]}
    return _PLAN_SET


def _clean_empty_strings(x):
    """
    Convierte cadenas vacías o de solo espacios a NaN para limpieza de datos.

    Args:
        x: Valor a evaluar.

    Returns:
        np.nan si x es cadena vacía, el valor original en caso contrario.
    """
    if isinstance(x, str) and x.strip() == "":
        return np.nan
    return x


def _first_matching_plan(values):
    """
    Encuentra el primer valor que coincide con un plan conocido en una serie.

    Itera sobre los valores únicos no nulos y retorna el primero que
    exista en el conjunto de planes cargado desde `Planer.json`.

    Args:
        values: Serie de pandas con valores a comparar.

    Returns:
        El primer valor que coincide con un plan, o None si no hay coincidencia.
    """
    plan_set = _get_plan_set()
    for v in values.dropna().unique():
        if v in plan_set:
            return v
    return None


def import_subscriptions_csv(csv_path: str) -> int:
    """
    Importa un archivo CSV de suscripciones a la base de datos.

    Flujo:
    1. Lee el CSV y renombra columnas según el mapeo definido.
    2. Elimina filas que contengan el encabezado original duplicado.
    3. Filtra solo las columnas esperadas.
    4. Convierte cadenas vacías a NaN.
    5. Propaga metadatos hacia adelante dentro de cada grupo de orden.
    6. Consolida cada orden en una sola fila (primer valor de metadata,
       primer plan coincidente para Producto).
    7. Convierte valores NaN/None a None de Python para PostgreSQL.
    8. Crea las tablas `Subscripciones-b` y `Subscripciones` si no existen.
    9. Trunca ambas tablas y copia los datos mediante COPY masivo.

    Args:
        csv_path: Ruta al archivo CSV de suscripciones.

    Returns:
        Número de órdenes consolidadas importadas.

    Raises:
        FileNotFoundError: Si el archivo CSV no existe en la ruta indicada.
        pd.errors.EmptyDataError: Si el archivo CSV está vacío.
        psycopg2.Error: Si falla alguna operación de base de datos.
    """
    df_local = pd.read_csv(csv_path)
    df_local.rename(columns=SUBSCRIPTIONS_COLUMN_MAPPING, inplace=True)

    # Elimina filas que contengan el encabezado original repetido como dato
    if not df_local.empty:
        df_local = df_local[
            ~df_local["Orden_Producto"]
            .astype(str)
            .str.contains(
                "Líneas de la orden/Referencia de la orden",
                na=False,
            )
        ]

    # Conserva solo las columnas que forman parte del mapeo esperado
    expected_cols = set(SUBSCRIPTIONS_COLUMN_MAPPING.values())
    df_local = df_local[
        [c for c in df_local.columns if c in expected_cols]
    ]

    # Limpia cadenas vacías (las convierte a NaN)
    df_local = df_local.apply(_clean_empty_strings)

    # Propaga metadatos hacia adelante dentro de cada grupo de Orden_Producto
    df_local[SUBSCRIPTIONS_METADATA_COLS] = (
        df_local.groupby("Orden_Producto")[SUBSCRIPTIONS_METADATA_COLS]
        .ffill()
    )

    # Reglas de agregación: primer valor para metadata, plan coincidente para Producto
    agg_rules = {col: "first" for col in SUBSCRIPTIONS_METADATA_COLS}
    if "Producto" in df_local.columns:
        agg_rules["Producto"] = _first_matching_plan

    # Consolidación: una fila por orden
    df_consolidated = df_local.groupby(
        "Orden_Producto", as_index=False
    ).agg(agg_rules)
    df_consolidated = df_consolidated.dropna(subset=["Orden_Producto"])

    # Convierte representaciones de nulo a None de Python
    for col in df_consolidated.columns:
        df_consolidated[col] = (
            df_consolidated[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )
    for col in df_local.columns:
        df_local[col] = (
            df_local[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )

    db_tool = DBConnector()

    # Crea las tablas si no existen y las trunca antes de insertar
    with db_tool.get_connection() as conn:
        with conn.cursor() as cur:
            for t_name, d_frame in [
                ("Subscripciones-b", df_local),
                ("Subscripciones", df_consolidated),
            ]:
                cols_def = [
                    sql.SQL("{} text").format(sql.Identifier(c))
                    for c in d_frame.columns
                ]
                cur.execute(
                    sql.SQL(
                        "CREATE TABLE IF NOT EXISTS"
                        " {schema_table} ({fields})"
                    ).format(
                        schema_table=sql.Identifier(DB_SCHEMA, t_name),
                        fields=sql.SQL(", ").join(cols_def),
                    )
                )
                cur.execute(
                    sql.SQL("TRUNCATE TABLE {schema_table}").format(
                        schema_table=sql.Identifier(DB_SCHEMA, t_name)
                    )
                )
            conn.commit()

    # Copia masiva de datos
    db_tool.copy_dataframe(df_local, "Subscripciones-b")
    db_tool.copy_dataframe(df_consolidated, "Subscripciones")

    return len(df_consolidated)


def import_logs_csv(csv_path: str) -> int:
    """
    Importa un archivo CSV de logs de cambios a la base de datos.

    Flujo:
    1. Lee el CSV y renombra columnas según el mapeo definido.
    2. Valida que todas las columnas requeridas estén presentes.
    3. Convierte cadenas vacías a NaN y valores nulos a None.
    4. Trunca la tabla `Subscripciones-logs` y copia los datos mediante COPY.

    Args:
        csv_path: Ruta al archivo CSV de logs de cambios.

    Returns:
        Número de registros de logs importados.

    Raises:
        ValueError: Si faltan columnas requeridas en el CSV.
    """
    df_logs = pd.read_csv(csv_path)
    df_logs.rename(columns=LOGS_COLUMN_MAPPING, inplace=True)

    # Verifica que todas las columnas necesarias existan
    missing_cols = [
        c for c in LOGS_REQUIRED_COLS if c not in df_logs.columns
    ]
    if missing_cols:
        raise ValueError(
            f"El CSV no contiene las columnas"
            f" requeridas: {missing_cols}"
        )

    # Limpia cadenas vacías y normaliza nulos
    df_logs = df_logs.apply(_clean_empty_strings)
    for col in df_logs.columns:
        df_logs[col] = (
            df_logs[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )

    db_tool = DBConnector()
    # Trunca la tabla existente y copia los nuevos datos
    with db_tool.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("TRUNCATE TABLE {schema_table}").format(
                    schema_table=sql.Identifier(
                        DB_SCHEMA, "Subscripciones-logs"
                    )
                )
            )
        conn.commit()
    db_tool.copy_dataframe(df_logs, "Subscripciones-logs")

    return len(df_logs)
