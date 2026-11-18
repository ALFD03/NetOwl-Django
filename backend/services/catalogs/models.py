"""Directorio de ventas: las personas que cobran comisiones y los equipos donde trabajan.

El export de suscripciones dice quien hizo cada venta en tres columnas de
texto libre, y ese texto es lo unico que identifica a una persona:

- `Medio`: quien hizo la venta. Un asesor, o un supervisor o coordinador que
  vendio directamente. Odoo lo escribe como nombre + apellido («Ahiam
  Aguilar»), sin sufijo.
- `Oportunidad/Administrador`: el supervisor del equipo, escrito igual.
- `Vendedor`: la coordinadora de oficina, como **usuario de Odoo**: el nombre
  completo con el sufijo `(User)` («Ahiam Samuel Aguilar Lugo (User)»).

`SalesPerson` es la **identidad**: nombre y esos literales, que son el
vocabulario contra el que se contrastan las columnas. Lo que la persona *es*
—jefe, supervisor, asesor...— depende del equipo donde trabaja, y una persona
puede estar en varios (el gerente de operaciones es el mismo en Aragua y La
Victoria): eso es `TeamMembership`, una fila por (persona, equipo) con su
rol y las relaciones que ese rol necesita (site, superior, unidades).

Los equipos y sus roles son codigo (`services/catalogs/teams.py`); lo que se
edita aqui son las personas y las condiciones de pago de cada rol
(`TeamConditions`).

La unidad de negocio es `Coordinator` (el catalogo dueño de las zonas), no una
persona: quien la lleva es la membresia que la tiene en `units`.

Vive en el esquema del entorno, como los demas catalogos.
"""

from __future__ import annotations

from django.db import models
from django.db.models.functions import Lower

from core.odoo_names import base_name, name_key, normalize_odoo_name
from services.catalogs.teams import ROLE_CHOICES


class SalesTeam(models.Model):
    """Un equipo de ventas: agrupa roles, personas y condiciones de pago.

    Los cinco equipos los siembra la migracion `0006` con los slugs de
    `teams.TEAMS`; no se crean ni se borran desde la web.
    """

    slug = models.SlugField(max_length=30, unique=True)
    name = models.CharField(max_length=60, unique=True, db_column="nombre")
    order = models.PositiveSmallIntegerField(default=0, db_column="orden")

    class Meta:
        db_table = "catalogo_equipos_ventas"
        ordering = ["order", "name"]
        verbose_name = "equipo de ventas"
        verbose_name_plural = "equipos de ventas"

    def __str__(self):
        return self.name


class SalesPerson(models.Model):
    """Una persona de la fuerza de ventas, con como la escribe Odoo.

    `channel` es el literal exacto de la columna `Medio`, no un nombre bonito:
    suele ser nombre + apellido, pero no siempre el primer nombre y el primer
    apellido de `name`/`last_name` (y a veces con otra grafia), asi que se
    guarda tal cual y no se deriva. Vacio si el rol no vende (la administradora
    y el gerente de operaciones).

    `supervisor_channel` es el de `Oportunidad/Administrador`, que para la misma persona
    Odoo a veces escribe distinto. Vacio es "el mismo que `channel`", que es lo
    habitual; `supervisor_literal` da el que vale.

    `odoo_user` es el literal de `Vendedor` (coordinadoras de oficina y
    administradora): se guarda siempre con el sufijo canonico, como el
    directorio de soporte.

    Que literales exige cada rol lo comprueba la vista contra `teams.ROLES`.
    La comparacion contra el export no distingue mayusculas ni el sufijo
    (`core.odoo_names.name_key`), y por eso las unicidades son sobre el
    texto en minusculas.
    """

    name = models.CharField(max_length=80, db_column="nombre")
    last_name = models.CharField(max_length=80, db_column="apellido")
    channel = models.CharField(max_length=160, blank=True, default="", db_column="medio")
    supervisor_channel = models.CharField(max_length=160, blank=True, default="", db_column="medio_supervisor")
    odoo_user = models.CharField(max_length=200, blank=True, default="", db_column="usuario_odoo")

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_personas_ventas"
        ordering = ["name", "last_name"]
        constraints = [
            models.UniqueConstraint(
                Lower("channel"),
                condition=~models.Q(channel=""),
                name="persona_ventas_medio_unico",
            ),
            models.UniqueConstraint(
                Lower("supervisor_channel"),
                condition=~models.Q(supervisor_channel=""),
                name="persona_ventas_medio_supervisor_unico",
            ),
            models.UniqueConstraint(
                Lower("odoo_user"),
                condition=~models.Q(odoo_user=""),
                name="persona_ventas_usuario_unico",
            ),
        ]
        verbose_name = "persona de ventas"
        verbose_name_plural = "personas de ventas"

    def save(self, *args, **kwargs):
        """Normaliza los literales antes de guardar.

        En `save()` y no solo en la vista porque las unicidades descansan en
        ello: dos espacios de mas harian de la misma persona dos filas. Un
        `supervisor_channel` igual al `channel` se vacia: no dice nada distinto.
        """
        self.channel = base_name(self.channel) if self.channel else ""
        self.supervisor_channel = base_name(self.supervisor_channel) if self.supervisor_channel else ""
        if self.supervisor_channel.casefold() == self.channel.casefold():
            self.supervisor_channel = ""
        self.odoo_user = normalize_odoo_name(self.odoo_user) if self.odoo_user else ""
        super().save(*args, **kwargs)

    @property
    def supervisor_literal(self) -> str:
        """Como aparece en `Oportunidad/Administrador`."""
        return self.supervisor_channel or self.channel

    def literals(self, column: str) -> list[str]:
        """Todo lo que Odoo escribe para esta persona en una columna: el principal y sus otros nombres.

        `columna` es `medio`, `supervisor` o `usuario`. En `supervisor`, si no
        tiene un nombre propio se cuentan los de `medio` (con los suyos): es
        «el mismo que el medio», y si Odoo lo escribe de dos formas, lo hace
        tambien ahi. Pide `aliases` precargado (`prefetch_related("aliases")`) al recorrer muchas.
        """
        extra = lambda c: [a.literal for a in self.aliases.all() if a.column == c]  # noqa: E731
        if column == "medio":
            main = [self.channel, *extra("medio")]
        elif column == "usuario":
            main = [self.odoo_user, *extra("usuario")]
        else:
            base = [self.supervisor_channel] if self.supervisor_channel else [self.channel, *extra("medio")]
            main = [*base, *extra("supervisor")]
        return [literal for literal in main if literal]

    def name_keys(self, column: str) -> set[str]:
        """Las claves de comparacion (`name_key`) de `literals(columna)`."""
        return {key for key in (name_key(text) for text in self.literals(column)) if key}

    @property
    def full_name(self) -> str:
        return f"{self.name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name


