"""Las facturas de las suscripciones: importacion y lectura.

El export de suscripciones dice en que estado esta la facturacion de una orden
(«Facturado por completo», «Por facturar»...) pero no si esa factura se pago.
Ese dato es por factura, no por suscripcion —una orden acumula una por mes—, y
meterlo en el export de suscripciones lo perderia: la importacion consolida una
fila por orden y se quedaria con el estado de una factura cualquiera. Por eso
llega en un export propio, global (todas las facturas, sin ventana de fechas),
que reemplaza entero `subscriptions-facturas`.

Se guarda una fila por **linea** de factura, con los datos de la factura
repetidos: que linea es el plan se resuelve al leer contra el catalogo
(`leer_facturas`), no al importar, para que dar de alta un plan despues no
obligue a volver a cargar el fichero.

Odoo exporta las lineas de una factura como filas de continuacion: la primera
trae la factura y su primera linea, las siguientes solo la linea. Las de
continuacion heredan la factura de arriba.
"""

from __future__ import annotations

import io
import re
import unicodedata
from datetime import datetime
from typing import Any

import pandas as pd
from django.utils import timezone
from psycopg2 import sql

from core import fixtures
from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from core.utils import parse_date

# Cabecera del export -> columna interna. Se comparan sin tildes ni mayusculas
# (`_clave`): Odoo escribe «Número» y quien arma el export a veces no.
FACTURAS_COLUMN_MAPPING = {
    "Suscripción/Referencia de la orden": "orden",
    "Número": "numero",
    "Suscripción/Estado de la factura": "estado_factura_sub",
    "Estado": "estado",
    "Estado del pago": "estado_pago",
    "Creado el": "creado_el",
    "Líneas de factura/Producto": "producto",
}

# Todas salvo el estado de la factura de la suscripcion, que ya llega con el
# export de suscripciones y aqui solo se guarda para contrastarlo.
FACTURAS_REQUIRED = [
    "Suscripción/Referencia de la orden",
    "Número",
    "Estado",
    "Estado del pago",
    "Creado el",
    "Líneas de factura/Producto",
]

# Los datos de la factura, que las filas de continuacion no traen.
_COLUMNAS_FACTURA = ["orden", "numero", "estado_factura_sub", "estado", "estado_pago", "creado_el"]

COLUMNAS_TABLA = [*_COLUMNAS_FACTURA, "producto", "importado_el"]

# «[FTTH-100] Residencial FTTH 100 Mbps»: Odoo antepone la referencia interna
# al nombre del producto en las lineas de factura; el catalogo no la tiene.
_REFERENCIA = re.compile(r"^\s*\[[^\]]*\]\s*")


class FaltanColumnasFacturas(ValueError):
    """El fichero no trae las cabeceras que la importacion de facturas necesita."""


def _clave(texto: Any) -> str:
    """Sin tildes, en minusculas y con los espacios colapsados."""
    texto = unicodedata.normalize("NFD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", texto).strip().lower()


def nombre_producto(valor: Any) -> str:
    """El nombre del producto de una linea, sin la referencia interna delante."""
    return _REFERENCIA.sub("", str(valor or "")).strip()


def _fecha_iso(valor: Any) -> str | None:
    """`Creado el` como texto ISO, que en una columna `text` ordena bien."""
    fecha = parse_date(valor)
    if fecha is None or pd.isna(fecha):
        return None
    return pd.Timestamp(fecha).strftime("%Y-%m-%d %H:%M:%S")


def leer_csv_facturas(csv_path: str) -> pd.DataFrame:
    """El export de facturas, una fila por linea y con las columnas internas.

    Levanta `FaltanColumnasFacturas` si falta alguna cabecera requerida.
    """
    crudo = pd.read_csv(csv_path, dtype=str, keep_default_na=False, low_memory=False, encoding="utf-8-sig")
    por_clave = {_clave(c): interna for c, interna in FACTURAS_COLUMN_MAPPING.items()}
    crudo = crudo.rename(columns={c: por_clave[_clave(c)] for c in crudo.columns if _clave(c) in por_clave})

    faltan = [c for c in FACTURAS_REQUIRED if FACTURAS_COLUMN_MAPPING[c] not in crudo.columns]
    if faltan:
        raise FaltanColumnasFacturas(
            "El archivo de facturas no trae " + ", ".join(f"«{c}»" for c in faltan) + "."
        )

    df = crudo[[c for c in COLUMNAS_TABLA if c in crudo.columns]].copy()
    for col in _COLUMNAS_FACTURA:
        if col not in df.columns:
            df[col] = ""
    df = df.apply(lambda s: s.str.strip())
    df = df.mask(df == "")

    # Una fila sin ningun dato de factura es una linea mas de la de arriba.
    nueva = df[_COLUMNAS_FACTURA].notna().any(axis=1)
    grupo = nueva.cumsum()
    df[_COLUMNAS_FACTURA] = df.groupby(grupo)[_COLUMNAS_FACTURA].ffill()

    # Las facturas que no son de una suscripcion no le interesan a nadie aqui.
    df = df.dropna(subset=["orden"])
    fechas = {v: _fecha_iso(v) for v in df["creado_el"].dropna().unique()}
    df["creado_el"] = df["creado_el"].map(fechas)
    return df.drop_duplicates().reset_index(drop=True)


