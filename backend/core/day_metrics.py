"""Lo común a las tres tablas de métricas diarias.

Suscripciones, CRM y soporte guardan sus cortes por día con la misma forma de
fila -`periodo_reporte`, algún escalar del mes y `dia1..dia31` en `jsonb`-
porque el problema es el mismo: el análisis mensual ya recorre los datos una
vez, y calcular de paso el corte acumulado de cada día sale casi gratis frente
a volver a leerlos.

Aquí vive lo que no depende del dominio: los límites del mes, su etiqueta, el
guardado y las lecturas que necesitan las vistas. Lo que cambia entre módulos
es el contenido del JSON, y eso lo pone cada `analytics/day_metrics.py`.

**Tres lecturas, y cuál usa cada quien.**

* `read_series` -> solo el bloque global de cada día del mes. Es ligero (unos
  pocos kilobytes) porque el recorte lo hace Postgres y los desgloses
  dimensionales no salen de la base. Lo usan los tres módulos: es lo que hace
  que mover la barra sea instantáneo.
* `read_month` -> el mes entero, desgloses incluidos. Solo suscripciones, cuyos
  desgloses diarios son pequeños.
* `read_day` -> un solo día completo. CRM y soporte, cuyo día lleva el bloque
  de métricas de cada vendedor, sucursal, zona o grupo de trabajo: el mes entero
  serían megabytes en el navegador.
"""

from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Any

from core.config import DB_SCHEMA
from core.database import DBConnector
from core.models import Period
from core.tables import Table, upsert

logger = logging.getLogger(__name__)

DAY_COLUMNS = [f"dia{d}" for d in range(1, 32)]


def month_bounds(year_month: str) -> tuple[int, int, int]:
    """Año, mes y último día de un `YYYY-MM`."""
    year, month = int(year_month[:4]), int(year_month[5:7])
    return year, month, calendar.monthrange(year, month)[1]


def month_label(year_month: str) -> str:
    """Etiqueta del mes completo, la misma clave que usan las demás tablas."""
    return Period.build(f"{year_month}-01").label()


def last_day_to_compute(year_month: str, until_day: int | None = None) -> int:
    """Hasta qué día tiene sentido calcular el mes.

    En el mes en curso no se calculan días futuros: su corte estaría vacío y
    solo serviría para ensanchar la barra con tramos sin datos.
    """
    year, month, last = month_bounds(year_month)
    today = date.today()
    top = last
    if (year, month) == (today.year, today.month):
        top = min(top, today.day)
    if until_day:
        top = min(top, until_day)
    return top


def cutoff_date(year_month: str, day: int) -> date:
    """El día del corte acumulado, como fecha."""
    year, month, _ = month_bounds(year_month)
    return date(year, month, day)


def save_days(db: DBConnector, table: Table, label: str, days: dict[str, Any], **scalars: Any) -> None:
    """Guarda los días calculados del mes; los que no vienen conservan su valor."""
    with db.transaction() as cur:
        upsert(cur, table, [{"periodo_reporte": label, **scalars, **days}])


def read_month(table: str, year_month: str, scalars: tuple[str, ...] = (), key: str | None = None) -> dict[str, Any]:
    """El mes entero: `{periodo_mes, dias: {"1": {...}, ...}, **scalars}`.

    `key` es el `periodo_reporte` de la fila: por defecto la etiqueta larga de
    `Periodo.label()`, la de suscripciones; CRM y soporte guardan `YYYY-MM`.
    """
    if not year_month:
        return {}
    db = DBConnector()
    if not db.table_exists(table):
        return {}
    label = key or month_label(year_month)
    df = db.query(f'SELECT * FROM "{DB_SCHEMA}"."{table}" WHERE periodo_reporte = %s', params=[label])
    if df.empty:
        return {}
    row = df.iloc[0]
    days = {str(i): row[col] for i, col in enumerate(DAY_COLUMNS, start=1) if row.get(col) is not None}
    return {"periodo_reporte": label, "periodo_mes": year_month, "dias": days, **{c: row.get(c) for c in scalars}}


def read_day(table: str, year_month: str, day: int, key: str | None = None) -> Any:
    """El corte completo de un día, desgloses incluidos, o None si no está."""
    if not year_month or not 1 <= day <= 31:
        return None
    db = DBConnector()
    if not db.table_exists(table):
        return None
    label = key or month_label(year_month)
    df = db.query(f'SELECT dia{day} AS payload FROM "{DB_SCHEMA}"."{table}" WHERE periodo_reporte = %s', params=[label])
    return None if df.empty else df.iloc[0]["payload"]


def read_series(table: str, year_month: str, key: str | None = None, block: str = "global") -> dict[str, Any]:
    """La serie ligera del mes: solo el bloque `block` de cada día.

    Devuelve `{periodo_mes, dias_disponibles, serie: {"1": {...}, ...}}`. El
    recorte se hace en Postgres (`-> 'global'`), así que los desgloses no llegan
    ni a salir de la base.

    **`dias_disponibles` NO depende de que el bloque exista**: un día cuenta como
    calculado si su celda tiene contenido. Un mes analizado antes de que el
    módulo guardara `global` conserva así sus cortes en la barra.
    """
    empty = {"periodo_mes": year_month or "", "dias_disponibles": [], "serie": {}}
    if not year_month:
        return empty
    if not block.isidentifier():
        raise ValueError(f"Bloque inválido: {block!r}")
    db = DBConnector()
    if not db.table_exists(table):
        return empty
    label = key or month_label(year_month)
    cuts = ", ".join(f"({c} IS NOT NULL) AS has_{c}, ({c} -> '{block}') AS {c}" for c in DAY_COLUMNS)
    df = db.query(f'SELECT {cuts} FROM "{DB_SCHEMA}"."{table}" WHERE periodo_reporte = %s', params=[label])
    if df.empty:
        return empty

    row = df.iloc[0]
    series = {str(i): row[col] for i, col in enumerate(DAY_COLUMNS, start=1) if row.get(col) is not None}
    available = [i for i, col in enumerate(DAY_COLUMNS, start=1) if bool(row.get(f"has_{col}"))]
    if available and not series:
        logger.info("%s tiene %d días de %s pero ninguno guarda `%s`.", table, len(available), label, block)
    return {"periodo_mes": year_month, "dias_disponibles": available, "serie": series}


def months_with_days(table: str) -> list[str]:
    """Meses (`YYYY-MM`) que ya tienen métricas diarias calculadas."""
    db = DBConnector()
    if not db.table_exists(table):
        return []
    df = db.query(f'SELECT DISTINCT LEFT(periodo_reporte, 7) AS mes FROM "{DB_SCHEMA}"."{table}" ORDER BY mes DESC')
    return df["mes"].dropna().tolist()
