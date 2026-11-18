"""Cruce del directorio de ventas con las suscripciones importadas.

El directorio (`services/catalogs/models.py`) dice quien existe; las
suscripciones dicen quien aparece. Lo interesante es la diferencia: nombres que
ya estan vendiendo y que nadie registro. Para Comisiones esa diferencia es
dinero: una venta cuyo medio no esta en el directorio no tiene a quien
pagarsela.

Igual que los tecnicos sin registrar de soporte, no bloquea nada: es una lista
para revisar en Catalogos › Notificaciones.
"""

from __future__ import annotations

from typing import Any

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.fixtures import ignored_names
from core.odoo_names import name_key
from services.catalogs.models import SalesPerson

# Las columnas del export que nombran a una persona de ventas, con el rol
# que se le sugiere a quien aparece en cada una (el equipo lo elige quien registra). El orden es el de la
# sugerencia cuando un nombre sale en varias: quien figura como `Vendedor` es
# coordinador de oficina aunque tambien haya vendido directamente.
SALES_COLUMNS = {
    "vendedor": "coord_oficina",
    "medio_supervisor": "supervisor",
    "medio": "asesor",
}


def registered_keys() -> dict[str, set[str]]:
    """Las claves que el directorio reconoce en cada columna.

    Una por columna, porque cada una se cruza con un literal distinto: `Medio`
    con el `medio`, `Oportunidad/Administrador` con el nombre como supervisor (el
    propio o, si no lo tiene, el medio) y `Vendedor` con el usuario de Odoo.
    Es el mismo cruce que hace el calculo de comisiones: lo que aqui sale como
    pendiente es exactamente lo que alli no encuentra a nadie.
    """
    keys: dict[str, set[str]] = {column: set() for column in SALES_COLUMNS}
    for person in SalesPerson.objects.prefetch_related("aliases"):
        keys["medio"] |= person.name_keys("medio")
        keys["medio_supervisor"] |= person.name_keys("supervisor")
        keys["vendedor"] |= person.name_keys("usuario")
    return keys


def people_outside_directory() -> list[dict[str, Any]]:
    """Los nombres de las suscripciones que el directorio de ventas no reconoce.

    Una fila por nombre (comparado como `name_key`), con cuantas ordenes
    lleva en cada columna en la que aparece y el cargo sugerido. Los conteos
    no se suman en un total: la venta directa de un supervisor lo lleva en
    `Medio` y en `Oportunidad/Administrador` a la vez, y sumarlos la contaria dos veces.

    Las columnas que el export todavia no trae se saltan: un entorno que no ha
    importado con `Medio` simplemente no tiene esa lista.
    """
    db = DBConnector()
    present = db.columns(TableNames.SUBSCRIPTIONS)
    columns = [c for c in SALES_COLUMNS if c in present]
    if not columns:
        return []

    union = " UNION ALL ".join(
        f"""SELECT '{c}' AS columna, TRIM({c}) AS nombre, orden_producto
            FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
            WHERE {c} IS NOT NULL AND TRIM({c}) <> ''"""
        for c in columns
    )
    df = db.query(
        f"""
        SELECT columna, nombre, COUNT(DISTINCT orden_producto) AS ordenes
        FROM ({union}) AS apariciones
        GROUP BY columna, nombre
        """
    )
    if df.empty:
        return []

    registered = registered_keys()
    silent = {name_key(n) for n in ignored_names("ventas")}

    df = df.assign(
        nombre=df["nombre"].astype(str),
        columna=df["columna"].astype(str),
        ordenes=df["ordenes"].astype(int),
    )
    df["clave"] = df["nombre"].map(name_key)
    known = [bool(c) and c not in registered[col] and c not in silent for c, col in zip(df["clave"], df["columna"], strict=True)]
    by_key: dict[str, dict[str, Any]] = {}
    for row in df[known].to_dict("records"):
        entry = by_key.setdefault(row["clave"], {"nombre": row["nombre"], "ordenes": {}})
        entry["ordenes"][row["columna"]] = row["ordenes"]

    rows = []
    for entry in by_key.values():
        first = next(c for c in SALES_COLUMNS if c in entry["ordenes"])
        entry["rol"] = SALES_COLUMNS[first]
        rows.append(entry)
    return sorted(rows, key=lambda f: -max(f["ordenes"].values()))