def import_facturas_csv(csv_path: str) -> int:
    """Reemplaza `subscriptions-facturas` con el export. Devuelve cuantas facturas trae.

    Crear, vaciar y cargar van en una sola transaccion: si algo falla, la
    tabla anterior sigue entera.
    """
    df = leer_csv_facturas(csv_path)
    df["importado_el"] = timezone.localtime().strftime("%Y-%m-%d %H:%M:%S")
    df = df[COLUMNAS_TABLA]

    tabla = sql.Identifier(DB_SCHEMA, TableNames.SUBSCRIPTIONS_FACTURAS)
    salida = io.StringIO()
    df.to_csv(salida, sep="\t", header=False, index=False, na_rep="NULL")
    salida.seek(0)

    db = DBConnector()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
                tabla, sql.SQL(", ").join(sql.SQL("{} text").format(sql.Identifier(c)) for c in COLUMNAS_TABLA),
            ))
            for col in COLUMNAS_TABLA:
                cur.execute(sql.SQL("ALTER TABLE {} ADD COLUMN IF NOT EXISTS {} text").format(tabla, sql.Identifier(col)))
            cur.execute(sql.SQL("TRUNCATE TABLE {}").format(tabla))
            cur.copy_expert(
                sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT csv, DELIMITER '\t', NULL 'NULL')").format(
                    tabla, sql.SQL(", ").join(map(sql.Identifier, COLUMNAS_TABLA)),
                ),
                salida,
            )
        conn.commit()

    return int(df.groupby(["orden", "numero", "creado_el"], dropna=False).ngroups)


def facturas_importadas_el() -> datetime | None:
    """Cuando se cargo el export de facturas que hay en la base; None si no hay ninguno."""
    db = DBConnector()
    if not db.tabla_existe(TableNames.SUBSCRIPTIONS_FACTURAS):
        return None
    df = db.query(f'SELECT MAX(importado_el) AS en FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_FACTURAS}"')
    valor = df["en"].iloc[0] if not df.empty else None
    return parse_date(valor) if valor else None


def leer_facturas(ordenes: list[str]) -> dict[str, list[dict[str, Any]]]:
    """Las facturas de cada orden, una entrada por factura, de la mas antigua a la mas nueva.

    Cada factura lleva `plan`: el nombre de catalogo de la primera de sus lineas
    que es un plan, o vacio si ninguna lo es (la de instalacion, la del router).
    Una factura se identifica por orden, numero y fecha de creacion: los
    borradores de Odoo pueden compartir numero («/»).
    """
    if not ordenes:
        return {}
    db = DBConnector()
    if not db.tabla_existe(TableNames.SUBSCRIPTIONS_FACTURAS):
        return {}
    df = db.query(
        f"""
        SELECT orden, numero, estado, estado_pago, creado_el, producto
        FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS_FACTURAS}"
        WHERE orden = ANY(%s)
        """,
        params=[ordenes],
    )
    if df.empty:
        return {}

    planes = {_clave(n): n for n in fixtures.plan_names()}
    df["plan"] = df["producto"].map(lambda p: planes.get(_clave(nombre_producto(p)), ""))
    df = df.fillna({"numero": "", "estado": "", "estado_pago": "", "creado_el": ""})

    resultado: dict[str, list[dict[str, Any]]] = {}
    for (orden, numero, creado_el), lineas in df.groupby(["orden", "numero", "creado_el"], sort=False):
        con_plan = lineas[lineas["plan"] != ""]
        primera = lineas.iloc[0]
        resultado.setdefault(str(orden), []).append({
            "numero": numero,
            "estado": primera["estado"],
            "estado_pago": primera["estado_pago"],
            "creado_el": creado_el,
            "plan": con_plan["plan"].iloc[0] if not con_plan.empty else "",
            "productos": [nombre_producto(p) for p in lineas["producto"].dropna().unique()],
        })
    for facturas in resultado.values():
        facturas.sort(key=lambda f: (f["creado_el"] == "", f["creado_el"], f["numero"]))
    return resultado
