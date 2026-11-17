"""Tablas de la analítica: su forma tipada y el guardado estándar.

Cada dominio declara sus tablas con `Table` (en su `analytics/tables.py`) y las
registra al arrancar. A partir de ahí todo se escribe igual:

- `ensure(cur, table)` crea la tabla o la pone al día: columnas que faltan,
  tipos que cambiaron (convierte el dato con un `USING` que tolera vacíos) e
  índices. `sync_all()` lo hace con todas en cada `migrate`.
- `replace(cur, table, df, **scope)` borra lo que había en ese alcance (un
  periodo, o la tabla entera sin alcance) y carga el DataFrame con `COPY`;
  `truncate` y `append` son sus dos mitades, para cargas por bloques.
- `upsert(cur, table, df)` inserta o actualiza por la clave única.

El DataFrame se ajusta antes a la tabla (`coerce`): mismas columnas, mismo orden
y tipos convertidos con `apply_types`, el mismo convertidor de la importación.
"""

from __future__ import annotations

import io
import json
import logging
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from psycopg2 import sql

from .config import ACTIVO_FALSE_TOKENS, ACTIVO_TRUE_TOKENS, DATE_FORMATS, DB_SCHEMA

logger = logging.getLogger(__name__)

TEXT = "text"
INT = "bigint"
INT32 = "integer"
SERIAL = "bigserial"
NUMERIC = "numeric"
FLOAT = "double precision"
DATE = "date"
TIMESTAMP = "timestamp without time zone"
BOOL = "boolean"
JSON = "jsonb"

_NULL = r"\N"


@dataclass(frozen=True)
class Table:
    """Una tabla de la analítica con sus columnas tipadas.

    `unique` (o, sin ella, `primary_key`) es la clave de `upsert`; `indexes`,
    los índices de lectura. Lo que no está declarado no existe: `ensure` quita
    las columnas que sobren. `schema` solo cambia para una tabla temporal
    (`pg_temp`); por defecto es el del entorno.
    """

    name: str
    columns: Mapping[str, str]
    primary_key: tuple[str, ...] = ()
    unique: tuple[str, ...] = ()
    indexes: tuple[tuple[str, ...], ...] = ()
    defaults: Mapping[str, str] = field(default_factory=dict)
    schema: str = DB_SCHEMA

    @property
    def ident(self) -> sql.Composable:
        return sql.Identifier(self.schema, self.name)


_REGISTRY: dict[str, Table] = {}
_ENSURED: set[str] = set()


def register(*tables: Table) -> None:
    """Registra las tablas de un dominio para `sync_all`."""
    for table in tables:
        _REGISTRY[table.name] = table


def forget_ensured() -> None:
    """Olvida qué tablas se pusieron al día: una transacción deshecha pudo deshacer un `ensure`."""
    _ENSURED.clear()


def registered() -> list[Table]:
    return list(_REGISTRY.values())


# --- Conversión de valores ----------------------------------------------------

_BLANKS = {"", "nan", "none", "null", "<na>", "nat"}


def blank_to_na(series: pd.Series) -> pd.Series:
    """Texto sin espacios de sobra y vacíos (`''`, `nan`, `None`…) como nulo."""
    if not (pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series)):
        return series
    text = series.astype("string").str.strip()
    return text.mask(text.str.lower().isin(_BLANKS)).astype(object).where(lambda s: s.notna(), None)


def to_datetime(series: pd.Series) -> pd.Series:
    """Fechas de los exports, probando `DATE_FORMATS` en orden sobre los valores únicos."""
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    text = blank_to_na(series)
    unique = pd.Series(pd.unique(text.dropna().astype(str)))
    parsed = pd.Series(pd.NaT, index=unique.index, dtype="datetime64[ns]")
    for fmt in DATE_FORMATS:
        pending = parsed.isna()
        if not pending.any():
            break
        parsed[pending] = pd.to_datetime(unique[pending], format=fmt, errors="coerce")
    pending = parsed.isna()
    if pending.any():
        parsed[pending] = pd.to_datetime(unique[pending], format="mixed", errors="coerce")
    return text.map(dict(zip(unique, parsed))).astype("datetime64[ns]")


