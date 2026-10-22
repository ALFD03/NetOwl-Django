"""Acceso a Postgres para la analitica: pool de conexiones y puente a pandas.

Es la capa que usa todo `services/*/analytics/`; el ORM de Django se reserva
para los modelos (usuarios, permisos, bitacora, trabajos y catalogos). La razon
de tener dos capas es que las tablas de resultados cambian de forma con cada
metrica nueva: `save_historico` las crea y las amplia sobre la marcha, con
todas las columnas `text`, lo que con el ORM seria una migracion por columna.

Todas las tablas se cualifican con `DB_SCHEMA`, que identifica el entorno.
"""

from __future__ import annotations

import atexit
import io
import json
import logging
import os
import re
import threading
import time
from contextlib import contextmanager
from typing import Any

import pandas as pd
import psycopg2
from psycopg2 import extensions, sql
from psycopg2.extras import execute_values

from .config import DB_SCHEMA, TableNames
from .vault import get_config

logger = logging.getLogger(__name__)

# Conexiones ociosas que el proceso conserva para reutilizar. Un worker de
# gunicorn atiende una peticion a la vez y casi nunca anida mas de dos
# prestamos; un analisis del worker de Celery, alguno mas. Por encima de este
# numero las conexiones se abren igual, pero se cierran al devolverse.
POOL_MAX_OCIOSAS = int(os.getenv("DB_POOL_MAX_OCIOSAS", "4"))

# Una conexion que lleva mas de esto sin usarse se cierra en vez de prestarse:
# un cortafuegos o el propio Postgres pueden haberla cortado por inactividad, y
# descubrirlo a mitad de una consulta cuesta un 500.
POOL_MAX_SEGUNDOS_OCIOSA = int(os.getenv("DB_POOL_MAX_SEGUNDOS_OCIOSA", "300"))

# Errores que dejan la conexion inservible (el servidor la corto, se reinicio,
# la red cayo). Una conexion que los levanto se descarta, no vuelve al pool.
_ERRORES_DE_CONEXION = (psycopg2.OperationalError, psycopg2.InterfaceError)


class _PoolDelProceso:
    """Las conexiones que reutiliza un proceso, compartidas por todos sus `DBConnector`.

    Antes cada `DBConnector()` levantaba su propio `SimpleConnectionPool`, y
    como se instancia en cada funcion de consulta (58 sitios), cada peticion
    abria conexiones TCP+TLS nuevas y las dejaba al recolector de basura, sin
    reutilizar ninguna. Ahora hay un pool por proceso:

    * **Prestar** saca una conexion ociosa y sana, o abre una nueva. Nunca
      falla por agotamiento: si todas estan prestadas se abre otra, porque el
      `PoolError` de psycopg2 en ese caso convertia una consulta anidada en un
      500.
    * **Devolver** deja la conexion *sin transaccion abierta*. `pd.read_sql`
      abre una y nunca la cierra; con conexiones reutilizadas eso dejaba
      sesiones "idle in transaction" sujetando un `AccessShareLock`, y el
      `TRUNCATE` de la siguiente importacion se quedaba esperando para siempre.
    * Solo guarda `POOL_MAX_OCIOSAS`; el resto se cierra al volver.
    """

    def __init__(self, parametros: dict[str, Any]):
        self.pid = os.getpid()
        self._parametros = parametros
        self._ociosas: list[tuple[Any, float]] = []
        self._lock = threading.Lock()

    def prestar(self):
        """Una conexion lista para usar: ociosa y reciente, o nueva."""
        ahora = time.monotonic()
        while True:
            with self._lock:
                if not self._ociosas:
                    break
                conn, desde = self._ociosas.pop()
            if conn.closed or ahora - desde > POOL_MAX_SEGUNDOS_OCIOSA:
                self._cerrar(conn)
                continue
            return conn
        return psycopg2.connect(**self._parametros)

    def devolver(self, conn, descartar: bool = False) -> None:
        """Devuelve la conexion al pool, o la cierra si no se puede reutilizar."""
        if conn.closed:
            return
        if descartar:
            self._cerrar(conn)
            return
        try:
            if conn.get_transaction_status() != extensions.TRANSACTION_STATUS_IDLE:
                conn.rollback()
        except psycopg2.Error:
            self._cerrar(conn)
            return
        with self._lock:
            if len(self._ociosas) < POOL_MAX_OCIOSAS:
                self._ociosas.append((conn, time.monotonic()))
                return
        self._cerrar(conn)

    def cerrar_todas(self) -> None:
        """Cierra las ociosas. Las prestadas se cierran solas al devolverse."""
        with self._lock:
            ociosas, self._ociosas = self._ociosas, []
        for conn, _ in ociosas:
            self._cerrar(conn)

    @staticmethod
    def _cerrar(conn) -> None:
        try:
            conn.close()
        except psycopg2.Error:
            pass


