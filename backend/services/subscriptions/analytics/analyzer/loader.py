"""Lectura de las tablas que alimentan el analisis de churn.

Las cuatro se leen en paralelo porque son independientes entre si y la lectura
es el coste dominante de todo el analisis.
"""

from __future__ import annotations

import concurrent.futures

from core.config import DB_SCHEMA, TableNames

from ..free_plans import load_free_subs

ACTIVE_FLAG_COL = "activo"


def _table_columns(db, table_name):
    """Las columnas que hoy tiene una tabla, segun `information_schema`."""
    df = db.query(
        "SELECT column_name FROM information_schema.columns"
        " WHERE table_schema = %s AND table_name = %s",
        [DB_SCHEMA, table_name],
    )
    return set(df["column_name"])


def load_data(db):
    """Suscripciones, los dos formatos de log y la base de planes gratuitos.

    `activo` solo se pide si la tabla ya la tiene: es una columna que solo traen
    los exports nuevos.
    """
    print("Sincronizando con base de datos...")
    subs_cols = ["orden_producto", "fecha_inicio", "total", "estado"]
    # `activo` (false = suscripcion archivada) solo existe si el export ya lo trae.
    if ACTIVE_FLAG_COL in _table_columns(db, TableNames.SUBSCRIPTIONS):
        subs_cols.append(ACTIVE_FLAG_COL)
    logs_cols = ["orden", "fecha_log", "log", "estado"]
    logs_v15_cols = ["orden", "tipo", "categoria", "fecha"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_subs = executor.submit(db.read_table, TableNames.SUBSCRIPTIONS, subs_cols)
        future_logs = executor.submit(db.read_table, TableNames.SUBSCRIPTIONS_LOGS, logs_cols)
        future_logs_v15 = executor.submit(db.read_table, TableNames.SUBSCRIPTIONS_LOGS_V15, logs_v15_cols)
        # Los planes gratuitos no vienen en el export regular de suscripciones.
        future_free = executor.submit(load_free_subs, db)

        return (
            future_subs.result(),
            future_logs.result(),
            future_logs_v15.result(),
            future_free.result(),
        )
