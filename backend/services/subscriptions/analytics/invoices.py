"""Las facturas de las suscripciones: importación y lectura.

El export de suscripciones dice en qué estado está la facturación de una orden
(«Facturado por completo», «Por facturar»...) pero no si esa factura se pagó.
Ese dato es por factura -una orden acumula una por mes- y llega en un export
propio, global, que reemplaza entero `subscriptions-facturas`.

Se guarda una fila por **línea** de factura, con los datos de la factura
repetidos: qué línea es el plan se resuelve al leer contra el catálogo
(`read_invoices`), para que dar de alta un plan después no obligue a volver a
cargar el fichero.

Odoo exporta las líneas de una factura como filas de continuación: la primera
trae la factura y su primera línea, las siguientes solo la línea, y heredan la
factura de arriba.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

import pandas as pd
from django.utils import timezone

from core import fixtures
from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.exports import ExportSpec, header_key, read_export
from core.tables import TIMESTAMP, replace

from .tables import INVOICES

INVOICES_EXPORT = ExportSpec(
    label="facturas",
    columns={
        "Suscripción/Referencia de la orden": "orden",
        "Número": "numero",
        "Suscripción/Estado de la factura": "estado_factura_sub",
        "Estado": "estado",
        "Estado del pago": "estado_pago",
        "Creado el": "creado_el",
        "Líneas de factura/Producto": "producto",
        "Fecha del último pago": "fecha_pago",
        "Última actualización el": "actualizado_el",
    },
    # Las fechas de después del pago son opcionales: los exports antiguos no las traían.
    required=(
        "Suscripción/Referencia de la orden", "Número", "Estado", "Estado del pago", "Creado el",
        "Líneas de factura/Producto",
    ),
    types={"creado_el": TIMESTAMP, "fecha_pago": TIMESTAMP, "actualizado_el": TIMESTAMP},
)

# Los datos de la factura, que las filas de continuación no traen.
_INVOICE_FIELDS = [
    "orden", "numero", "estado_factura_sub", "estado", "estado_pago", "creado_el", "fecha_pago", "actualizado_el",
]
_DATES = ["creado_el", "fecha_pago", "actualizado_el"]

# «[FTTH-100] Residencial FTTH 100 Mbps»: Odoo antepone la referencia interna
# al nombre del producto en las líneas de factura; el catálogo no la tiene.
_REFERENCE = re.compile(r"^\s*\[[^\]]*\]\s*")


def product_name(value: Any) -> str:
    """El nombre del producto de una línea, sin la referencia interna delante."""
    return _REFERENCE.sub("", str(value or "")).strip()


def read_invoices_csv(csv_path: str) -> pd.DataFrame:
    """El export de facturas, una fila por línea y con las columnas internas."""
    df = read_export(csv_path, INVOICES_EXPORT).reindex(columns=[*_INVOICE_FIELDS, "producto"])
    # Una fila sin ningún dato de factura es una línea más de la de arriba.
    group = df[_INVOICE_FIELDS].notna().any(axis=1).cumsum()
    df[_INVOICE_FIELDS] = df.groupby(group)[_INVOICE_FIELDS].ffill()
    # Las facturas que no son de una suscripción no le interesan a nadie aquí.
    return df.dropna(subset=["orden"]).drop_duplicates().reset_index(drop=True)


def import_invoices(csv_path: str) -> int:
    """Reemplaza `subscriptions-facturas` con el export. Devuelve cuántas facturas trae."""
    df = read_invoices_csv(csv_path)
    df["importado_el"] = timezone.localtime().replace(tzinfo=None)
    with DBConnector().transaction() as cur:
        replace(cur, INVOICES, df)
    return int(df.groupby(["orden", "numero", "creado_el"], dropna=False).ngroups)


def invoices_imported_at() -> datetime | None:
    """Cuándo se cargó el export de facturas que hay en la base; None si no hay ninguno."""
    db = DBConnector()
    if not db.table_exists(TableNames.SUBSCRIPTIONS_INVOICES):
        return None
    value = db.query(f'SELECT MAX(importado_el) AS at FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_INVOICES}"')["at"].iloc[0]
    return None if pd.isna(value) else pd.Timestamp(value).to_pydatetime()


def invoices_have_payment_dates() -> bool:
    """Si el export cargado trae la fecha del pago (los antiguos no la traían)."""
    db = DBConnector()
    if not db.table_exists(TableNames.SUBSCRIPTIONS_INVOICES):
        return False
    table = f'"{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_INVOICES}"'
    return bool(db.query(f"SELECT EXISTS (SELECT 1 FROM {table} WHERE fecha_pago IS NOT NULL) AS has")["has"].iloc[0])


def read_invoices(orders: list[str]) -> dict[str, list[dict[str, Any]]]:
    """Las facturas de cada orden, una entrada por factura, de la más antigua a la más nueva.

    Cada factura lleva `plan`: el nombre de catálogo de la primera de sus líneas
    que es un plan, o vacío si ninguna lo es (la de instalación, la del router).
    Las fechas van como texto ISO (`YYYY-MM-DD HH:MM:SS`), vacías si no están.
    Una factura se identifica por orden, número y fecha de creación: los
    borradores de Odoo pueden compartir número («/»).
    """
    if not orders:
        return {}
    db = DBConnector()
    if not db.table_exists(TableNames.SUBSCRIPTIONS_INVOICES):
        return {}
    df = db.query(
        f"""
        SELECT orden, numero, estado, estado_pago, creado_el, producto, fecha_pago, actualizado_el
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_INVOICES}"
        WHERE orden = ANY(%s)
        """,
        params=[orders],
    )
    if df.empty:
        return {}

    plans = {header_key(n): n for n in fixtures.plan_names()}
    df["plan"] = df["producto"].map(lambda p: plans.get(header_key(product_name(p)), ""))
    for col in _DATES:
        df[col] = pd.to_datetime(df[col]).dt.strftime("%Y-%m-%d %H:%M:%S")
    df = df.fillna({"numero": "", "estado": "", "estado_pago": "", **{c: "" for c in _DATES}})

    result: dict[str, list[dict[str, Any]]] = {}
    for (order, number, created), lines in df.groupby(["orden", "numero", "creado_el"], sort=False):
        with_plan = lines[lines["plan"] != ""]
        first = lines.iloc[0]
        result.setdefault(str(order), []).append({
            "numero": number,
            "estado": first["estado"],
            "estado_pago": first["estado_pago"],
            "creado_el": created,
            "fecha_pago": first["fecha_pago"],
            "actualizado_el": first["actualizado_el"],
            "plan": with_plan["plan"].iloc[0] if not with_plan.empty else "",
            "productos": [product_name(p) for p in lines["producto"].dropna().unique()],
        })
    for invoices in result.values():
        invoices.sort(key=lambda f: (f["creado_el"] == "", f["creado_el"], f["numero"]))
    return result