def to_bool(series: pd.Series, unknown: bool | None = None) -> pd.Series:
    """Booleano de Odoo: `True` o vacío. Lo que no esté en ningún vocabulario vale `unknown`."""
    if pd.api.types.is_bool_dtype(series):
        return series.astype("boolean")
    text = series.astype("string").str.strip().str.lower().fillna("")
    out = pd.Series(unknown, index=series.index, dtype="boolean")
    out[text.isin(ACTIVO_TRUE_TOKENS)] = True
    out[text.isin(ACTIVO_FALSE_TOKENS)] = False
    return out


def apply_types(df: pd.DataFrame, types: Mapping[str, str]) -> pd.DataFrame:
    """Convierte las columnas de `df` que aparecen en `types` a su tipo."""
    out = df.copy()
    for col, kind in types.items():
        if col not in out.columns:
            continue
        s = out[col]
        if kind in (SERIAL,):
            continue
        if kind == TEXT:
            if pd.api.types.is_datetime64_any_dtype(s):
                s = s.dt.strftime("%Y-%m-%d %H:%M:%S")
            elif not (pd.api.types.is_object_dtype(s) or pd.api.types.is_string_dtype(s)):
                s = s.astype(object).where(s.notna(), None).map(lambda v: v if v is None else str(v))
            out[col] = blank_to_na(s)
        elif kind in (INT, INT32):
            out[col] = pd.to_numeric(blank_to_na(s), errors="coerce").round().astype("Int64")
        elif kind in (FLOAT, NUMERIC):
            out[col] = pd.to_numeric(blank_to_na(s), errors="coerce").astype("float64")
        elif kind == TIMESTAMP:
            out[col] = to_datetime(s)
        elif kind == DATE:
            out[col] = to_datetime(s).dt.normalize()
        elif kind == BOOL:
            out[col] = to_bool(s)
        elif kind == JSON:
            out[col] = s.map(_json_value)
    return out


