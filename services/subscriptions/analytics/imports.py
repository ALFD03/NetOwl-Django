from __future__ import annotations

import numpy as np
import pandas as pd
from psycopg2 import sql

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import plan_names

from .config import SUBS_ACTIVO_ALIASES, SUBS_COLUMN_MAPPING

SUBSCRIPTIONS_COLUMN_MAPPING = {**SUBS_COLUMN_MAPPING, **SUBS_ACTIVO_ALIASES}

SUBSCRIPTIONS_METADATA_COLS = [
    "cliente", "ci", "sucursal", "zona", "municipio",
    "tipo", "estado", "campanna", "fecha_factura", "fecha_inicio",
    "tarifa", "total", "producto", "telefono", "phone", "phone2", "vendedor",
    "activo",
]

LOGS_COLUMN_MAPPING = {
    "Logs de Cambios/Suscripción": "orden",
    "Logs de Cambios/Fecha de Cambio": "fecha_log",
    "Logs de Cambios/Nota": "log",
    "Logs de Cambios/Estado Interno de Suscripción": "estado",
}

LOGS_REQUIRED_COLS = ["orden", "fecha_log", "log", "estado"]

def _blank_to_nan(df: pd.DataFrame) -> pd.DataFrame:
    """Convierte en NaN las celdas vacias o de solo espacios.

    Se recorre columna por columna a proposito: `DataFrame.apply` entrega
    Series completas y no celdas, asi que la version anterior (un `isinstance`
    sobre el valor) nunca convertia nada. Sin esto el `ffill` por orden no
    rellena, el `dropna` no descarta las lineas sin referencia y `groupby.first`
    se queda con la cadena vacia en lugar del primer valor real.
    """
    out = df.copy()
    for col in out.columns:
        if out[col].dtype != object:
            continue
        vacias = out[col].notna() & (out[col].astype(str).str.strip() == "")
        if vacias.any():
            out.loc[vacias, col] = np.nan
    return out


def _first_matching_plan(values):
    plan_set = plan_names()
    for v in values.dropna().unique():
        if v in plan_set:
            return v
    return None


def import_subscriptions_csv(csv_path: str) -> int:
    # ✅ Lectura segura con dtype=str, encoding utf-8-sig y low_memory=False
    df_local = pd.read_csv(
        csv_path, 
        dtype=str, 
        keep_default_na=False, 
        low_memory=False, 
        encoding="utf-8-sig"
    )
    df_local.rename(columns=SUBSCRIPTIONS_COLUMN_MAPPING, inplace=True)

    if not df_local.empty:
        df_local = df_local[
            ~df_local["orden_producto"]
            .astype(str)
            .str.contains(
                "Líneas de la orden/Referencia de la orden",
                na=False,
            )
        ]

    expected_cols = set(SUBSCRIPTIONS_COLUMN_MAPPING.values())
    df_local = df_local[
        [c for c in df_local.columns if c in expected_cols]
    ]

    df_local = _blank_to_nan(df_local)
    # Lineas del export sin referencia de orden: no pertenecen a ninguna
    # suscripcion y agrupadas formarian una fila fantasma con orden vacia.
    df_local = df_local.dropna(subset=["orden_producto"])

    # `activo` solo existe en los exports nuevos: se trabaja con lo que venga.
    meta_cols = [c for c in SUBSCRIPTIONS_METADATA_COLS if c in df_local.columns]

    df_local[meta_cols] = (
        df_local.groupby("orden_producto")[meta_cols]
        .ffill()
    )

    agg_rules = {col: "first" for col in meta_cols}
    if "producto" in df_local.columns:
        agg_rules["producto"] = _first_matching_plan

    df_consolidated = df_local.groupby(
        "orden_producto", as_index=False
    ).agg(agg_rules)
    df_consolidated = df_consolidated.dropna(subset=["orden_producto"])

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

    with db_tool.get_connection() as conn:
        with conn.cursor() as cur:
            for t_name, d_frame in [
                (TableNames.SUBSCRIPTIONS_B, df_local),
                (TableNames.SUBSCRIPTIONS, df_consolidated),
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
                # El export puede traer columnas nuevas (p. ej. `activo`) sobre
                # una tabla ya creada: se agregan antes de copiar.
                for col in d_frame.columns:
                    cur.execute(
                        sql.SQL(
                            "ALTER TABLE {schema_table}"
                            " ADD COLUMN IF NOT EXISTS {c} text"
                        ).format(
                            schema_table=sql.Identifier(DB_SCHEMA, t_name),
                            c=sql.Identifier(col),
                        )
                    )
                cur.execute(
                    sql.SQL("TRUNCATE TABLE {schema_table}").format(
                        schema_table=sql.Identifier(DB_SCHEMA, t_name)
                    )
                )
            conn.commit()

    db_tool.copy_dataframe(df_local, TableNames.SUBSCRIPTIONS_B)
    db_tool.copy_dataframe(df_consolidated, TableNames.SUBSCRIPTIONS)

    return len(df_consolidated)


def import_logs_csv(csv_path: str) -> int:
    # ✅ Lectura segura para logs también
    df_logs = pd.read_csv(
        csv_path, 
        dtype=str, 
        keep_default_na=False, 
        low_memory=False, 
        encoding="utf-8-sig"
    )
    df_logs.rename(columns=LOGS_COLUMN_MAPPING, inplace=True)

    missing_cols = [
        c for c in LOGS_REQUIRED_COLS if c not in df_logs.columns
    ]
    if missing_cols:
        raise ValueError(
            f"El CSV no contiene las columnas requeridas: {missing_cols}"
        )

    df_logs = _blank_to_nan(df_logs)
    for col in df_logs.columns:
        df_logs[col] = (
            df_logs[col]
            .astype(str)
            .replace(["nan", "None", "<NA>"], None)
        )

    db_tool = DBConnector()
    with db_tool.get_connection() as conn:
        with conn.cursor() as cur:
            col_defs = [
                sql.SQL("{} text").format(sql.Identifier(c))
                for c in df_logs.columns
            ]
            cur.execute(
                sql.SQL(
                    "CREATE TABLE IF NOT EXISTS"
                    " {schema_table} ({fields})"
                ).format(
                    schema_table=sql.Identifier(DB_SCHEMA, TableNames.SUBSCRIPTIONS_LOGS),
                    fields=sql.SQL(", ").join(col_defs),
                )
            )
            cur.execute(
                sql.SQL("TRUNCATE TABLE {schema_table}").format(
                    schema_table=sql.Identifier(
                        DB_SCHEMA, TableNames.SUBSCRIPTIONS_LOGS
                    )
                )
            )
        conn.commit()
    db_tool.copy_dataframe(df_logs, TableNames.SUBSCRIPTIONS_LOGS)

    return len(df_logs)