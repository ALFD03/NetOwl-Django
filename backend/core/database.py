"""Acceso a Postgres para la analítica: pool de conexiones y puente a pandas.

Es la capa que usa todo `services/*/analytics/`; el ORM de Django se reserva
para los modelos (usuarios, permisos, bitácora, trabajos y catálogos). La forma
de las tablas y el guardado estándar están en `core.tables`.

Todas las tablas se cualifican con `DB_SCHEMA`, que identifica el entorno.
"""

from __future__ import annotations

import atexit
import logging
import os
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import pandas as pd
import psycopg2
from psycopg2 import extensions, sql

from .config import DB_SCHEMA
from .vault import get_config

logger = logging.getLogger(__name__)

# Conexiones ociosas que el proceso conserva para reutilizar. Un worker de
# gunicorn atiende una petición a la vez y casi nunca anida más de dos
# préstamos; un análisis del worker de Celery, alguno más. Por encima de este
# número las conexiones se abren igual, pero se cierran al devolverse.
POOL_MAX_IDLE = int(os.getenv("DB_POOL_MAX_OCIOSAS", "4"))

# Una conexión que lleva más de esto sin usarse se cierra en vez de prestarse:
# un cortafuegos o el propio Postgres pueden haberla cortado por inactividad, y
# descubrirlo a mitad de una consulta cuesta un 500.
POOL_MAX_IDLE_SECONDS = int(os.getenv("DB_POOL_MAX_SEGUNDOS_OCIOSA", "300"))

# Errores que dejan la conexión inservible (el servidor la cortó, se reinició,
# la red cayó). Una conexión que los levantó se descarta, no vuelve al pool.
_CONNECTION_ERRORS = (psycopg2.OperationalError, psycopg2.InterfaceError)


class _ProcessPool:
    """Las conexiones que reutiliza un proceso, compartidas por todos sus `DBConnector`.

    * **Prestar** saca una conexión ociosa y sana, o abre una nueva. Nunca
      falla por agotamiento: si todas están prestadas se abre otra.
    * **Devolver** deja la conexión *sin transacción abierta*: `pd.read_sql`
      abre una y nunca la cierra, y una sesión "idle in transaction" sujeta un
      `AccessShareLock` que deja esperando al `TRUNCATE` de la siguiente
      importación.
    * Solo guarda `POOL_MAX_IDLE`; el resto se cierra al volver.
    """

    def __init__(self, params: dict[str, Any]):
        self.pid = os.getpid()
        self._params = params
        self._idle: list[tuple[Any, float]] = []
        self._lock = threading.Lock()

    def borrow(self):
        """Una conexión lista para usar: ociosa y reciente, o nueva."""
        now = time.monotonic()
        while True:
            with self._lock:
                if not self._idle:
                    break
                conn, since = self._idle.pop()
            if conn.closed or now - since > POOL_MAX_IDLE_SECONDS:
                self._close(conn)
                continue
            return conn
        return psycopg2.connect(**self._params)

    def give_back(self, conn, discard: bool = False) -> None:
        """Devuelve la conexión al pool, o la cierra si no se puede reutilizar."""
        if conn.closed:
            return
        if discard:
            self._close(conn)
            return
        try:
            if conn.get_transaction_status() != extensions.TRANSACTION_STATUS_IDLE:
                conn.rollback()
        except psycopg2.Error:
            self._close(conn)
            return
        with self._lock:
            if len(self._idle) < POOL_MAX_IDLE:
                self._idle.append((conn, time.monotonic()))
                return
        self._close(conn)

    def close_all(self) -> None:
        """Cierra las ociosas. Las prestadas se cierran solas al devolverse."""
        with self._lock:
            idle, self._idle = self._idle, []
        for conn, _ in idle:
            self._close(conn)

    @staticmethod
    def _close(conn) -> None:
        try:
            conn.close()
        except psycopg2.Error:
            pass


_pool: _ProcessPool | None = None
_pool_lock = threading.Lock()
# Los pools que un proceso hereda al hacer fork (prefork de Celery, gunicorn con
# `--preload`). Sus sockets son del padre: cerrarlos -o dejar que el recolector
# los cierre- manda un Terminate que mata la sesión del padre. Se conservan
# referenciados y nunca se tocan.
_inherited: list[_ProcessPool] = []


