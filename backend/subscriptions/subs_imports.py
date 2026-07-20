from __future__ import annotations
import json
import pathlib

import numpy as np
import pandas as pd
from psycopg2 import sql

from ..conf_config import DB_SCHEMA, TableNames
from ..database import DBConnector

SUBSCRIPTIONS_COLUMN_MAPPING = {
    "Líneas de la orden/Referencia de la orden": "orden_producto",
    "Líneas de la orden/Producto/Nombre": "producto",
    "Líneas de la orden/Cliente": "cliente",
    "Líneas de la orden/Cliente/CI/RIF": "ci",
    "Sucursal": "sucursal",
    "Zona": "zona",
    "Líneas de la orden/Cliente/Municipio": "municipio",
    "Tipo de Servicio": "tipo",
    "Estado de la Suscripción": "estado",
    "Campaña": "campanna",
    "Próxima Fecha de Factura": "fecha_factura",
    "Fecha de inicio": "fecha_inicio",
    "Tarifa": "tarifa",
    "Subtotal": "total",
    "Teléfono": "telefono",
    "Cliente/Phone 1": "phone",
    "Cliente/Phone 2": "phone2",
}

SUBSCRIPTIONS_METADATA_COLS = [
    "cliente", "ci", "sucursal", "zona", "municipio",
    "tipo", "estado", "campanna", "fecha_factura", "fecha_inicio",
    "tarifa", "total", "producto", "telefono", "phone", "phone2"
]

LOGS_COLUMN_MAPPING = {
    "Logs de Cambios/Suscripción": "orden",
    "Logs de Cambios/Fecha de Cambio": "fecha_log",
    "Logs de Cambios/Nota": "log",
    "Logs de Cambios/Estado Interno de Suscripción": "estado",
}

LOGS_REQUIRED_COLS = ["orden", "fecha_log", "log", "estado"]

PLANES_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent / "Planes.json"
)
_PLAN_SET = None


def _get_plan_set():
    global _PLAN_SET
    if _PLAN_SET is None:
        with open(PLANES_PATH, "r", encoding="utf-8") as f:
            planes_data = json.load(f)
        _PLAN_SET = {p["name"] for p in planes_data["planes"]}
    return _PLAN_SET


def _clean_empty_strings(x):
    if isinstance(x, str) and x.strip() == "":
        return np.nan
    return x


def _first_matching_plan(values):
    plan_set = _get_plan_set()
    for v in values.dropna().unique():
        if v in plan_set:
            return v
    return None


def import_subscriptions_csv(csv_path: str) -> int:
    df_local = pd.read_csv(csv_path)
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

    df_local = df_local.apply(_clean_empty_strings)
    # if "producto_nombre" in df_local.columns:
    #     df_local["producto"] = df_local["producto_nombre"].fillna(df_local["producto"])

    df_local[SUBSCRIPTIONS_METADATA_COLS] = (
        df_local.groupby("orden_producto")[SUBSCRIPTIONS_METADATA_COLS]
        .ffill()
    )

    agg_rules = {col: "first" for col in SUBSCRIPTIONS_METADATA_COLS}
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
    df_logs = pd.read_csv(csv_path)
    df_logs.rename(columns=LOGS_COLUMN_MAPPING, inplace=True)

    missing_cols = [
        c for c in LOGS_REQUIRED_COLS if c not in df_logs.columns
    ]
    if missing_cols:
        raise ValueError(
            f"El CSV no contiene las columnas"
            f" requeridas: {missing_cols}"
        )

    df_logs = df_logs.apply(_clean_empty_strings)
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
