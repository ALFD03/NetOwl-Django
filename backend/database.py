"""
Módulo de conexión y operaciones con la base de datos PostgreSQL.

Dependencias esperadas:
- `psycopg2` con sus extensiones `pool`, `sql` y `execute_values`.
- `pandas`: Lectura de tablas a DataFrames.
- Variables de entorno: `HOST`, `DB`, `USER`, `PASS`, `PORT` (default 5432).
- `config.DB_SCHEMA`: Esquema donde se encuentran las tablas.

Proporciona la clase `DBConnector` que maneja un pool de conexiones
y operaciones comunes: lectura de tablas, guardado histórico con
creación automática de columnas, y copia masiva mediante COPY.
"""

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
    """
    Administra la conexión a PostgreSQL y las operaciones de E/S de datos.

    Utiliza un pool de conexiones SimpleConnectionPool (1-10 conexiones)
    para reutilizar conexiones de forma eficiente. Expone métodos para
    leer tablas completas, guardar DataFrames con metadatos de período,
    y copiar datos masivamente mediante COPY.

    Toda operación que requiera una conexión la obtiene del pool y la
    devuelve automáticamente al finalizar mediante el context manager.
    """

    def __init__(self):
        """Inicializa el pool de conexiones a partir de variables de entorno."""
        self.conn_params: Dict[str, Any] = {
            "host": os.getenv("HOST"),
            "database": os.getenv("DB"),
            "user": os.getenv("DB_USER"),
            "password": os.getenv("PASS"),
            "port": os.getenv("PORT", "5432"),
        }
        self.pool = pool.SimpleConnectionPool(1, 10, **self.conn_params)

    @contextmanager
    def get_connection(self):
        """
        Context manager que obtiene una conexión del pool y la devuelve al salir.

        Uso:
            with db.get_connection() as conn:
                conn.cursor().execute(...)

        Garantiza que la conexión se devuelva al pool incluso si hay errores.
        """
        conn = self.pool.getconn()
        try:
            yield conn
        finally:
            self.pool.putconn(conn)

    def connect(self):
        """
        Crea una conexión directa (no del pool) a la base de datos.

        Útil para operaciones que requieren una conexión dedicada.

        Returns:
            Conexión psycopg2.
        """
        return psycopg2.connect(**self.conn_params)

    def read_table(
        self, table_name: str, columns: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """
        Lee una tabla completa de la base de datos y la retorna como DataFrame.

        Construye dinámicamente la consulta SELECT respetando el esquema
        configurado y, opcionalmente, seleccionando sólo ciertas columnas.

        Args:
            table_name: Nombre de la tabla (sin esquema).
            columns: Lista opcional de columnas a seleccionar.
                     Si es None, se seleccionan todas (*).

        Returns:
            DataFrame con los datos de la tabla.
        """
        # Construye la cláusula SELECT con identificadores seguros (SQL injection safe)
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
        """
        Guarda un DataFrame en una tabla histórica, creando columnas si es necesario.

        Flujo:
        1. Agrega columnas `periodo_reporte` y opcionalmente `metodo_calculo`.
        2. Sanitiza nombres de columnas (caracteres especiales → texto).
        3. Crea la tabla si no existe.
        4. Agrega columnas faltantes (ALTER TABLE ADD COLUMN IF NOT EXISTS).
        5. Elimina registros previos del mismo período (y método si aplica).
        6. Inserta los datos mediante `execute_values`.

        Args:
            df: DataFrame con los datos a persistir.
            table_name: Nombre de la tabla destino.
            periodo: Etiqueta del período (se agrega como columna).
            metodo: Opcional, identificador del método de cálculo.
        """
        if df.empty:
            return
        df = df.copy()
        df["periodo_reporte"] = periodo
        if metodo:
            df["metodo_calculo"] = metodo

        # Sanitiza nombres de columnas: reemplaza % por "pct", espacios por _
        df.columns = [
            c.replace("%", "pct").replace(" ", "_").lower()
            for c in df.columns
        ]
        # Elimina cualquier carácter que no sea alfanumérico ni guion bajo
        df.columns = [re.sub(r"[^a-z0-9_]", "", c) for c in df.columns]

        # Convierte todos los valores a texto para evitar errores de tipos
        for col in df.columns:
            df[col] = df[col].apply(
                lambda x: str(x) if pd.notna(x) else None
            )

        columns = list(df.columns)
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # CREATE TABLE IF NOT EXISTS con columnas tipo text
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

                # Agrega columnas nuevas que no existían antes
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

                # Elimina datos previos del mismo período (y método si especificado)
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

                # Inserta todas las filas con execute_values (INSERT múltiple eficiente)
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
        """
        Copia un DataFrame a una tabla PostgreSQL usando COPY (carga masiva).

        Convierte el DataFrame a formato TSV en memoria y ejecuta COPY
        con delimitador de tabulación y representación NULL como 'NULL'.

        Args:
            df: DataFrame con los datos a copiar.
            table_name: Nombre de la tabla destino (con esquema).
        """
        # Serializa el DataFrame a TSV en un buffer en memoria
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

                # COPY FROM STDIN con formato CSV (tab-separated)
                copy_query = sql.SQL(
                    "COPY {table} ({fields}) FROM STDIN WITH"
                    " (FORMAT csv, DELIMITER '\t', NULL 'NULL')"
                ).format(table=table_id, fields=cols_id)

                cur.copy_expert(copy_query, output)
            conn.commit()
