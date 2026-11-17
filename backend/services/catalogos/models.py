"""Directorio de ventas: las personas que cobran comisiones y los equipos donde trabajan.

El export de suscripciones dice quien hizo cada venta en tres columnas de
texto libre, y ese texto es lo unico que identifica a una persona:

- `Medio`: quien hizo la venta. Un asesor, o un supervisor o coordinador que
  vendio directamente. Odoo lo escribe como nombre + apellido («Ahiam
  Aguilar»), sin sufijo.
- `Oportunidad/Administrador`: el supervisor del equipo, escrito igual.
- `Vendedor`: la coordinadora de oficina, como **usuario de Odoo**: el nombre
  completo con el sufijo `(User)` («Ahiam Samuel Aguilar Lugo (User)»).

`PersonaVentas` es la **identidad**: nombre y esos literales, que son el
vocabulario contra el que se contrastan las columnas. Lo que la persona *es*
—jefe, supervisor, asesor...— depende del equipo donde trabaja, y una persona
puede estar en varios (el gerente de operaciones es el mismo en Aragua y La
Victoria): eso es `MembresiaEquipo`, una fila por (persona, equipo) con su
rol y las relaciones que ese rol necesita (site, superior, unidades).

Los equipos y sus roles son codigo (`services/catalogos/equipos.py`); lo que se
edita aqui son las personas y las condiciones de pago de cada rol
(`CondicionesEquipo`).

La unidad de negocio es `Coordinador` (el catalogo dueño de las zonas), no una
persona: quien la lleva es la membresia que la tiene en `unidades`.

Vive en el esquema del entorno, como los demas catalogos.
"""

from __future__ import annotations

from django.db import models
from django.db.models.functions import Lower

from core.odoo_nombres import clave_nombre, nombre_base, normalizar_nombre_odoo
from services.catalogos.equipos import ROL_CHOICES


class EquipoVentas(models.Model):
    """Un equipo de ventas: agrupa roles, personas y condiciones de pago.

    Los cinco equipos los siembra la migracion `0006` con los slugs de
    `equipos.EQUIPOS`; no se crean ni se borran desde la web.
    """

    slug = models.SlugField(max_length=30, unique=True)
    nombre = models.CharField(max_length=60, unique=True)
    orden = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "catalogo_equipos_ventas"
        ordering = ["orden", "nombre"]
        verbose_name = "equipo de ventas"
        verbose_name_plural = "equipos de ventas"

    def __str__(self):
        return self.nombre