def _process_pool(params: dict[str, Any]) -> _ProcessPool:
    """El pool de este proceso, creado la primera vez que se pide."""
    global _pool
    pid = os.getpid()
    if _pool is not None and _pool.pid == pid:
        return _pool
    with _pool_lock:
        if _pool is not None and _pool.pid != pid:
            _inherited.append(_pool)
            _pool = None
        if _pool is None:
            _pool = _ProcessPool(params)
        return _pool


@atexit.register
def _close_pool_on_exit() -> None:
    if _pool is not None and _pool.pid == os.getpid():
        _pool.close_all()


class DBConnector:
    """Acceso a Postgres para la analítica sobre el pool del proceso.

    Instanciarlo es barato: no abre nada, todas las instancias del proceso
    comparten las mismas conexiones (ver `_ProcessPool`).
    """

    def __init__(self):
        db = get_config().db
        self.pool = _process_pool({
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
            # Sin esto una conexión cortada por la red se queda esperando lo
            # que diga el TCP del sistema (minutos) antes de fallar.
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 60,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        })

    @contextmanager
    def get_connection(self):
        """Presta una conexión del pool del proceso y la devuelve al terminar.

        Ante cualquier excepción hace `rollback()` antes de devolverla: sin eso
        la conexión vuelve con la transacción abortada y envenena las consultas
        siguientes. Si el error es de la propia conexión, se descarta.
        """
        conn = self.pool.borrow()
        discard = False
        try:
            yield conn
        except _CONNECTION_ERRORS:
            discard = True
            raise
        except Exception:
            try:
                conn.rollback()
            except psycopg2.Error:
                discard = True
            raise
        finally:
            self.pool.give_back(conn, discard=discard)

    @contextmanager
    def transaction(self) -> Iterator[Any]:
        """Un cursor cuya transacción se confirma al salir sin error (o se deshace)."""
        with self.get_connection() as conn:
            try:
                with conn.cursor() as cur:
                    yield cur
                conn.commit()
            except BaseException:
                # Deshacerla pudo deshacer también un `ensure` de `core.tables`.
                from .tables import forget_ensured

                forget_ensured()
                raise

    def read_table(self, table_name: str, columns: list[str] | None = None) -> pd.DataFrame:
        """Lee una tabla entera (o solo `columns`) a un DataFrame."""
        return self.read_table_filtered(table_name, "", None, columns)

    def read_table_filtered(
        self,
        table_name: str,
        filter_column: str,
        filter_values: list[Any] | None = None,
        columns: list[str] | None = None,
    ) -> pd.DataFrame:
        """Como `read_table`, con `WHERE <filter_column> IN (...)` si hay `filter_values`."""
        cols = sql.SQL("*") if columns is None else sql.SQL(", ").join(map(sql.Identifier, columns))
        query = sql.SQL("SELECT {} FROM {}").format(cols, sql.Identifier(DB_SCHEMA, table_name))
        params: list[Any] = []
        if filter_values:
            query += sql.SQL(" WHERE {} IN ({})").format(
                sql.Identifier(filter_column), sql.SQL(", ").join(sql.Placeholder() * len(filter_values)),
            )
            params = list(filter_values)
        with self.get_connection() as conn:
            return pd.read_sql(query.as_string(conn), conn, params=params or None)

    def query(self, sql_query: str, params: list[Any] | None = None) -> pd.DataFrame:
        """Ejecuta SQL libre y devuelve el resultado como DataFrame."""
        with self.get_connection() as conn:
            return pd.read_sql(sql_query, conn, params=params)

    def table_exists(self, table_name: str) -> bool:
        """Si la tabla existe en el esquema del entorno.

        Las tablas de análisis nacen con el primer cálculo, así que un entorno
        donde nunca terminó uno no las tiene: quien pregunta antes lo trata como
        "todavía no hay datos" en vez de recibir un 500.
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT to_regclass(%s)", [f'"{DB_SCHEMA}"."{table_name}"'])
                return cur.fetchone()[0] is not None

    def columns(self, table_name: str) -> set[str]:
        """Las columnas de una tabla del esquema del entorno (vacío si no existe)."""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = %s",
                    (DB_SCHEMA, table_name),
                )
                return {row[0] for row in cur.fetchall()}
