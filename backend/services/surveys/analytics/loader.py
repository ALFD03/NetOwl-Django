"""A quién se le hace cada encuesta del mes: los instalados y las bajas.

Se lee de las tablas de Suscripciones (las de la importación y la de bajas del
análisis mensual), solo con lo de `core`:

- **Instalados**: las suscripciones con `fecha_inicio` en el mes, sin las que
  siguen en cotización o instalación (todavía no hay servicio).
- **Bajas**: las órdenes de `analyzer_bajas_detalladas` del mes. Necesita el
  mes calculado.

Las dos devuelven la misma ficha por cliente. **La ficha es la de hoy** (las
tablas de origen se truncan en cada importación); por eso se copia al abrir el
mes. Una baja que ya no está en `subscriptions` se busca en `subscriptions-b`.
"""

from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.models import Period
from core.utils import normalize_text

logger = logging.getLogger(__name__)

# Sin servicio todavía: no hay a quién preguntarle por la instalación.
NO_SERVICE_STATES = frozenset({"cotizacion", "instalacion"})

# Columna de `subscriptions` -> campo de la ficha, en el orden en que se muestra.
CARD = {
    "orden_producto": "order",
    "cliente": "client",
    "ci": "ci",
    "vendedor": "seller",
    "medio": "channel",
    "sucursal": "branch",
    "zona": "zone",
    "tipo": "service_type",
    "campanna": "campaign",
    "phone": "phone1",
    "phone2": "phone2",
}

ERROR = "No se pudo leer la lista. Consulte el registro de la aplicación."


def _text(value: Any) -> str:
    """Una celda como cadena limpia."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    return "" if text.lower() in ("nan", "none", "null", "<na>") else text


def _card(record: dict) -> dict[str, str]:
    return {field: _text(record.get(column)) for column, field in CARD.items()}


def _sorted(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return sorted(rows, key=lambda r: (r["zone"], r["branch"], r["order"]))


def _select(db: DBConnector, table: str, extra: tuple[str, ...] = ()) -> str | None:
    """`SELECT` de las columnas de la ficha que la tabla tiene, o None si no sirve."""
    if not db.table_exists(table):
        return None
    columns = db.columns(table)
    if "orden_producto" not in columns:
        return None
    wanted = ", ".join(f'"{c}"' for c in (*CARD, *extra) if c in columns)
    return f'SELECT {wanted} FROM "{DB_SCHEMA}"."{table}"'


def get_installed(month: str) -> dict[str, Any]:
    """Los clientes instalados en `month` (`YYYY-MM`), uno por suscripción.

    Devuelve `{"status": "success" | "empty" | "error", "rows": [...], "message"?}`.
    """
    year, num = int(month[:4]), int(month[5:7])
    start, end = date(year, num, 1), date(year, num, calendar.monthrange(year, num)[1])
    try:
        db = DBConnector()
        select = _select(db, TableNames.SUBSCRIPTIONS, ("estado", "fecha_inicio"))
        if select is None or "fecha_inicio" not in db.columns(TableNames.SUBSCRIPTIONS):
            return {"status": "empty", "message": "Todavía no se ha importado ninguna suscripción.", "rows": []}
        df = db.query(f"{select} WHERE fecha_inicio BETWEEN %s AND %s", params=[start, end])
    except Exception:
        logger.exception("No se pudieron leer los instalados de %s", month)
        return {"status": "error", "message": ERROR, "rows": []}

    rows: dict[str, dict[str, str]] = {}
    for record in df.to_dict("records"):
        if normalize_text(_text(record.get("estado"))) in NO_SERVICE_STATES:
            continue
        card = _card(record)
        if card["order"]:
            # Una fila por orden: gana la primera si el export repitió alguna.
            rows.setdefault(card["order"], card)
    if not rows:
        return {"status": "empty", "message": f"No hay instalados en {month}.", "rows": []}
    return {"status": "success", "rows": _sorted(list(rows.values()))}


def get_churned(month: str) -> dict[str, Any]:
    """Los clientes que se dieron de baja en `month` (`YYYY-MM`), con la misma ficha."""
    label = Period.build(f"{month}-01").label()
    not_computed = f"El mes {month} todavía no está calculado en Suscripciones: ejecuta primero su análisis."
    try:
        db = DBConnector()
        if not db.table_exists(TableNames.ANALYZER_CHURNED):
            return {"status": "empty", "message": not_computed, "rows": []}
        df = db.query(
            f'SELECT DISTINCT orden FROM "{DB_SCHEMA}"."{TableNames.ANALYZER_CHURNED}" WHERE periodo_reporte = %s',
            params=[label],
        )
        orders = sorted({o for o in df["orden"].astype(str).str.strip() if o}) if not df.empty else []
        if not orders:
            return {"status": "empty", "message": not_computed, "rows": []}

        cards: dict[str, dict[str, str]] = {}
        for table in (TableNames.SUBSCRIPTIONS, TableNames.SUBSCRIPTIONS_B):
            missing = [o for o in orders if o not in cards]
            select = _select(db, table)
            if not missing or select is None:
                continue
            found = db.query(f"{select} WHERE orden_producto = ANY(%s)", params=[missing])
            for record in found.to_dict("records"):
                card = _card(record)
                cards.setdefault(card["order"], card)
    except Exception:
        logger.exception("No se pudieron leer las bajas de %s", month)
        return {"status": "error", "message": ERROR, "rows": []}

    # Una baja sin ficha en ninguna tabla se lista igual: se sabe su orden.
    rows = [cards.get(o) or {**{f: "" for f in CARD.values()}, "order": o} for o in orders]
    return {"status": "success", "rows": _sorted(rows)}