class PersonAlias(models.Model):
    """Otro nombre con el que Odoo escribe a una persona en una de las tres columnas.

    El literal principal vive en `SalesPerson` (`channel`, `supervisor_channel`,
    `odoo_user`); aqui van los demas: la misma persona escrita «Maria Campos»
    en unas ventas y «María Campos» en otras es una sola, no dos. Cada columna
    tiene los suyos (`column`: `medio`, `supervisor` o `usuario`).

    La unicidad entre personas la comprueba la vista contra el principal y los
    otros nombres de todas; aqui solo se evita repetir uno de la misma columna.
    """

    COLUMNS = [("medio", "Medio"), ("supervisor", "Oportunidad/Administrador"), ("usuario", "Vendedor")]

    person = models.ForeignKey(SalesPerson, on_delete=models.CASCADE, related_name="aliases", db_column="persona_id")
    column = models.CharField(max_length=10, choices=COLUMNS, db_column="columna")
    literal = models.CharField(max_length=200)

    class Meta:
        db_table = "catalogo_alias_persona"
        ordering = ["column", "literal"]
        constraints = [
            models.UniqueConstraint(Lower("literal"), "column", name="alias_persona_literal_unico"),
        ]
        verbose_name = "otro nombre de una persona de ventas"
        verbose_name_plural = "otros nombres de personas de ventas"

    def save(self, *args, **kwargs):
        """Normaliza como el principal: sin sufijo y con espacios colapsados (con sufijo canonico en `usuario`)."""
        self.literal = normalize_odoo_name(self.literal) if self.column == "usuario" else base_name(self.literal)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.literal} ({self.get_column_display()})"


