"""Acceso a Postgres para la analitica: pool de conexiones y puente a pandas.

Es la capa que usa todo `services/*/analytics/`; el ORM de Django se reserva
para los modelos (usuarios, permisos, bitacora, trabajos y catalogos). La razon
de tener dos capas es que las tablas de resultados cambian de forma con cada
metrica nueva: `save_historico` las crea y las amplia sobre la marcha, con
todas las columnas `text`, lo que con el ORM seria una migracion por columna.

Todas las tablas se cualifican con `DB_SCHEMA`, que identifica el entorno.
"""

from __future__ import annotations

import io
import json
import re
from contextlib import contextmanager
from typing import Any

import pandas as pd
import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import execute_values

from .config import DB_SCHEMA, TableNames
from .vault import get_config


class DBConnector:
    """Pool de conexiones a Postgres con las operaciones que usa la analitica.

    Lectura a DataFrame, escritura masiva y creacion dinamica de tablas. Se
    construye con las credenciales que devuelve Vault y mantiene entre 1 y 10
    conexiones abiertas.
    """

    def __init__(self):
        db = get_config().db
        self.conn_params: dict[str, Any] = {
            "host": db.DB_HOST,
            "database": db.DB_NAME,
            "user": db.DB_USER,
            "password": db.DB_PASSWORD,
            "port": str(db.DB_PORT),
            "sslmode": db.DB_SSLMODE,
        }
        self.pool = pool.SimpleConnectionPool(1, 10, **self.conn_params)
        self._schema_cache: dict[str, set] = {}

    @contextmanager
    def get_connection(self):
        """Presta una conexion del pool y la devuelve al terminar.

        Hace `rollback()` ante cualquier excepcion antes de devolverla: sin eso la
        conexion vuelve al pool con la transaccion abortada y envenena todas las
        consultas que la reciban despues.
        """
        conn = self.pool.getconn()
        try:
            yield conn
        except Exception:
            # Sin rollback la conexion vuelve al pool con la transaccion
            # abortada y envenena las consultas siguientes.
            try:
                conn.rollback()
            except psycopg2.Error:
                pass
            raise
        finally:
            self.pool.putconn(conn)

    def read_table(
        self, table_name: str, columns: list[str] | None = None
    ) -> pd.DataFrame:
        """Lee una tabla entera (o solo `columns`) a un DataFrame."""
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
        filter_values: list[str] | None = None,
        columns: list[str] | None = None,
    ) -> pd.DataFrame:
        """Como `read_table`, pero con `WHERE <filter_column> IN (...)`.

        Sin `filter_values` se comporta exactamente como `read_table`.
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
        params: list[Any] = []
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
        self, sql_query: str, params: list[Any] | None = None
    ) -> pd.DataFrame:
        """Ejecuta SQL libre y devuelve el resultado como DataFrame."""
        with self.get_connection() as conn:
            return pd.read_sql(sql_query, conn, params=params)

    def tabla_existe(self, table_name: str) -> bool:
        """Si la tabla existe en el esquema del entorno.

        Las tablas de analisis las crea `save_historico` sobre la marcha, asi
        que un entorno donde nunca termino un analisis no las tiene. Consultar
        una que no existe aborta la transaccion y sube como error 500; quien
        pregunta antes puede tratarlo por lo que es: todavia no hay datos.
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = %s
                    """,
                    (DB_SCHEMA, table_name),
                )
                return cur.fetchone() is not None

    def save_historico(
        self,
        df: pd.DataFrame,
        table_name: str,
        periodo: str,
        metodo: str | None = None,
    ):
        """Guarda el resultado de un calculo, reemplazando el del mismo periodo.

        Es el escritor principal de la analitica y hace cuatro cosas:

        1. Anade `periodo_reporte` (y `metodo_calculo` si se pasa `metodo`) y sanea
           los nombres de columna a `[a-z0-9_]`.
        2. Crea la tabla si no existe y agrega las columnas que falten, todas `text`:
           asi una metrica nueva aparece sin necesidad de una migracion.
        3. Borra las filas de ese mismo periodo, de modo que recalcular un mes
           sustituya al calculo anterior en vez de duplicarlo.
        4. Inserta con `COPY` por encima de 1000 filas y con `execute_values` por
           debajo.

        Un DataFrame vacio no escribe nada.
        """
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
                params: list[Any] = [periodo]
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

    def save_day_metrics(
        self,
        periodo_reporte: str,
        dias: dict[str, Any],
        table: str = TableNames.ANALYZER_DAY_METRICS,
        escalares: dict[str, Any] | None = None,
    ):
        """Guarda una fila por mes en una tabla de metricas diarias.

        Columnas: periodo_reporte, las de `escalares` y dia1..dia31 (JSON en
        texto). Los dias no incluidos en `dias` conservan su valor previo, de
        modo que recalcular solo los dias nuevos del mes en curso no borra los
        anteriores.

        `table` la eligen los tres modulos que guardan cortes diarios
        -suscripciones, CRM y soporte-: la forma de la fila es la misma y lo
        unico que cambia es que en `escalares` viaje algo (el `activos_inicio`
        de suscripciones) o nada.
        """
        table_name = table
        day_cols = [f"dia{d}" for d in range(1, 32)]
        extra_cols = list(escalares or {})

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                col_defs = [
                    sql.SQL("{} text").format(sql.Identifier(c))
                    for c in ["periodo_reporte"] + extra_cols + day_cols
                ]
                cur.execute(
                    sql.SQL(
                        "CREATE TABLE IF NOT EXISTS {schema}.{table} ({fields})"
                    ).format(
                        schema=sql.Identifier(DB_SCHEMA),
                        table=sql.Identifier(table_name),
                        fields=sql.SQL(", ").join(col_defs),
                    )
                )
                for col in extra_cols + day_cols:
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
                # El nombre del indice se deriva de la tabla: en Postgres los
                # indices viven en el esquema, asi que un nombre fijo colisionaria
                # entre las tres tablas de metricas diarias. `analyzer_day_metrics`
                # conserva el suyo historico -ya existe en las bases desplegadas y
                # renombrarlo solo crearia un segundo indice identico-.
                indice = (
                    "ix_day_metrics_periodo"
                    if table_name == TableNames.ANALYZER_DAY_METRICS
                    else f"ix_{table_name}_periodo"
                )
                cur.execute(
                    sql.SQL(
                        "CREATE UNIQUE INDEX IF NOT EXISTS {idx}"
                        " ON {schema}.{table} (periodo_reporte)"
                    ).format(
                        idx=sql.Identifier(indice),
                        schema=sql.Identifier(DB_SCHEMA),
                        table=sql.Identifier(table_name),
                    )
                )

                dia_cols = sorted(dias.keys(), key=lambda c: int(c[3:]))
                columnas = ["periodo_reporte"] + extra_cols + dia_cols
                valores: list[Any] = [periodo_reporte]
                valores.extend(str((escalares or {})[c]) for c in extra_cols)
                valores.extend(
                    json.dumps(dias[c], ensure_ascii=False, separators=(",", ":"))
                    for c in dia_cols
                )

                actualizables = [c for c in columnas if c != "periodo_reporte"]
                cur.execute(
                    sql.SQL(
                        "INSERT INTO {schema}.{table} ({fields}) VALUES ({ph})"
                        " ON CONFLICT (periodo_reporte) DO UPDATE SET {sets}"
                    ).format(
                        schema=sql.Identifier(DB_SCHEMA),
                        table=sql.Identifier(table_name),
                        fields=sql.SQL(", ").join(
                            sql.Identifier(c) for c in columnas
                        ),
                        ph=sql.SQL(", ").join(sql.Placeholder() * len(columnas)),
                        sets=sql.SQL(", ").join(
                            sql.SQL("{c} = EXCLUDED.{c}").format(
                                c=sql.Identifier(c)
                            )
                            for c in actualizables
                        ),
                    ),
                    valores,
                )
            conn.commit()

    def copy_dataframe(self, df: pd.DataFrame, table_name: str):
        """Carga masiva con `COPY`, sin crear ni truncar nada.

        La usan los importadores, que ya han preparado la tabla por su cuenta.
        """
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
