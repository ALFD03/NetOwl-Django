from __future__ import annotations
import io
import os
import re
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import pandas as pd
import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import execute_values

from .conf_config import DB_SCHEMA


class DBConnector:
    
    def __init__(self):
        self.conn_params: Dict[str, Any] = {
            "host": os.getenv("HOST"),
            "database": os.getenv("DB"),
            "user": os.getenv("DB_USER"),
            "password": os.getenv("PASS"),
            "port": os.getenv("PORT", "5432"),
            "sslmode": os.getenv("DB_SSLMODE", "prefer"),
        }
        self.pool = pool.SimpleConnectionPool(1, 10, **self.conn_params)
        self._schema_cache: Dict[str, set] = {}

    @contextmanager
    def get_connection(self):
        conn = self.pool.getconn()
        try:
            yield conn
        finally:
            self.pool.putconn(conn)

    def connect(self):
        return psycopg2.connect(**self.conn_params)

    def read_table(
        self, table_name: str, columns: Optional[List[str]] = None
    ) -> pd.DataFrame:
        cols_sql = (
            sql.SQL("*")
            if columns is None
            else sql.SQL(", ").join(sql.Identifier(col) for col in columns)
        )
        query = sql.SQL(
            "SELECT {cols} FROM {schema}.{table}"
        ).format(
            cols=cols_sql,
            schema=sql.Identifier(DB_SCHEMA),
            table=sql.Identifier(table_name),
        )
        with self.get_connection() as conn:
            return pd.read_sql(query.as_string(conn), conn)

    def read_table_filtered(
        self,
        table_name: str,
        filter_column: str,
        filter_values: Optional[List[str]] = None,
        columns: Optional[List[str]] = None,
    ) -> pd.DataFrame:
        cols_sql = (
            sql.SQL("*")
            if columns is None
            else sql.SQL(", ").join(sql.Identifier(col) for col in columns)
        )
        query = sql.SQL(
            "SELECT {cols} FROM {schema}.{table}"
        ).format(
            cols=cols_sql,
            schema=sql.Identifier(DB_SCHEMA),
            table=sql.Identifier(table_name),
        )
        params: List[Any] = []
        if filter_values:
            placeholders = sql.SQL(", ").join(sql.Placeholder() for _ in filter_values)
            query = sql.SQL(
                "SELECT {cols} FROM {schema}.{table} WHERE {fcol} IN ({placeholders})"
            ).format(
                cols=cols_sql,
                schema=sql.Identifier(DB_SCHEMA),
                table=sql.Identifier(table_name),
                fcol=sql.Identifier(filter_column),
                placeholders=placeholders,
            )
            params = filter_values
        with self.get_connection() as conn:
            return pd.read_sql(query.as_string(conn), conn, params=params)

    def query(
        self, sql_query: str, params: Optional[List[Any]] = None
    ) -> pd.DataFrame:
        with self.get_connection() as conn:
            return pd.read_sql(sql_query, conn, params=params)

    def save_historico(
        self,
        df: pd.DataFrame,
        table_name: str,
        periodo: str,
        metodo: Optional[str] = None,
    ):
        if df.empty:
            return
        df = df.copy()
        df["periodo_reporte"] = periodo
        if metodo:
            df["metodo_calculo"] = metodo

        df.columns = [
            c.replace("%", "pct").replace(" ", "_").lower()
            for c in df.columns
        ]
        df.columns = [re.sub(r"[^a-z0-9_]", "", c) for c in df.columns]

        # Normalización vectorial rápida
        for col in df.columns:
            if df[col].dtype == object or pd.api.types.is_string_dtype(df[col]):
                df[col] = df[col].where(df[col].notna(), None)
            else:
                df[col] = df[col].astype(str).where(df[col].notna(), None)
                df[col] = df[col].replace("nan", None)

        columns = list(df.columns)
        known_columns = self._schema_cache.get(table_name)
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                if known_columns is None:
                    col_defs = [
                        sql.SQL("{} text").format(sql.Identifier(c))
                        for c in columns
                    ]
                    cur.execute(
                        sql.SQL(
                            "CREATE TABLE IF NOT EXISTS"
                            " {schema}.{table} ({fields})"
                        ).format(
                            schema=sql.Identifier(DB_SCHEMA),
                            table=sql.Identifier(table_name),
                            fields=sql.SQL(", ").join(col_defs),
                        )
                    )

                    for col in columns:
                        cur.execute(
                            sql.SQL(
                                "ALTER TABLE {schema}.{table}"
                                " ADD COLUMN IF NOT EXISTS {c} text"
                            ).format(
                                schema=sql.Identifier(DB_SCHEMA),
                                table=sql.Identifier(table_name),
                                c=sql.Identifier(col),
                            )
                        )

                    self._schema_cache[table_name] = set(columns)

                # Limpieza de registros previos del mismo periodo
                delete_q = (
                    "DELETE FROM {schema}.{table}"
                    " WHERE periodo_reporte = %s"
                )
                params: List[Any] = [periodo]
                if metodo:
                    delete_q += " AND metodo_calculo = %s"
                    params.append(metodo)
                cur.execute(
                    sql.SQL(delete_q).format(
                        schema=sql.Identifier(DB_SCHEMA),
                        table=sql.Identifier(table_name),
                    ),
                    params,
                )

                # OPTIMIZACIÓN CRÍTICA: Conmutación a COPY para volumen masivo
                if len(df) > 1000:
                    output = io.StringIO()
                    df_to_copy = df.copy()
                    # Sustituir None por string 'NULL' requerido por el motor COPY
                    for col in df_to_copy.columns:
                        df_to_copy[col] = df_to_copy[col].fillna("NULL")
                        
                    df_to_copy.to_csv(
                        output, sep="\t", header=False, index=False, na_rep="NULL"
                    )
                    output.seek(0)

                    table_id = sql.Identifier(DB_SCHEMA, table_name)
                    cols_id = sql.SQL(", ").join(map(sql.Identifier, columns))

                    copy_query = sql.SQL(
                        "COPY {table} ({fields}) FROM STDIN WITH"
                        " (FORMAT csv, DELIMITER '\t', NULL 'NULL')"
                    ).format(table=table_id, fields=cols_id)

                    cur.copy_expert(copy_query, output)
                else:
                    # Para datasets pequeños (< 1000 filas) mantenemos execute_values por simplicidad
                    insert_sql = sql.SQL(
                        "INSERT INTO {schema}.{table} ({fields}) VALUES %s"
                    ).format(
                        schema=sql.Identifier(DB_SCHEMA),
                        table=sql.Identifier(table_name),
                        fields=sql.SQL(", ").join(
                            sql.Identifier(c) for c in columns
                        ),
                    )
                    execute_values(
                        cur,
                        insert_sql.as_string(conn),
                        [
                            tuple(row)
                            for row in df.itertuples(index=False, name=None)
                        ],
                    )
            conn.commit()

    def copy_dataframe(self, df: pd.DataFrame, table_name: str):
        output = io.StringIO()
        df.to_csv(
            output, sep="\t", header=False, index=False, na_rep="NULL"
        )
        output.seek(0)

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                table_id = sql.Identifier(DB_SCHEMA, table_name)
                cols_id = sql.SQL(", ").join(
                    map(sql.Identifier, df.columns)
                )

                copy_query = sql.SQL(
                    "COPY {table} ({fields}) FROM STDIN WITH"
                    " (FORMAT csv, DELIMITER '\t', NULL 'NULL')"
                ).format(table=table_id, fields=cols_id)

                cur.copy_expert(copy_query, output)
            conn.commit()
