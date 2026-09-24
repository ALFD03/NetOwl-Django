"""Directorio de usuarios de soporte: quien puede crear o tener asignado un ticket.

El export de Odoo trae `Asignado a` y `Creado por` como texto libre, y ese
texto es lo unico que identifica a una persona en todo el modulo: las
dimensiones del analisis agrupan por el literal de la columna. Un nombre
escrito de dos maneras son dos tecnicos distintos en el reporte, y nada avisa.

Este directorio es el vocabulario contra el que se contrastan esos literales.
Por eso `nombre_odoo` no es un nombre bonito sino **el nombre exacto tal y como
Odoo lo exporta**, sufijo incluido; el nombre y el apellido de persona van
aparte, para poder presentarlos sin tocar la clave.

Viven en el esquema del entorno, igual que los catalogos de
`services/subscriptions/models.py`: la conexion fija `search_path` a DB_SCHEMA,
asi que el `db_table` no se cualifica.
"""

from __future__ import annotations

import re
from datetime import date

from django.db import models, transaction

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


class MovimientoInvalido(ValueError):
    """Un cambio de departamento, una baja o una reactivacion que no cuadra
    con las fechas que el usuario ya tiene."""


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
    # El departamento *vigente*. La historia completa esta en
    # `HistorialDepartamento`, y esta columna es su ultima fila repetida: se
    # conserva porque es lo que filtra, ordena y cuenta el listado sin tener
    # que recorrer la historia. Solo la escriben `cambiar_departamento`,
    # `deshacer_ultimo_cambio` y la correccion del alta.
    #
    # Obligatorio y con PROTECT: un usuario sin departamento no agrupa por
    # nada, y borrar un departamento con gente dentro dejaria filas huerfanas.
    departamento = models.ForeignKey(
        Departamento,
        on_delete=models.PROTECT,
        related_name="usuarios",
    )

    # Nulo en quien se registro antes de que existiera el campo: inventarle
    # una fecha seria peor que dejarla sin rellenar.
    fecha_ingreso = models.DateField(null=True, blank=True)
    # La baja. **No se borra a la persona**: sus tickets pasados siguen siendo
    # suyos y el directorio tiene que seguir reconociendola. Lo que cambia es
    # que a partir de esta fecha no deberia entrarle ningun ticket nuevo, y
    # `tickets_tras_la_baja` avisa de los que entren.
    fecha_egreso = models.DateField(null=True, blank=True)

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

    @property
    def activo(self) -> bool:
        return self.fecha_egreso is None

    def cambiar_departamento(self, departamento: Departamento, fecha: date) -> HistorialDepartamento:
        """Pasa a la persona a otro departamento a partir de `fecha`.

        Solo se anade al final: la fecha tiene que ser posterior al ultimo
        cambio y al ingreso. Insertar un cambio en medio de la historia
        reescribiria a que departamento pertenecio en meses ya revisados, y eso
        se hace deshaciendo, no colando una fila.
        """
        if not self.activo:
            raise MovimientoInvalido("El usuario está dado de baja: reactívalo antes de cambiarlo de departamento.")
        if departamento.pk == self.departamento_id:
            raise MovimientoInvalido(f"El usuario ya está en «{departamento.nombre}».")
        if self.fecha_ingreso and fecha <= self.fecha_ingreso:
            raise MovimientoInvalido("La fecha del cambio tiene que ser posterior a la fecha de ingreso.")
        ultimo = self.historial.exclude(desde=None).order_by("-desde").first()
        if ultimo and fecha <= ultimo.desde:
            raise MovimientoInvalido(
                f"La fecha del cambio tiene que ser posterior al último ({ultimo.desde:%d/%m/%Y})."
            )

        with transaction.atomic():
            paso = self.historial.create(departamento=departamento, desde=fecha)
            self.departamento = departamento
            self.save(update_fields=["departamento", "actualizado_en"])
        return paso

    def deshacer_ultimo_cambio(self) -> None:
        """Borra el ultimo cambio y devuelve a la persona al departamento anterior.

        Es la unica forma de corregir la historia. La fila inicial —la del
        ingreso— no se deshace: se corrige editando el usuario mientras no
        tenga cambios encima.
        """
        pasos = list(self.historial.all())
        if len(pasos) < 2:
            raise MovimientoInvalido("No hay ningún cambio de departamento que deshacer.")
        with transaction.atomic():
            pasos[-1].delete()
            self.departamento = pasos[-2].departamento
            self.save(update_fields=["departamento", "actualizado_en"])

    def dar_de_baja(self, fecha: date) -> None:
        """Marca la salida. No toca la historia ni borra nada."""
        if not self.activo:
            raise MovimientoInvalido("El usuario ya está dado de baja.")
        if self.fecha_ingreso and fecha < self.fecha_ingreso:
            raise MovimientoInvalido("La fecha de egreso no puede ser anterior a la de ingreso.")
        ultimo = self.historial.exclude(desde=None).order_by("-desde").first()
        if ultimo and fecha < ultimo.desde:
            raise MovimientoInvalido(
                f"La fecha de egreso no puede ser anterior al último cambio de departamento ({ultimo.desde:%d/%m/%Y})."
            )
        self.fecha_egreso = fecha
        self.save(update_fields=["fecha_egreso", "actualizado_en"])

    def reactivar(self) -> None:
        """Deshace la baja: una reincorporacion o una baja puesta por error."""
        if self.activo:
            raise MovimientoInvalido("El usuario no está dado de baja.")
        self.fecha_egreso = None
        self.save(update_fields=["fecha_egreso", "actualizado_en"])

    def save(self, *args, **kwargs):
        # La normalizacion vive aqui y no solo en la vista: cualquier alta
        # —una vista futura, un comando, el shell— tiene que dejar la misma
        # cadena, porque la unicidad se apoya en ella.
        self.nombre_odoo = normalizar_nombre_odoo(self.nombre_odoo)
        super().save(*args, **kwargs)


class HistorialDepartamento(models.Model):
    """Un tramo de la vida de un usuario en un departamento.

    Una persona pasa por varios departamentos, y los tickets de un mes tienen
    que agruparse bajo el departamento en el que estaba *ese* mes, no en el de
    hoy: si no, un ascenso reescribiria el reparto de todos los meses pasados.

    Cada fila dice "a partir de `desde`, en `departamento`", y el tramo acaba
    donde empieza el siguiente. La primera fila tiene `desde` nulo y significa
    "desde el ingreso": asi no hay que mantenerla sincronizada con
    `fecha_ingreso`, que puede faltar o corregirse despues.

    Vive en el esquema del entorno, como el resto del directorio.
    """

    usuario = models.ForeignKey(
        UsuarioSoporte,
        on_delete=models.CASCADE,
        related_name="historial",
    )
    # PROTECT por lo mismo que en el usuario: borrar un departamento por el
    # que alguien paso dejaria meses pasados sin donde agrupar.
    departamento = models.ForeignKey(
        Departamento,
        on_delete=models.PROTECT,
        related_name="historial",
    )
    desde = models.DateField(null=True, blank=True)

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "catalogo_usuarios_soporte_historial"
        ordering = [models.F("desde").asc(nulls_first=True), "id"]
        verbose_name = "cambio de departamento"
        verbose_name_plural = "historial de departamentos"

    def __str__(self):
        return f"{self.usuario_id} -> {self.departamento_id} ({self.desde or 'ingreso'})"