def _finite(value: Any) -> Any:
    """El valor con `NaN` e infinitos como `None` (jsonb no los admite) y sin escalares de numpy."""
    if isinstance(value, dict):
        return {str(k): _finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def _json_value(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    if isinstance(value, str):
        return value if value.strip() else None
    return json.dumps(_finite(value), ensure_ascii=False, separators=(",", ":"), default=str)


def column_name(name: Any) -> str:
    """Nombre de columna de Postgres: minúsculas, `%` como `pct` y solo `[a-z0-9_]`."""
    return re.sub(r"[^a-z0-9_]", "", str(name).replace("%", "pct").replace(" ", "_").lower())


def coerce(df: pd.DataFrame, table: Table) -> pd.DataFrame:
    """El DataFrame con las columnas de la tabla, en su orden y con sus tipos.

    Las que no trae y tienen valor por defecto (o son `SERIAL`) se dejan fuera
    para que las rellene Postgres.
    """
    df = df.rename(columns=column_name)
    columns = [
        c for c, kind in table.columns.items()
        if c in df.columns or (kind != SERIAL and c not in table.defaults)
    ]
    return apply_types(df.reindex(columns=columns), table.columns)


# --- Esquema ------------------------------------------------------------------

_NUMBER = r"^\s*[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?\s*$"
_ISO_DATE = r"^\s*[0-9]{4}-[0-9]{2}-[0-9]{2}"


def _cast(column: str, current: str, target: str) -> sql.Composable:
    """Expresión `USING` que convierte una columna existente sin fallar con vacíos."""
    c = sql.Identifier(column)
    if current != "text":
        if target == "text":
            return sql.SQL("{}::text").format(c)
        if target == JSON:
            return sql.SQL("to_jsonb({})").format(c)
        return sql.SQL("{}::{}").format(c, sql.SQL(target))
    if target in (INT, FLOAT):
        value = "round(btrim({c})::numeric)::bigint" if target == INT else "btrim({c})::double precision"
        return sql.SQL("CASE WHEN {c} ~ {re} THEN " + value + " END").format(c=c, re=sql.Literal(_NUMBER))
    if target in (DATE, TIMESTAMP):
        return sql.SQL("CASE WHEN {c} ~ {re} THEN btrim({c})::{t} END").format(
            c=c, re=sql.Literal(_ISO_DATE), t=sql.SQL(target),
        )
    if target == BOOL:
        return sql.SQL(
            "CASE WHEN lower(btrim({c})) = ANY({yes}) THEN true"
            " WHEN lower(btrim({c})) = ANY({no}) THEN false END"
        ).format(c=c, yes=sql.Literal(sorted(ACTIVO_TRUE_TOKENS)), no=sql.Literal(sorted(ACTIVO_FALSE_TOKENS)))
    if target == JSON:
        return sql.SQL("CASE WHEN btrim({c}) IN ('', 'None', 'null') THEN NULL ELSE {c}::jsonb END").format(c=c)
    return sql.SQL("{}::{}").format(c, sql.SQL(target))


def _column_def(table: Table, column: str) -> sql.Composable:
    kind = table.columns[column]
    default = table.defaults.get(column)
    return sql.SQL("{} {}{}").format(
        sql.Identifier(column), sql.SQL(kind), sql.SQL(f" DEFAULT {default}" if default else ""),
    )


def _has_index(cur, table: Table, columns: tuple[str, ...], unique: bool) -> bool:
    """Si ya hay un índice (con otro nombre, quizá) sobre exactamente esas columnas."""
    cur.execute(
        """
        SELECT 1 FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = %s AND t.relname = %s AND (i.indisunique OR NOT %s)
          AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, pos)
                    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum ORDER BY k.pos) = %s
        """,
        [table.schema, table.name, unique, list(columns)],
    )
    return cur.fetchone() is not None


def ensure(cur, table: Table) -> None:
    """Crea la tabla o la pone al día. Una vez por proceso.

    Añade las columnas que faltan, convierte las de otro tipo, borra las que ya
    no están declaradas y crea los índices que no existan.
    """
    if table.name in _ENSURED:
        return
    fields = [_column_def(table, c) for c in table.columns]
    if table.primary_key:
        fields.append(sql.SQL("PRIMARY KEY ({})").format(sql.SQL(", ").join(map(sql.Identifier, table.primary_key))))
    cur.execute(sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(table.ident, sql.SQL(", ").join(fields)))

    cur.execute(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = %s AND table_name = %s",
        [table.schema, table.name],
    )
    current = dict(cur.fetchall())
    # Todo en un solo ALTER TABLE: cada cambio de tipo reescribe la tabla, y así se reescribe una vez.
    changes: list[sql.Composable] = []
    for column, kind in table.columns.items():
        if column not in current:
            changes.append(sql.SQL("ADD COLUMN {}").format(_column_def(table, column)))
        elif current[column] != (INT if kind == SERIAL else kind):
            logger.info("Convirtiendo %s.%s de %s a %s", table.name, column, current[column], kind)
            changes.append(
                sql.SQL("ALTER COLUMN {} TYPE {} USING {}").format(
                    sql.Identifier(column), sql.SQL(kind), _cast(column, current[column], kind),
                )
            )
    for column in sorted(set(current) - set(table.columns)):
        logger.info("Quitando %s.%s, que ya no está declarada", table.name, column)
        changes.append(sql.SQL("DROP COLUMN {}").format(sql.Identifier(column)))
    if changes:
        cur.execute(sql.SQL("ALTER TABLE {} {}").format(table.ident, sql.SQL(", ").join(changes)))

    for unique, columns in [(True, table.unique)] + [(False, cols) for cols in table.indexes]:
        if not columns or _has_index(cur, table, columns, unique):
            continue
        name = f"ix_{table.name}_{'_'.join(columns)}".replace("-", "_")[:63]
        cur.execute(
            sql.SQL("CREATE {}INDEX {} ON {} ({})").format(
                sql.SQL("UNIQUE " if unique else ""), sql.Identifier(name), table.ident,
                sql.SQL(", ").join(map(sql.Identifier, columns)),
            )
        )
    _ENSURED.add(table.name)


def ensure_tables(db, *tables: Table) -> None:
    """Crea o pone al día esas tablas, para quien las lee antes de que nadie haya escrito."""
    with db.transaction() as cur:
        for table in tables:
            ensure(cur, table)


def sync_all(db) -> list[str]:
    """Pone al día todas las tablas registradas. Lo llama `migrate`."""
    _ENSURED.clear()
    with db.transaction() as cur:
        for table in registered():
            ensure(cur, table)
    return [t.name for t in registered()]


# --- Escritura ----------------------------------------------------------------

def copy(cur, df: pd.DataFrame, table: Table) -> int:
    """`COPY` del DataFrame (ya ajustado con `coerce`) a la tabla, sin confirmar."""
    if df.empty:
        return 0
    out = df.copy()
    for col in out.columns:
        kind = table.columns[col]
        if kind == DATE:
            out[col] = out[col].dt.strftime("%Y-%m-%d")
        elif kind == TIMESTAMP:
            out[col] = out[col].dt.strftime("%Y-%m-%d %H:%M:%S.%f")
    buffer = io.StringIO()
    out.to_csv(buffer, sep="\t", header=False, index=False, na_rep=_NULL)
    buffer.seek(0)
    cur.copy_expert(
        sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', NULL {})").format(
            table.ident, sql.SQL(", ").join(map(sql.Identifier, out.columns)), sql.Literal(_NULL),
        ),
        buffer,
    )
    return len(out)


def truncate(cur, table: Table) -> None:
    """Vacía la tabla (creándola o poniéndola al día antes)."""
    ensure(cur, table)
    cur.execute(sql.SQL("TRUNCATE TABLE {}").format(table.ident))


def append(cur, table: Table, df: pd.DataFrame) -> int:
    """Añade las filas del DataFrame a la tabla."""
    ensure(cur, table)
    return copy(cur, coerce(df, table), table)


def replace(cur, table: Table, df: pd.DataFrame, **scope: Any) -> int:
    """Sustituye lo que hay en `scope` (o toda la tabla) por el DataFrame."""
    if not scope:
        truncate(cur, table)
        return append(cur, table, df)
    ensure(cur, table)
    where = sql.SQL(" AND ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in scope)
    cur.execute(sql.SQL("DELETE FROM {} WHERE {}").format(table.ident, where), list(scope.values()))
    return append(cur, table, df.assign(**scope))


def _python(value: Any) -> Any:
    """Valor que psycopg2 sabe adaptar: sin escalares de numpy ni nulos de pandas."""
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value.item() if hasattr(value, "item") else value


def upsert(cur, table: Table, rows: pd.DataFrame | Iterable[Mapping[str, Any]]) -> None:
    """Inserta o actualiza por `table.unique`; solo toca las columnas que trae cada fila.

    Si la tabla tiene `updated_at` y la fila no lo trae, se pone al momento.
    """
    ensure(cur, table)
    df = rows if isinstance(rows, pd.DataFrame) else pd.DataFrame(list(rows))
    if df.empty:
        return
    columns = [c for c in table.columns if c in df.columns]
    typed = apply_types(df[columns], table.columns)
    values = [tuple(_python(v) for v in row) for row in typed.itertuples(index=False, name=None)]
    key = table.unique or table.primary_key
    updates = [sql.SQL("{0} = EXCLUDED.{0}").format(sql.Identifier(c)) for c in columns if c not in key]
    if updates and "updated_at" in table.columns and "updated_at" not in columns:
        updates.append(sql.SQL("updated_at = now()"))
    cur.executemany(
        sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) DO {}").format(
            table.ident,
            sql.SQL(", ").join(map(sql.Identifier, columns)),
            sql.SQL(", ").join(sql.Placeholder() * len(columns)),
            sql.SQL(", ").join(map(sql.Identifier, key)),
            sql.SQL("UPDATE SET {}").format(sql.SQL(", ").join(updates)) if updates else sql.SQL("NOTHING"),
        ),
        values,
    )
