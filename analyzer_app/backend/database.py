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

from .config import DB_SCHEMA


class DBConnector:
    def __init__(self):
        self.conn_params: Dict[str, Any] = {
            "host": os.getenv("HOST"),
            "database": os.getenv("DB"),
            "user": os.getenv("USER"),
            "password": os.getenv("PASS"),
            "port": os.getenv("PORT", "5432"),
        }
        self.pool = pool.SimpleConnectionPool(1, 10, **self.conn_params)

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

        for col in df.columns:
            df[col] = df[col].apply(
                lambda x: str(x) if pd.notna(x) else None
            )

        columns = list(df.columns)
        with self.get_connection() as conn:
            with conn.cursor() as cur:
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
