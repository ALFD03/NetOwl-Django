"""Importación de los exports de suscripciones y de logs.

El de suscripciones se guarda dos veces: `subscriptions-b` conserva el detalle
línea a línea y `subscriptions` una fila por orden, ya consolidada. Las dos
tablas se reemplazan en cada carga: **no son un histórico**.

Lo que hace especial a este importador es la comprobación del catálogo. El
export trae varias líneas por orden -el plan, el router, la instalación- y solo
una de ellas es el producto; si ninguna está catalogada, la importación se
detiene antes de escribir nada.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.exports import ExportSpec, read_export
from core.fixtures import (
    ignorados,
    ignored_products,
    plan_names,
    recognized_names,
    zones_by_name,
)
from core.tables import DATE, FLOAT, TIMESTAMP, replace, to_bool

from .config import SUBS_COLUMN_MAPPING
from .free_plans import FREE_PLANS_EXPORT
from .invoices import INVOICES_EXPORT
from .tables import SUBSCRIPTION_LINES, SUBSCRIPTION_LOGS, SUBSCRIPTIONS

SUBSCRIPTIONS_EXPORT = ExportSpec(
    label="suscripciones",
    columns={**SUBS_COLUMN_MAPPING, "Activo": "activo"},
    required=(
        "Líneas de la orden/Referencia de la orden", "Líneas de la orden/Producto/Nombre", "Líneas de la orden/Cliente",
        "Líneas de la orden/Cliente/CI/RIF", "Sucursal", "Zona", "Líneas de la orden/Cliente/Municipio",
        "Tipo de Servicio", "Estado de la Suscripción", "Campaña", "Próxima Fecha de Factura", "Fecha de inicio",
        "Tarifa", "Subtotal",
    ),
    aliases={"Active": "activo"},
    types={"fecha_factura": DATE, "fecha_inicio": DATE, "total": FLOAT},
)

LOGS_EXPORT = ExportSpec(
    label="logs de suscripciones",
    columns={
        "Logs de Cambios/Suscripción": "orden",
        "Logs de Cambios/Fecha de Cambio": "fecha_log",
        "Logs de Cambios/Nota": "log",
        "Logs de Cambios/Estado Interno de Suscripción": "estado",
    },
    required=(
        "Logs de Cambios/Suscripción", "Logs de Cambios/Fecha de Cambio",
        "Logs de Cambios/Nota", "Logs de Cambios/Estado Interno de Suscripción",
    ),
    types={"fecha_log": TIMESTAMP},
)

# Lo que se arrastra a las líneas de la orden que lo traen vacío.
_ORDER_FIELDS = [
    "cliente", "ci", "sucursal", "zona", "municipio", "tipo", "estado", "campanna", "fecha_factura",
    "fecha_inicio", "tarifa", "total", "producto", "telefono", "phone", "phone2", "vendedor", "activo", "medio",
    "medio_supervisor", "estado_factura",
]


class EmptyCatalog(RuntimeError):
    """No hay ni un plan registrado: se arregla en Catálogos, no en el export."""


class UncatalogedProducts(RuntimeError):
    """El export trae órdenes cuyo producto no está en el catálogo.

    Lleva lo que necesita el cliente para resolverlo sin volver a subir el
    fichero a ciegas: qué productos son y cuántas órdenes arrastra cada uno.
    """

    def __init__(self, products: list[dict[str, Any]], orders: int):
        self.products = products
        self.orders = orders
        names = ", ".join(p["nombre"] for p in products[:5])
        if len(products) > 5:
            names += f" (+{len(products) - 5} mas)"
        super().__init__(
            f"{len(products)} producto(s) no estan en el catalogo y afectan a {orders} orden(es): {names}."
        )


def _check_catalog(lines: pd.DataFrame) -> None:
    """Aborta la importación si alguna orden entra sin producto catalogado.

    Una orden sin ninguna línea de producto no se reporta: no hay nombre que
    registrar. Lo que alguien ya declaró que nunca será un plan (un router, una
    instalación) tampoco.
    """
    if not plan_names():
        raise EmptyCatalog(
            "El catalogo de planes esta vacio. Cargalo desde Catalogos -> Productos antes de importar."
        )
    products = lines[["orden_producto", "producto"]].dropna(subset=["producto"])
    recognized = recognized_names()
    with_plan = set(products.loc[products["producto"].isin(recognized), "orden_producto"])
    orphan = products[~products["orden_producto"].isin(with_plan)]
    candidates = orphan[~orphan["producto"].isin(ignored_products())]
    if candidates.empty:
        return
    counts = candidates.groupby("producto")["orden_producto"].nunique().sort_values(ascending=False)
    raise UncatalogedProducts(
        [{"nombre": str(name), "ordenes": int(n)} for name, n in counts.items()],
        int(candidates["orden_producto"].nunique()),
    )


def _consolidate(lines: pd.DataFrame) -> pd.DataFrame:
    """Una fila por orden: el primer valor de cada campo y, de producto, la primera línea catalogada."""
    fields = [c for c in _ORDER_FIELDS if c in lines.columns]
    orders = lines.groupby("orden_producto", as_index=False)[fields].first()
    recognized = recognized_names()
    plans = lines[lines["producto"].isin(recognized)].groupby("orden_producto")["producto"].first()
    orders["producto"] = orders["orden_producto"].map(plans)
    return orders


def import_subscriptions(csv_path: str) -> int:
    """Carga el export de suscripciones y devuelve cuántas órdenes quedaron.

    **Verifica el catálogo antes de tocar la base** y reemplaza en una sola
    transacción `subscriptions-b` (detalle) y `subscriptions` (consolidado).
    Levanta `UncatalogedProducts` o `EmptyCatalog` sin haber escrito nada.
    """
    lines = read_export(csv_path, SUBSCRIPTIONS_EXPORT)
    # Odoo repite a veces la fila de cabeceras dentro del fichero.
    lines = lines[lines["orden_producto"] != "Líneas de la orden/Referencia de la orden"]
    # Líneas sin referencia de orden: no pertenecen a ninguna suscripción.
    lines = lines.dropna(subset=["orden_producto"]).reset_index(drop=True)

    fields = [c for c in _ORDER_FIELDS if c in lines.columns]
    lines[fields] = lines.groupby("orden_producto")[fields].ffill()
    _check_catalog(lines)

    orders = _consolidate(lines)
    if "activo" in orders.columns:
        # `Activo` es `True` o vacío (= archivada, plan gratuito). Un valor que no
        # está en ningún vocabulario no se da por archivado: eso sacaría clientes
        # de pago de la base activa sin dejar rastro.
        unknown = to_bool(orders["activo"]).isna() & orders["activo"].notna()
        if unknown.any():
            sample = sorted(orders.loc[unknown, "activo"].astype(str).unique())[:5]
            print(f"AVISO: 'Activo' trae {int(unknown.sum())} valores no reconocidos {sample}; se cuentan como activos.")
        orders["activo"] = to_bool(orders["activo"], unknown=True)
    else:
        # Un export sin la columna no dice nada de archivadas: nadie se da por archivado.
        orders["activo"] = True

    with DBConnector().transaction() as cur:
        replace(cur, SUBSCRIPTION_LINES, lines)
        replace(cur, SUBSCRIPTIONS, orders)
    return len(orders)


def import_logs(csv_path: str) -> int:
    """Carga el export de logs y reemplaza `subscriptions-logs`."""
    logs = read_export(csv_path, LOGS_EXPORT)
    with DBConnector().transaction() as cur:
        return replace(cur, SUBSCRIPTION_LOGS, logs)


def products_outside_catalog() -> list[dict[str, Any]]:
    """Productos ya importados que hoy no están en el catálogo.

    Un plan se puede borrar después de importar: el análisis lo vuelve a mirar
    antes de gastar minutos calculando una respuesta que ya sería mala.
    """
    db = DBConnector()
    if not db.table_exists(TableNames.SUBSCRIPTIONS):
        return []
    df = db.query(
        f"""
        SELECT producto, COUNT(DISTINCT orden_producto) AS ordenes
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE producto IS NOT NULL AND producto <> ''
        GROUP BY producto
        """
    )
    known = recognized_names() | ignored_products()
    outside = df[~df["producto"].isin(known)]
    return [{"nombre": str(r.producto), "ordenes": int(r.ordenes)} for r in outside.itertuples()]


def zones_outside_catalog() -> list[dict[str, Any]]:
    """Zonas que traen las suscripciones importadas y el catálogo no tiene.

    No bloquea nada: sus órdenes se analizan igual, pero se quedan sin site,
    estado ni coordinador. Se compara sin espacios de sobra y sin caja, como
    lo hacen los análisis (`zones_by_name`).
    """
    db = DBConnector()
    if not db.table_exists(TableNames.SUBSCRIPTIONS):
        return []
    df = db.query(
        f"""
        SELECT zona, COUNT(DISTINCT orden_producto) AS ordenes
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
        WHERE zona IS NOT NULL AND TRIM(zona) <> ''
        GROUP BY zona
        """
    )
    if df.empty:
        return []
    cataloged = zones_by_name()
    muted = {n.strip().lower() for n in ignorados("estructura")}
    key = df["zona"].astype(str).str.strip().str.lower()
    outside = df[~key.isin(cataloged) & ~key.isin(muted)].sort_values("ordenes", ascending=False)
    return [{"nombre": str(r.zona).strip(), "ordenes": int(r.ordenes)} for r in outside.itertuples()]


def odoo_fields() -> dict[str, list[dict[str, Any]]]:
    """Los campos del export de Odoo que lee cada importación de suscripciones."""
    return {
        "subscriptions": SUBSCRIPTIONS_EXPORT.fields(),
        "logs": LOGS_EXPORT.fields(),
        "gratis": FREE_PLANS_EXPORT.fields(),
        "facturas": INVOICES_EXPORT.fields(),
    }