class PersonaVentas(models.Model):
    """Una persona de la fuerza de ventas, con como la escribe Odoo.

    `medio` es el literal exacto de la columna `Medio`, no un nombre bonito:
    suele ser nombre + apellido, pero no siempre el primer nombre y el primer
    apellido de `nombre`/`apellido` (y a veces con otra grafia), asi que se
    guarda tal cual y no se deriva. Vacio si el rol no vende (la administradora
    y el gerente de operaciones).

    `medio_supervisor` es el de `Oportunidad/Administrador`, que para la misma persona
    Odoo a veces escribe distinto. Vacio es "el mismo que `medio`", que es lo
    habitual; `literal_supervisor` da el que vale.

    `usuario_odoo` es el literal de `Vendedor` (coordinadoras de oficina y
    administradora): se guarda siempre con el sufijo canonico, como el
    directorio de soporte.

    Que literales exige cada rol lo comprueba la vista contra `equipos.ROLES`.
    La comparacion contra el export no distingue mayusculas ni el sufijo
    (`core.odoo_nombres.clave_nombre`), y por eso las unicidades son sobre el
    texto en minusculas.
    """

    nombre = models.CharField(max_length=80)
    apellido = models.CharField(max_length=80)
    medio = models.CharField(max_length=160, blank=True, default="")
    medio_supervisor = models.CharField(max_length=160, blank=True, default="")
    usuario_odoo = models.CharField(max_length=200, blank=True, default="")

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_personas_ventas"
        ordering = ["nombre", "apellido"]
        constraints = [
            models.UniqueConstraint(
                Lower("medio"),
                condition=~models.Q(medio=""),
                name="persona_ventas_medio_unico",
            ),
            models.UniqueConstraint(
                Lower("medio_supervisor"),
                condition=~models.Q(medio_supervisor=""),
                name="persona_ventas_medio_supervisor_unico",
            ),
            models.UniqueConstraint(
                Lower("usuario_odoo"),
                condition=~models.Q(usuario_odoo=""),
                name="persona_ventas_usuario_unico",
            ),
        ]
        verbose_name = "persona de ventas"
        verbose_name_plural = "personas de ventas"

    def save(self, *args, **kwargs):
        """Normaliza los literales antes de guardar.

        En `save()` y no solo en la vista porque las unicidades descansan en
        ello: dos espacios de mas harian de la misma persona dos filas. Un
        `medio_supervisor` igual al `medio` se vacia: no dice nada distinto.
        """
        self.medio = nombre_base(self.medio) if self.medio else ""
        self.medio_supervisor = nombre_base(self.medio_supervisor) if self.medio_supervisor else ""
        if self.medio_supervisor.casefold() == self.medio.casefold():
            self.medio_supervisor = ""
        self.usuario_odoo = normalizar_nombre_odoo(self.usuario_odoo) if self.usuario_odoo else ""
        super().save(*args, **kwargs)

    @property
    def literal_supervisor(self) -> str:
        """Como aparece en `Oportunidad/Administrador`."""
        return self.medio_supervisor or self.medio

    def literales(self, columna: str) -> list[str]:
        """Todo lo que Odoo escribe para esta persona en una columna: el principal y sus otros nombres.

        `columna` es `medio`, `supervisor` o `usuario`. En `supervisor`, si no
        tiene un nombre propio se cuentan los de `medio` (con los suyos): es
        «el mismo que el medio», y si Odoo lo escribe de dos formas, lo hace
        tambien ahi. Pide `alias` precargado (`prefetch_related("alias")`) al recorrer muchas.
        """
        extra = lambda c: [a.literal for a in self.alias.all() if a.columna == c]  # noqa: E731
        if columna == "medio":
            principal = [self.medio, *extra("medio")]
        elif columna == "usuario":
            principal = [self.usuario_odoo, *extra("usuario")]
        else:
            base = [self.medio_supervisor] if self.medio_supervisor else [self.medio, *extra("medio")]
            principal = [*base, *extra("supervisor")]
        return [literal for literal in principal if literal]

    def claves(self, columna: str) -> set[str]:
        """Las claves de comparacion (`clave_nombre`) de `literales(columna)`."""
        return {clave for clave in (clave_nombre(texto) for texto in self.literales(columna)) if clave}

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido}".strip()

    def __str__(self):
        return self.nombre_completo


class AliasPersona(models.Model):
    """Otro nombre con el que Odoo escribe a una persona en una de las tres columnas.

    El literal principal vive en `PersonaVentas` (`medio`, `medio_supervisor`,
    `usuario_odoo`); aqui van los demas: la misma persona escrita «Maria Campos»
    en unas ventas y «María Campos» en otras es una sola, no dos. Cada columna
    tiene los suyos (`columna`: `medio`, `supervisor` o `usuario`).

    La unicidad entre personas la comprueba la vista contra el principal y los
    otros nombres de todas; aqui solo se evita repetir uno de la misma columna.
    """

    COLUMNAS = [("medio", "Medio"), ("supervisor", "Oportunidad/Administrador"), ("usuario", "Vendedor")]

    persona = models.ForeignKey(PersonaVentas, on_delete=models.CASCADE, related_name="alias")
    columna = models.CharField(max_length=10, choices=COLUMNAS)
    literal = models.CharField(max_length=200)

    class Meta:
        db_table = "catalogo_alias_persona"
        ordering = ["columna", "literal"]
        constraints = [
            models.UniqueConstraint(Lower("literal"), "columna", name="alias_persona_literal_unico"),
        ]
        verbose_name = "otro nombre de una persona de ventas"
        verbose_name_plural = "otros nombres de personas de ventas"

    def save(self, *args, **kwargs):
        """Normaliza como el principal: sin sufijo y con espacios colapsados (con sufijo canonico en `usuario`)."""
        self.literal = normalizar_nombre_odoo(self.literal) if self.columna == "usuario" else nombre_base(self.literal)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.literal} ({self.get_columna_display()})"


