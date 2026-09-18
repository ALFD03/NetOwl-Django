"""Directorio de usuarios de soporte: quien puede crear o tener asignado un ticket.

El export de Odoo trae `Asignado a` y `Creado por` como texto libre, y ese
texto es lo unico que identifica a una persona en todo el modulo: las
dimensiones del analisis agrupan por el literal de la columna. Un nombre
escrito de dos maneras son dos tecnicos distintos en el reporte, y nada avisa.

Este directorio es el vocabulario contra el que se contrastan esos literales.
Por eso `nombre_odoo` no es un nombre bonito sino **el nombre exacto tal y como
Odoo lo exporta**, sufijo incluido; el nombre y el apellido de persona van
aparte, para poder presentarlos sin tocar la clave.

**Viven en `public`, sin cualificar con DB_SCHEMA**, igual que los catalogos de
`services/subscriptions/models.py`: la plantilla es una por empresa, y darle a
cada entorno la suya solo produce divergencias silenciosas. Lo que se cualifica
por esquema son los datos calculados, no el vocabulario del negocio.
"""

from __future__ import annotations

import re

from django.db import models

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


class Departamento(models.Model):
    """Area a la que pertenece un usuario de soporte.

    Es un modelo y no una columna de texto por lo mismo que el directorio
    existe: un departamento tecleado libremente se escribe de tres maneras y
    deja de agrupar. Aqui solo puede elegirse uno de los que ya existen.
    """

    nombre = models.CharField(max_length=120, unique=True)

    class Meta:
        db_table = "catalogo_departamentos"
        ordering = ["nombre"]
        verbose_name = "departamento"
        verbose_name_plural = "departamentos"

    def __str__(self):
        return self.nombre


class UsuarioSoporte(models.Model):
    """Persona a la que se le puede asignar —o que puede crear— un ticket.

    `nombre_odoo` es la clave real: es el literal con el que la persona aparece
    en las columnas `Asignado a` y `Creado por` del export, y lo que permite
    cruzar el directorio con los tickets ya importados. `nombre` y `apellido`
    son para leerlo en pantalla, y no se derivan del anterior porque los
    apellidos compuestos no se parten por el primer espacio.
    """

    nombre_odoo = models.CharField(max_length=200, unique=True)
    nombre = models.CharField(max_length=120)
    apellido = models.CharField(max_length=120, blank=True, default="")
    # Obligatorio y con PROTECT: un usuario sin departamento no agrupa por
    # nada, y borrar un departamento con gente dentro dejaria filas huerfanas.
    departamento = models.ForeignKey(
        Departamento,
        on_delete=models.PROTECT,
        related_name="usuarios",
    )

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_usuarios_soporte"
        ordering = ["nombre_odoo"]
        verbose_name = "usuario de soporte"
        verbose_name_plural = "usuarios de soporte"

    def __str__(self):
        return self.nombre_odoo

    @property
    def nombre_completo(self) -> str:
        """Nombre y apellido, para presentar sin arrastrar el sufijo."""
        return f"{self.nombre} {self.apellido}".strip()

    def save(self, *args, **kwargs):
        # La normalizacion vive aqui y no solo en la vista: cualquier alta
        # —una vista futura, un comando, el shell— tiene que dejar la misma
        # cadena, porque la unicidad se apoya en ella.
        self.nombre_odoo = normalizar_nombre_odoo(self.nombre_odoo)
        super().save(*args, **kwargs)
