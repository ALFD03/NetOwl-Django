"""Como escribe Odoo el nombre de una persona, y como se compara.

El export de Odoo identifica a una persona por un texto: `Asignado a` y
`Creado por` en los tickets, `Vendedor` en las suscripciones. Ese texto es el
nombre del usuario de Odoo con un sufijo, y es lo unico que hay para cruzarlo
contra un directorio. Lo usan los dos que existen —el de soporte
(`services/support/models.py`) y el de ventas (`services/catalogos/models.py`)—,
y por eso vive en `core`: ningun dominio importa del otro.
"""

from __future__ import annotations

import re

# Sufijo con el que Odoo cierra el nombre de usuario en los exports.
#
# **Es `(User)`, en singular.** Se comprobo contra los tickets ya cargados: de
# los 329 nombres distintos que hay en `asignado_a` y `creado_por`, todos menos
# cuatro lo escriben asi, los otros cuatro en minuscula, y solo `OdooBot` y el
# relleno `Sin Especificar` no lo llevan. Guardar `(Users)` habria dejado un
# directorio que no casa con una sola fila del export.
SUFIJO_USUARIOS = "(User)"

# Un sufijo de usuario al final de la cadena, escrito como sea: `(User)`,
# `(user)`, `(Users)`, con o sin espacios. Solo se reconoce esa palabra, para
# no comerse un parentesis que forme parte del nombre.
_SUFIJO_RE = re.compile(r"\s*\(\s*users?\s*\)\s*$", re.IGNORECASE)


def nombre_base(valor: str) -> str:
    """El nombre de la persona sin el sufijo y con los espacios colapsados.

    Es lo que identifica a alguien: **la coincidencia no depende de que
    variante del sufijo traiga el export**, que ya viene escrito de tres formas
    distintas en los mismos datos.
    """
    return _SUFIJO_RE.sub("", " ".join(str(valor or "").split()))


def normalizar_nombre_odoo(valor: str) -> str:
    """El nombre exacto de Odoo, con el sufijo canonico puesto.

    Escribirlo a mano es la mitad de los errores de tipeo —o se olvida, o se
    escribe `(users)`, o con dos espacios delante—, y cualquiera de las tres
    deja una fila que se lee distinta de las demas. Se acepta cualquier
    variante y se guarda siempre la misma.
    """
    base = nombre_base(valor)
    return f"{base} {SUFIJO_USUARIOS}" if base else ""


def clave_nombre(literal: str) -> str:
    """La forma con la que se compara un nombre contra un directorio.

    El nombre a secas, sin el sufijo y sin distinguir mayusculas. Las dos
    renuncias son deliberadas y las pide el dato: los mismos exports escriben
    `(User)`, `(user)` y nada, y un directorio se rellena copiando el literal
    pero nada impide teclearlo luego con otra caja. Todo eso es una sola
    persona.

    Dos filas de un directorio que solo difieran en la caja son tambien la
    misma persona, y entonces gana una cualquiera: no es un caso que merezca
    regla.
    """
    return nombre_base(literal).casefold()