class MembresiaEquipo(models.Model):
    """El papel de una persona en un equipo, con lo que ese papel necesita.

    Una persona tiene como mucho una membresia por equipo. Los campos que no
    aplican al rol (ver `equipos.ROLES`) quedan vacios; la vista los comprueba y
    `save()` los limpia.

    - `sites`: los sites de una coordinadora de oficina (uno o varios); de ellos sale
      su % de ventas (el promedio simple si son varios) y bajo cada uno se la muestra
      en el Sales Report. La vista no deja borrar un site que alguna lleve: la dejaria
      fuera del reporte sin avisar.
    - `superior`: a quien responde un supervisor (el coordinador de UN o el gerente de UN
      de su equipo, segun `equipos.SUPERIOR_DEL_SUPERVISOR`).
    - `unidades`: las unidades de negocio que lleva. Una para el coordinador de UN; varias
      para el jefe, el gerente de UN y el gerente de operaciones.
    """

    persona = models.ForeignKey(PersonaVentas, on_delete=models.CASCADE, related_name="membresias")
    equipo = models.ForeignKey(EquipoVentas, on_delete=models.PROTECT, related_name="membresias")
    rol = models.CharField(max_length=20, choices=ROL_CHOICES)
    sites = models.ManyToManyField("subscriptions.Site", blank=True, related_name="membresias")
    superior = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subordinados",
    )
    unidades = models.ManyToManyField("subscriptions.Coordinador", blank=True, related_name="membresias")

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_membresias_equipo"
        ordering = ["equipo__orden", "rol", "persona__nombre", "persona__apellido"]
        constraints = [
            models.UniqueConstraint(fields=["persona", "equipo"], name="membresia_persona_equipo_unica"),
        ]
        verbose_name = "miembro de un equipo de ventas"
        verbose_name_plural = "miembros de equipos de ventas"

    def save(self, *args, **kwargs):
        """Quita el superior cuando el rol no lo lleva (sites y unidades las limpia la vista: son M2M)."""
        if self.rol != "supervisor":
            self.superior = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.persona} · {self.get_rol_display()} ({self.equipo})"


class CondicionesEquipo(models.Model):
    """Los valores de pago de un rol de un equipo (ver `equipos.PIEZAS_POR_ROL`).

    Solo hay fila cuando alguien edito algo; sin ella el rol paga con
    `equipos.PARAMETROS_DEFECTO`. No se versionan: un periodo cerrado guarda
    copia de las que uso (ver `ComisionPeriodo`), asi que cambiarlas solo afecta
    a lo que se calcule despues.
    """

    equipo = models.ForeignKey(EquipoVentas, on_delete=models.CASCADE, related_name="condiciones")
    rol = models.CharField(max_length=20, choices=ROL_CHOICES)
    parametros = models.JSONField(default=dict)
    actualizado_por = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_condiciones_equipo"
        constraints = [
            models.UniqueConstraint(fields=["equipo", "rol"], name="condiciones_equipo_rol_unica"),
        ]
        verbose_name = "condiciones de pago de un rol"
        verbose_name_plural = "condiciones de pago de los roles"

    def __str__(self):
        return f"{self.equipo} · {self.get_rol_display()}"


class ObjetivoVentasOficina(models.Model):
    """Un tramo del objetivo de ventas de las coordinadoras de oficina.

    Es una cantidad de ventas al mes, no un %: contra ella se mide en el Sales
    Report lo que vendio la coordinadora como `Medio`. `persona` nula es el
    **general**, el de todas las que no tengan uno propio; con persona, el
    **individual**, que manda sobre el general.

    Mismo criterio de vigencia que `ObjetivoComercial`: el tramo vale desde su
    mes (`desde`, `YYYY-MM`; nulo es "desde siempre") hasta que empieza el
    siguiente de la misma persona —o del general—, asi que cambiar un objetivo
    no reescribe los meses que ya pasaron. La unicidad de (persona, desde) la
    comprueba la vista: Postgres trata los NULL como distintos en un UNIQUE.
    """

    persona = models.ForeignKey(
        PersonaVentas,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="objetivos_ventas",
    )
    desde = models.CharField(max_length=7, null=True, blank=True)
    ventas = models.PositiveIntegerField()
    nota = models.CharField(max_length=255, blank=True, default="")
    actualizado_por = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_objetivos_ventas_oficina"
        ordering = [models.F("persona").asc(nulls_first=True), models.F("desde").asc(nulls_first=True), "id"]
        verbose_name = "objetivo de ventas de oficina"
        verbose_name_plural = "objetivos de ventas de oficina"

    def __str__(self):
        quien = self.persona.nombre_completo if self.persona_id else "general"
        return f"{quien} desde {self.desde or 'siempre'}: {self.ventas}"