class TeamMembership(models.Model):
    """El papel de una persona en un equipo, con lo que ese papel necesita.

    Una persona tiene como mucho una membresia por equipo. Los campos que no
    aplican al rol (ver `teams.ROLES`) quedan vacios; la vista los comprueba y
    `save()` los limpia.

    - `sites`: los sites de una coordinadora de oficina (uno o varios); de ellos sale
      su % de ventas (el promedio simple si son varios) y bajo cada uno se la muestra
      en el Sales Report. La vista no deja borrar un site que alguna lleve: la dejaria
      fuera del reporte sin avisar.
    - `manager`: a quien responde un supervisor (el coordinador de UN o el gerente de UN
      de su equipo, segun `teams.SUPERVISOR_MANAGER`).
    - `units`: las unidades de negocio que lleva. Una para el coordinador de UN; varias
      para el jefe, el gerente de UN y el gerente de operaciones.
    """

    person = models.ForeignKey(SalesPerson, on_delete=models.CASCADE, related_name="memberships", db_column="persona_id")
    team = models.ForeignKey(SalesTeam, on_delete=models.PROTECT, related_name="memberships", db_column="equipo_id")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, db_column="rol")
    sites = models.ManyToManyField(
        "subscriptions.Site", blank=True, related_name="memberships", through="MembershipSite",
    )
    manager = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subordinates",
        db_column="superior_id",
    )
    units = models.ManyToManyField(
        "subscriptions.Coordinator", blank=True, related_name="memberships", through="MembershipUnit",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_membresias_equipo"
        ordering = ["team__order", "role", "person__name", "person__last_name"]
        constraints = [
            models.UniqueConstraint(fields=["person", "team"], name="membresia_persona_equipo_unica"),
        ]
        verbose_name = "miembro de un equipo de ventas"
        verbose_name_plural = "miembros de equipos de ventas"

    def save(self, *args, **kwargs):
        """Quita el superior cuando el rol no lo lleva (sites y unidades las limpia la vista: son M2M)."""
        if self.role != "supervisor":
            self.manager = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.person} · {self.get_role_display()} ({self.team})"


class TeamConditions(models.Model):
    """Los valores de pago de un rol de un equipo (ver `teams.PIECES_BY_ROLE`).

    Solo hay fila cuando alguien edito algo; sin ella el rol paga con
    `teams.DEFAULT_PARAMETERS`. No se versionan: un periodo cerrado guarda
    copia de las que uso (ver `CommissionPeriod`), asi que cambiarlas solo afecta
    a lo que se calcule despues.
    """

    team = models.ForeignKey(SalesTeam, on_delete=models.CASCADE, related_name="conditions", db_column="equipo_id")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, db_column="rol")
    params = models.JSONField(default=dict, db_column="parametros")
    updated_by = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="actualizado_por_id",
    )
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_condiciones_equipo"
        constraints = [
            models.UniqueConstraint(fields=["team", "role"], name="condiciones_equipo_rol_unica"),
        ]
        verbose_name = "condiciones de pago de un rol"
        verbose_name_plural = "condiciones de pago de los roles"

    def __str__(self):
        return f"{self.team} · {self.get_role_display()}"


class OfficeSalesTarget(models.Model):
    """Un tramo del objetivo de ventas de las coordinadoras de oficina.

    Es una cantidad de ventas al mes, no un %: contra ella se mide en el Sales
    Report lo que vendio la coordinadora como `Medio`. `person` nula es el
    **general**, el de todas las que no tengan uno propio; con persona, el
    **individual**, que manda sobre el general.

    Mismo criterio de vigencia que `CommercialTarget`: el tramo vale desde su
    mes (`since`, `YYYY-MM`; nulo es "desde siempre") hasta que empieza el
    siguiente de la misma persona —o del general—, asi que cambiar un objetivo
    no reescribe los meses que ya pasaron. La unicidad de (persona, desde) la
    comprueba la vista: Postgres trata los NULL como distintos en un UNIQUE.
    """

    person = models.ForeignKey(
        SalesPerson,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sales_targets",
        db_column="persona_id",
    )
    since = models.CharField(max_length=7, null=True, blank=True, db_column="desde")
    sales = models.PositiveIntegerField(db_column="ventas")
    note = models.CharField(max_length=255, blank=True, default="", db_column="nota")
    updated_by = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="actualizado_por_id",
    )
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_objetivos_ventas_oficina"
        ordering = [models.F("person").asc(nulls_first=True), models.F("since").asc(nulls_first=True), "id"]
        verbose_name = "objetivo de ventas de oficina"
        verbose_name_plural = "objetivos de ventas de oficina"

    def __str__(self):
        who = self.person.full_name if self.person_id else "general"
        return f"{who} desde {self.since or 'siempre'}: {self.sales}"


class MembershipSite(models.Model):
    """Un site de una membresia (la tabla del M2M `TeamMembership.sites`)."""

    membership = models.ForeignKey(TeamMembership, on_delete=models.CASCADE, db_column="membresiaequipo_id")
    site = models.ForeignKey("subscriptions.Site", on_delete=models.CASCADE, db_column="site_id")

    class Meta:
        db_table = "catalogo_membresias_equipo_sites"
        unique_together = [("membership", "site")]


class MembershipUnit(models.Model):
    """Una unidad de negocio de una membresia (la tabla del M2M `TeamMembership.units`)."""

    membership = models.ForeignKey(TeamMembership, on_delete=models.CASCADE, db_column="membresiaequipo_id")
    unit = models.ForeignKey("subscriptions.Coordinator", on_delete=models.CASCADE, db_column="coordinador_id")

    class Meta:
        db_table = "catalogo_membresias_equipo_unidades"
        unique_together = [("membership", "unit")]