_pool: _PoolDelProceso | None = None
_pool_lock = threading.Lock()
# Los pools que un proceso hereda al hacer fork (prefork de Celery, gunicorn con
# `--preload`). Sus sockets son del padre: cerrarlos -o dejar que el recolector
# los cierre- manda un Terminate que mata la sesion del padre. Se conservan
# referenciados y nunca se tocan.
_heredados: list[_PoolDelProceso] = []


def _pool_del_proceso(parametros: dict[str, Any]) -> _PoolDelProceso:
    """El pool de este proceso, creado la primera vez que se pide."""
    global _pool
    pid = os.getpid()
    if _pool is not None and _pool.pid == pid:
        return _pool
    with _pool_lock:
        if _pool is not None and _pool.pid != pid:
            _heredados.append(_pool)
            _pool = None
        if _pool is None:
            _pool = _PoolDelProceso(parametros)
        return _pool


@atexit.register
def _cerrar_pool_al_salir() -> None:
    if _pool is not None and _pool.pid == os.getpid():
        _pool.cerrar_todas()


class DBConnector:
    """Acceso a Postgres para la analitica sobre el pool del proceso.

    Lectura a DataFrame, escritura masiva y creacion dinamica de tablas.
    Instanciarlo es barato: no abre nada, todas las instancias del proceso
    comparten las mismas conexiones (ver `_PoolDelProceso`).
    """

    def __init__(self):
        db = get_config().db
        self.pool = _pool_del_proceso({
            "host": db.DB_HOST,
            "database": db.DB_NAME,
            "user": db.DB_USER,
            "password": db.DB_PASSWORD,
            "port": str(db.DB_PORT),
            "sslmode": db.DB_SSLMODE,
            # Todo se cualifica ya con DB_SCHEMA; fijar el search_path es la
            # red: una consulta sin cualificar tampoco puede alcanzar `public`.
            "options": f"-c search_path={DB_SCHEMA}",
            "application_name": f"netowl_{DB_SCHEMA}",
            # Sin esto una conexion cortada por la red se queda esperando lo
            # que diga el TCP del sistema (minutos) antes de fallar.
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 60,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        })
        self._schema_cache: dict[str, set] = {}

    @contextmanager
    def get_connection(self):
        """Presta una conexion del pool del proceso y la devuelve al terminar.

        Ante cualquier excepcion hace `rollback()` antes de devolverla: sin eso
        la conexion vuelve con la transaccion abortada y envenena las consultas
        siguientes. Si el error es de la propia conexion, se descarta. Al
        devolverla sin error tambien se cierra cualquier transaccion que quien
        la uso dejara abierta (ver `_PoolDelProceso.devolver`).
        """
        conn = self.pool.prestar()
        descartar = False
        try:
            yield conn
        except _ERRORES_DE_CONEXION:
            descartar = True
            raise
        except Exception:
            try:
                conn.rollback()
            except psycopg2.Error:
                descartar = True
            raise
        finally:
            self.pool.devolver(conn, descartar=descartar)

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

    def columnas(self, table_name: str) -> set[str]:
        """Las columnas de una tabla del esquema del entorno (vacio si no existe).

        Las tablas de importacion ganan columnas cuando el export las trae
        (`ADD COLUMN IF NOT EXISTS`), asi que una columna nueva del export no
        esta en un entorno que todavia no ha importado con ella. Quien la
        necesita pregunta antes, en vez de recibir un error de SQL.
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    """,
                    (DB_SCHEMA, table_name),
                )
                return {fila[0] for fila in cur.fetchall()}

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

    @staticmethod
    def copiar(cur, df: pd.DataFrame, table_name: str) -> None:
        """`COPY` del DataFrame con el cursor de quien llama, **sin confirmar**.

        Es la pieza de los importadores: el vaciado de la tabla y la carga tienen
        que ir en la misma transaccion. Antes el `TRUNCATE` se confirmaba solo y
        el `COPY` iba despues en otra conexion, asi que un fallo a mitad de carga
        -un CSV con una fila rota, el worker de gunicorn muerto por tiempo o por
        memoria- dejaba la tabla vacia o a medias, y esas tablas no se pueden
        reconstruir sin volver a importar. Con las dos cosas en una transaccion,
        un fallo deja la tabla exactamente como estaba.
        """
        output = io.StringIO()
        df.to_csv(
            output, sep="\t", header=False, index=False, na_rep="NULL"
        )
        output.seek(0)
        copy_query = sql.SQL(
            "COPY {table} ({fields}) FROM STDIN WITH"
            " (FORMAT csv, DELIMITER '\t', NULL 'NULL')"
        ).format(
            table=sql.Identifier(DB_SCHEMA, table_name),
            fields=sql.SQL(", ").join(map(sql.Identifier, df.columns)),
        )
        cur.copy_expert(copy_query, output)

    def copy_dataframe(self, df: pd.DataFrame, table_name: str):
        """Carga masiva con `COPY` en una transaccion propia, sin crear ni truncar nada.

        Para cargar sobre una tabla que se acaba de vaciar use `copiar` dentro de
        la misma transaccion del vaciado.
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                self.copiar(cur, df, table_name)
            conn.commit()
