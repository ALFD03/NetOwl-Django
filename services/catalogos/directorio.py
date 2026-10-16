"""Cruce del directorio de ventas con las suscripciones importadas.

El directorio (`services/catalogos/models.py`) dice quien existe; las
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
from core.fixtures import ignorados
from core.odoo_nombres import clave_nombre
from services.catalogos.models import PersonaVentas

# Las columnas del export que nombran a una persona de ventas, con el cargo
# que se le sugiere a quien aparece en cada una. El orden es el de la
# sugerencia cuando un nombre sale en varias: quien figura como `Vendedor` es
# coordinador de oficina aunque tambien haya vendido directamente.
COLUMNAS_VENTAS = {
    "vendedor": "coord_oficina",
    "medio_supervisor": "supervisor",
    "medio": "asesor",
}


def claves_registradas() -> dict[str, set[str]]:
    """Las claves que el directorio reconoce en cada columna.

    Una por columna, porque cada una se cruza con un literal distinto: `Medio`
    con el `medio`, `Oportunidad/Administrador` con el nombre como supervisor (el
    propio o, si no lo tiene, el medio) y `Vendedor` con el usuario de Odoo.
    Es el mismo cruce que hace el calculo de comisiones: lo que aqui sale como
    pendiente es exactamente lo que alli no encuentra a nadie.
    """
    claves: dict[str, set[str]] = {columna: set() for columna in COLUMNAS_VENTAS}
    for persona in PersonaVentas.objects.all():
        claves["medio"].add(clave_nombre(persona.medio))
        claves["medio_supervisor"].add(clave_nombre(persona.literal_supervisor))
        if persona.usuario_odoo:
            claves["vendedor"].add(clave_nombre(persona.usuario_odoo))
    return claves


def personas_fuera_del_directorio() -> list[dict[str, Any]]:
    """Los nombres de las suscripciones que el directorio de ventas no reconoce.

    Una fila por nombre (comparado como `clave_nombre`), con cuantas ordenes
    lleva en cada columna en la que aparece y el cargo sugerido. Los conteos
    no se suman en un total: la venta directa de un supervisor lo lleva en
    `Medio` y en `Oportunidad/Administrador` a la vez, y sumarlos la contaria dos veces.

    Las columnas que el export todavia no trae se saltan: un entorno que no ha
    importado con `Medio` simplemente no tiene esa lista.
    """
    db = DBConnector()
    presentes = db.columnas(TableNames.SUBSCRIPTIONS)
    columnas = [c for c in COLUMNAS_VENTAS if c in presentes]
    if not columnas:
        return []

    union = " UNION ALL ".join(
        f"""SELECT '{c}' AS columna, TRIM({c}) AS nombre, orden_producto
            FROM "{DB_SCHEMA}"."{TableNames.SUBSCRIPTIONS}"
            WHERE {c} IS NOT NULL AND TRIM({c}) <> ''"""
        for c in columnas
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

    registradas = claves_registradas()
    callados = {clave_nombre(n) for n in ignorados("ventas")}

    por_clave: dict[str, dict[str, Any]] = {}
    for _, fila in df.iterrows():
        nombre = str(fila["nombre"])
        columna = str(fila["columna"])
        clave = clave_nombre(nombre)
        if not clave or clave in registradas[columna] or clave in callados:
            continue
        entrada = por_clave.setdefault(clave, {"nombre": nombre, "ordenes": {}})
        entrada["ordenes"][columna] = int(fila["ordenes"])

    filas = []
    for entrada in por_clave.values():
        primera = next(c for c in COLUMNAS_VENTAS if c in entrada["ordenes"])
        entrada["cargo"] = COLUMNAS_VENTAS[primera]
        filas.append(entrada)
    return sorted(filas, key=lambda f: -max(f["ordenes"].values()))
