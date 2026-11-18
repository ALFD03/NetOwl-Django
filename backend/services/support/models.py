"""Directorio de usuarios de soporte: quien puede crear o tener asignado un ticket.

El export de Odoo trae `Asignado a` y `Creado por` como texto libre, y ese
texto es lo unico que identifica a una persona en todo el modulo: las
dimensiones del analisis agrupan por el literal de la columna. Un nombre
escrito de dos maneras son dos tecnicos distintos en el reporte, y nada avisa.

Este directorio es el vocabulario contra el que se contrastan esos literales.
Por eso `odoo_name` no es un nombre bonito sino **el nombre exacto tal y como
Odoo lo exporta**, sufijo incluido; el nombre y el apellido de persona van
aparte, para poder presentarlos sin tocar la clave.

Viven en el esquema del entorno, igual que los catalogos de
`services/subscriptions/models.py`: la conexion fija `search_path` a DB_SCHEMA,
asi que el `db_table` no se cualifica.
"""

from __future__ import annotations

from datetime import date

from django.db import models, transaction
from django.db.models.functions import Lower

# El sufijo y su normalizacion viven en `core`: los comparte el directorio de ventas.
from core.odoo_names import normalize_odoo_name


class Department(models.Model):
    """Area a la que pertenece un usuario de soporte.

    Es un modelo y no una columna de texto por lo mismo que el directorio
    existe: un departamento tecleado libremente se escribe de tres maneras y
    deja de agrupar. Aqui solo puede elegirse uno de los que ya existen.
    """

    name = models.CharField(max_length=120, unique=True, db_column="nombre")

    class Meta:
        db_table = "catalogo_departamentos"
        ordering = ["name"]
        verbose_name = "departamento"
        verbose_name_plural = "departamentos"

    def __str__(self):
        return self.name


class InvalidMove(ValueError):
    """Un cambio de departamento, una baja o una reactivacion que no cuadra
    con las fechas que el usuario ya tiene."""


class SupportUser(models.Model):
    """Persona a la que se le puede asignar —o que puede crear— un ticket.

    `odoo_name` es la clave real: es el literal con el que la persona aparece
    en las columnas `Asignado a` y `Creado por` del export, y lo que permite
    cruzar el directorio con los tickets ya importados. `name` y `last_name`
    son para leerlo en pantalla, y no se derivan del anterior porque los
    apellidos compuestos no se parten por el primer espacio.
    """

    odoo_name = models.CharField(max_length=200, unique=True, db_column="nombre_odoo")
    name = models.CharField(max_length=120, db_column="nombre")
    last_name = models.CharField(max_length=120, blank=True, default="", db_column="apellido")
    # El departamento *vigente*. La historia completa esta en
    # `DepartmentHistory`, y esta columna es su ultima fila repetida: se
    # conserva porque es lo que filtra, ordena y cuenta el listado sin tener
    # que recorrer la historia. Solo la escriben `change_department`,
    # `undo_last_change` y la correccion del alta.
    #
    # Obligatorio y con PROTECT: un usuario sin departamento no agrupa por
    # nada, y borrar un departamento con gente dentro dejaria filas huerfanas.
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="users",
        db_column="departamento_id",
    )

    # Nulo en quien se registro antes de que existiera el campo: inventarle
    # una fecha seria peor que dejarla sin rellenar.
    start_date = models.DateField(null=True, blank=True, db_column="fecha_ingreso")
    # La baja. **No se borra a la persona**: sus tickets pasados siguen siendo
    # suyos y el directorio tiene que seguir reconociendola. Lo que cambia es
    # que a partir de esta fecha no deberia entrarle ningun ticket nuevo, y
    # `tickets_after_churn` avisa de los que entren.
    end_date = models.DateField(null=True, blank=True, db_column="fecha_egreso")

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_usuarios_soporte"
        ordering = ["odoo_name"]
        verbose_name = "usuario de soporte"
        verbose_name_plural = "usuarios de soporte"

    def __str__(self):
        return self.odoo_name

    @property
    def full_name(self) -> str:
        """Nombre y apellido, para presentar sin arrastrar el sufijo."""
        return f"{self.name} {self.last_name}".strip()

    @property
    def is_active(self) -> bool:
        return self.end_date is None

    def change_department(self, department: Department, on_date: date) -> DepartmentHistory:
        """Pasa a la persona a otro departamento a partir de `fecha`.

        Solo se anade al final: la fecha tiene que ser posterior al ultimo
        cambio y al ingreso. Insertar un cambio en medio de la historia
        reescribiria a que departamento pertenecio en meses ya revisados, y eso
        se hace deshaciendo, no colando una fila.
        """
        if not self.is_active:
            raise InvalidMove("El usuario está dado de baja: reactívalo antes de cambiarlo de departamento.")
        if department.pk == self.department_id:
            raise InvalidMove(f"El usuario ya está en «{department.name}».")
        if self.start_date and on_date <= self.start_date:
            raise InvalidMove("La fecha del cambio tiene que ser posterior a la fecha de ingreso.")
        last = self.history.exclude(since=None).order_by("-since").first()
        if last and on_date <= last.since:
            raise InvalidMove(
                f"La fecha del cambio tiene que ser posterior al último ({last.since:%d/%m/%Y})."
            )

        with transaction.atomic():
            step = self.history.create(department=department, since=on_date)
            self.department = department
            self.save(update_fields=["department", "updated_at"])
        return step

    def undo_last_change(self) -> None:
        """Borra el ultimo cambio y devuelve a la persona al departamento anterior.

        Es la unica forma de corregir la historia. La fila inicial —la del
        ingreso— no se deshace: se corrige editando el usuario mientras no
        tenga cambios encima.
        """
        steps = list(self.history.all())
        if len(steps) < 2:
            raise InvalidMove("No hay ningún cambio de departamento que deshacer.")
        with transaction.atomic():
            steps[-1].delete()
            self.department = steps[-2].department
            self.save(update_fields=["department", "updated_at"])

    def deactivate(self, on_date: date) -> None:
        """Marca la salida. No toca la historia ni borra nada."""
        if not self.is_active:
            raise InvalidMove("El usuario ya está dado de baja.")
        if self.start_date and on_date < self.start_date:
            raise InvalidMove("La fecha de egreso no puede ser anterior a la de ingreso.")
        last = self.history.exclude(since=None).order_by("-since").first()
        if last and on_date < last.since:
            raise InvalidMove(
                f"La fecha de egreso no puede ser anterior al último cambio de departamento ({last.since:%d/%m/%Y})."
            )
        self.end_date = on_date
        self.save(update_fields=["end_date", "updated_at"])

    def reactivate(self) -> None:
        """Deshace la baja: una reincorporacion o una baja puesta por error."""
        if self.is_active:
            raise InvalidMove("El usuario no está dado de baja.")
        self.end_date = None
        self.save(update_fields=["end_date", "updated_at"])

    def save(self, *args, **kwargs):
        # La normalizacion vive aqui y no solo en la vista: cualquier alta
        # —una vista futura, un comando, el shell— tiene que dejar la misma
        # cadena, porque la unicidad se apoya en ella.
        self.odoo_name = normalize_odoo_name(self.odoo_name)
        super().save(*args, **kwargs)


