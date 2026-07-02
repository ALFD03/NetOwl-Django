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
        """
        Inicializa el pool de conexiones a partir de variables de entorno.

        Lee ``HOST``, ``DB``, ``DB_USER``, ``PASS`` y ``PORT`` (default 5432)
        del entorno y crea un ``SimpleConnectionPool`` de 1 a 10 conexiones.

        Raises:
            psycopg2.OperationalError: Si no se puede establecer la conexión
                inicial con la base de datos al crear el pool.
        """
        # Parámetros de conexión desde variables de entorno
        self.conn_params: Dict[str, Any] = {
            "host": os.getenv("HOST"),
            "database": os.getenv("DB"),
            "user": os.getenv("DB_USER"),
            "password": os.getenv("PASS"),
            "port": os.getenv("PORT", "5432"),
            "sslmode": os.getenv("DB_SSLMODE", "prefer"),
        }
        # Pool reutilizable de 1 a 10 conexiones simultáneas
        self.pool = pool.SimpleConnectionPool(1, 10, **self.conn_params)
        # Cache de esquemas: table_name → set de columnas conocidas
        self._schema_cache: Dict[str, set] = {}

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

        Útil para operaciones que requieren una conexión dedicada fuera
        del esquema del context manager.

        Returns:
            psycopg2 connection: Conexión activa a la base de datos.

        Raises:
            psycopg2.OperationalError: Si los parámetros de conexión
                son inválidos o el servidor no está accesible.
        """
        return psycopg2.connect(**self.conn_params)

    def read_table(
        self, table_name: str, columns: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """
        Lee una tabla completa de la base de datos y la retorna como DataFrame.

        Construye dinámicamente la consulta SELECT respetando el esquema
        configurado y, opcionalmente, seleccionando sólo ciertas columnas.
        Usa identificadores SQL parametrizados para prevenir inyección SQL.

        Args:
            table_name: Nombre de la tabla (sin esquema).
            columns: Lista opcional de columnas a seleccionar.
                     Si es None, se seleccionan todas (*).

        Returns:
            pd.DataFrame: DataFrame con los datos de la tabla.

        Raises:
            pd.io.sql.DatabaseError: Si la tabla no existe o hay error
                en la consulta SQL.
            psycopg2.OperationalError: Si la conexión falla.
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

    def read_table_filtered(
        self,
        table_name: str,
        filter_column: str,
        filter_values: Optional[List[str]] = None,
        columns: Optional[List[str]] = None,
    ) -> pd.DataFrame:
        """
        Lee una tabla con filtro WHERE col IN (...).

        Args:
            table_name: Nombre de la tabla (sin esquema).
            filter_column: Nombre de la columna para filtrar.
            filter_values: Lista de valores para la cláusula IN.
            columns: Lista opcional de columnas a seleccionar.
                     Si es None, se seleccionan todas (*).

        Returns:
            pd.DataFrame con los datos filtrados.
        """
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
        """
        Ejecuta una consulta SQL arbitraria con parámetros y retorna DataFrame.

        Args:
            sql_query: Consulta SQL con placeholders %s para parámetros.
            params: Lista de parámetros para la consulta.

        Returns:
            pd.DataFrame: Resultado de la consulta.
        """
        with self.get_connection() as conn:
            return pd.read_sql(sql_query, conn, params=params)

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
        1. Agrega columnas ``periodo_reporte`` y opcionalmente ``metodo_calculo``.
        2. Sanitiza nombres de columnas (caracteres especiales → texto).
        3. Crea la tabla si no existe.
        4. Agrega columnas faltantes (``ALTER TABLE ADD COLUMN IF NOT EXISTS``).
        5. Elimina registros previos del mismo período (y método si aplica).
        6. Inserta los datos mediante ``execute_values``.

        Si el DataFrame está vacío, la función retorna sin ejecutar ninguna
        operación de base de datos.

        Args:
            df: DataFrame con los datos a persistir.
            table_name: Nombre de la tabla destino (sin esquema).
            periodo: Etiqueta del período (se agrega como columna).
            metodo: Opcional, identificador del método de cálculo.

        Raises:
            psycopg2.Error: Si alguna operación SQL falla (CREATE,
                ALTER, DELETE o INSERT).
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
        known_columns = self._schema_cache.get(table_name)
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                if known_columns is None:
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

                    self._schema_cache[table_name] = set(columns)

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

        Convierte el DataFrame a formato TSV en memoria y ejecuta ``COPY
        FROM STDIN`` con delimitador de tabulación y representación NULL
        como la cadena ``'NULL'``.

        Args:
            df: DataFrame con los datos a copiar.
            table_name: Nombre de la tabla destino (sin esquema; se
                        antepone ``DB_SCHEMA`` automáticamente).

        Raises:
            psycopg2.Error: Si la tabla no existe o hay error en la
                operación COPY.
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
