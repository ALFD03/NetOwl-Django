"""Cruce del directorio de usuarios con los tickets ya importados.

El directorio (`services/support/models.py`) dice quien existe; los tickets
dicen quien aparece. Lo interesante es la diferencia: nombres que ya estan
firmando o atendiendo tickets y que nadie ha registrado todavia.

No bloquea nada —a diferencia del catalogo de planes, un tecnico sin registrar
no invalida el analisis—, asi que esto es una lista para revisar, no una
verificacion previa a escribir.
"""

# backend/support/usuarios.py

from __future__ import annotations

import logging

import pandas as pd

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.support.analytics.config import SUPPORT_DIMENSIONES_PERSONA
from services.support.models import UsuarioSoporte, nombre_base, normalizar_nombre_odoo

logger = logging.getLogger(__name__)

# Relleno con el que `SUPPORT_TEXT_COLUMNS` sustituye una celda vacia. No es
# una persona: ofrecerlo como candidato a registrar seria crear un usuario
# llamado «Sin Especificar (User)».
SIN_ESPECIFICAR = "Sin Especificar"


def _clave(literal: str) -> str:
    """La forma con la que se compara un nombre contra el directorio.

    El nombre a secas, sin el sufijo y sin distinguir mayusculas. Las dos
    renuncias son deliberadas y las pide el dato: los mismos tickets escriben
    `(User)`, `(user)` y nada, y el directorio se rellena copiando el literal
    pero nada impide teclearlo luego con otra caja. Todo eso es una sola
    persona.

    Dos filas del directorio que solo difieran en la caja son tambien la misma
    persona, y entonces gana una cualquiera: no es un caso que merezca regla.
    """
    return nombre_base(literal).casefold()


def departamentos_por_usuario() -> dict[str, str]:
    """`{clave del nombre -> departamento}` para todo el directorio.

    Se consulta en cada lectura y no se cachea: son dos tablas pequenas, y lo
    que se gana es que **corregir el departamento de alguien se ve de inmediato
    en todos los meses**, tambien en los ya analizados. Resolverlo al calcular
    habria congelado el reparto al dia del analisis.
    """
    return {
        _clave(nombre): departamento
        for nombre, departamento in UsuarioSoporte.objects.values_list(
            "nombre_odoo", "departamento__nombre"
        )
    }


def anotar_departamentos(grupos: dict) -> dict:
    """Anade `departamento` a cada valor de las dos dimensiones de persona.

    Se hace **al leer** y no al calcular, por lo dicho en
    `departamentos_por_usuario`. Es tambien la razon de que la anotacion no
    viva en `estructurar_grupos`: esa funcion la comparten la lectura del mes y
    la escritura de los cortes diarios, y anotar alli dejaria el departamento
    grabado dentro del JSON del dia.

    Quien no este en el directorio se queda con la cadena vacia; es la
    interfaz la que decide como llamar a ese grupo.
    """
    if not grupos:
        return grupos

    try:
        mapa = departamentos_por_usuario()
    except Exception:
        logger.exception("No se pudo leer el directorio de soporte")
        return grupos

    for bloque in grupos.values():
        for dimension in SUPPORT_DIMENSIONES_PERSONA:
            for entrada in bloque.get(dimension, []):
                entrada["departamento"] = mapa.get(_clave(entrada.get("nombre", "")), "")

    return grupos


def usuarios_fuera_del_directorio() -> list[dict]:
    """Nombres presentes en los tickets que el directorio no reconoce.

    Se miran las dos columnas de persona —`asignado_a` y `creado_por`— porque
    son dos papeles distintos del mismo directorio: quien responde del ticket y
    quien lo abrio. El conteo viaja partido para que se vea de cual de los dos
    viene un nombre desconocido.

    La comparacion es la de `_clave`: el nombre a secas, sin sufijo y sin
    distinguir mayusculas. Los mismos tickets escriben `(User)`, `(user)` y
    nada, y las tres son la misma persona.
    """
    db = DBConnector()
    if not db.tabla_existe(TableNames.SUPPORT_TICKETS):
        return []

    try:
        df = db.query(
            f"""
            SELECT asignado_a, creado_por, COUNT(*) AS tickets
            FROM "{DB_SCHEMA}"."{TableNames.SUPPORT_TICKETS}"
            GROUP BY asignado_a, creado_por
            """
        )
    except Exception:
        logger.exception("Error al cruzar los tickets con el directorio de soporte")
        return []

    if df.empty:
        return []

    df["tickets"] = pd.to_numeric(df["tickets"], errors="coerce").fillna(0).astype(int)

    # Un diccionario por nombre normalizado, con el literal tal y como lo
    # escribe el export: es lo que se le ofrece copiar a quien lo registre.
    encontrados: dict[str, dict] = {}
    for columna, papel in (("asignado_a", "asignados"), ("creado_por", "creados")):
        if columna not in df.columns:
            continue
        for literal, tickets in df.groupby(columna)["tickets"].sum().items():
            nombre = normalizar_nombre_odoo(literal)
            if not nombre or str(literal).strip() == SIN_ESPECIFICAR:
                continue
            fila = encontrados.setdefault(
                _clave(literal),
                {"nombre_odoo": nombre, "literal": str(literal).strip(), "asignados": 0, "creados": 0},
            )
            fila[papel] += int(tickets)

    registrados = set(departamentos_por_usuario())
    return sorted(
        (fila for clave, fila in encontrados.items() if clave not in registrados),
        key=lambda fila: fila["asignados"] + fila["creados"],
        reverse=True,
    )