class DepartmentHistory(models.Model):
    """Un tramo de la vida de un usuario en un departamento.

    Una persona pasa por varios departamentos, y los tickets de un mes tienen
    que agruparse bajo el departamento en el que estaba *ese* mes, no en el de
    hoy: si no, un ascenso reescribiria el reparto de todos los meses pasados.

    Cada fila dice "a partir de `since`, en `department`", y el tramo acaba
    donde empieza el siguiente. La primera fila tiene `since` nulo y significa
    "desde el ingreso": asi no hay que mantenerla sincronizada con
    `start_date`, que puede faltar o corregirse despues.

    Vive en el esquema del entorno, como el resto del directorio.
    """

    user = models.ForeignKey(
        SupportUser,
        on_delete=models.CASCADE,
        related_name="history",
        db_column="usuario_id",
    )
    # PROTECT por lo mismo que en el usuario: borrar un departamento por el
    # que alguien paso dejaria meses pasados sin donde agrupar.
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="history",
        db_column="departamento_id",
    )
    since = models.DateField(null=True, blank=True, db_column="desde")

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")

    class Meta:
        db_table = "catalogo_usuarios_soporte_historial"
        ordering = [models.F("since").asc(nulls_first=True), "id"]
        verbose_name = "cambio de departamento"
        verbose_name_plural = "historial de departamentos"

    def __str__(self):
        return f"{self.user_id} -> {self.department_id} ({self.since or 'ingreso'})"


class SupportStage(models.Model):
    """Una etapa de los tickets: de que equipo es y que se hace en ella.

    Los logs de etapa solo dicen "de A paso a B". Para repartir el tiempo de un
    ticket entre ATC y Soporte, y dentro de cada uno entre cola, pausa y gestion,
    hace falta saber que es cada etapa, y el nombre no basta: el sufijo
    `- Soporte Técnico` no lo llevan todas las de Soporte («Volver a contactar»,
    «Pausado - Final de mes») y alguna se usa en los dos equipos («En espera -
    Falla masiva»). Esta tabla es esa clasificacion, mantenida a mano.

    Una etapa `compartida` toma el equipo del momento: de ATC antes del
    escalamiento, de Soporte despues. Las de cierre (Resuelto, Cancelado) no se
    registran aqui: son fijas, las mismas que cierran un ticket en el resto del
    modulo. El analisis lee la tabla al empezar, asi que reclasificar una etapa
    se ve en cuanto se vuelve a ejecutar, en todos los meses.
    """

    TEAMS = [
        ("atc", "Atención al cliente"),
        ("soporte", "Soporte técnico"),
        ("compartida", "Compartida"),
    ]
    KINDS = [
        ("cola", "Cola"),
        ("pausa", "Pausa"),
        ("gestion", "Gestión"),
    ]

    # El literal exacto de Odoo: es la clave contra la que se cruzan los logs.
    name = models.CharField(max_length=200, db_column="nombre")
    team = models.CharField(max_length=12, choices=TEAMS, db_column="equipo")
    kind = models.CharField(max_length=12, choices=KINDS, db_column="tipo")

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_etapas_soporte"
        ordering = ["team", "name"]
        verbose_name = "etapa de soporte"
        verbose_name_plural = "etapas de soporte"
        constraints = [
            # Los logs se cruzan sin distinguir mayusculas: dos filas que solo
            # difieren en la caja serian la misma etapa.
            models.UniqueConstraint(Lower("name"), name="etapa_soporte_nombre_unico"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        self.name = " ".join(str(self.name or "").split())
        super().save(*args, **kwargs)
