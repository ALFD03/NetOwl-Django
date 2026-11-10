"""Directorio de ventas: las personas que cobran comisiones.

El export de suscripciones dice quien hizo cada venta en tres columnas de
texto libre, y ese texto es lo unico que identifica a una persona:

- `Medio`: quien hizo la venta. Un asesor, o un supervisor o coordinador que
  vendio directamente. Odoo lo escribe como nombre + apellido («Ahiam
  Aguilar»), sin sufijo.
- `Oportunidad/Administrador`: el supervisor del equipo, escrito igual.
- `Vendedor`: el coordinador de oficina, como **usuario de Odoo**: el nombre
  completo con el sufijo `(User)` («Ahiam Samuel Aguilar Lugo (User)»).

Este directorio es el vocabulario contra el que se contrastan esos literales.
Es una sola tabla con el cargo como campo, y no una por cargo, porque los tres
textos se cruzan contra las mismas personas: un supervisor aparece en
`Oportunidad/Administrador` en las ventas de su equipo y en `Medio` en las suyas.

El coordinador de unidad de negocio tambien es una persona de aqui. Lo que
agrupa Unidades de negocio no es la persona sino `Coordinador` (el catalogo
dueño de las zonas): una misma persona puede llevar dos («German Cerruti» y
«German Cerruti 2») y una puede estar «Vacante». Por eso es `Coordinador` el
que apunta a la persona, y no al reves.

La coordinadora de oficina pertenece a un site (`PersonaVentas.site`): es por
donde el Sales Report la pone bajo su site, con sus ventas y su objetivo de
ventas del mes (`ObjetivoVentasOficina`).

Vive en el esquema del entorno, como los demas catalogos.
"""

from __future__ import annotations

from django.db import models
from django.db.models.functions import Lower

from core.odoo_nombres import nombre_base, normalizar_nombre_odoo

CARGO_CHOICES = [
    ("asesor", "Asesor de ventas"),
    ("supervisor", "Supervisor de ventas"),
    ("coord_oficina", "Coordinador de oficina"),
    ("coord_un", "Coordinador de unidad de negocio"),
]

# El unico cargo que aparece en `Vendedor` y por tanto el unico que necesita
# su usuario de Odoo.
CARGO_CON_USUARIO = "coord_oficina"

# Los cargos que aparecen en `Oportunidad/Administrador`: el supervisor, y tambien los
# coordinadores cuando llevan un equipo directamente.
CARGOS_QUE_SUPERVISAN = ("supervisor", "coord_oficina", "coord_un")


class PersonaVentas(models.Model):
    """Una persona de la fuerza de ventas, con como la escribe Odoo.

    `medio` es el literal exacto de la columna `Medio`, no un nombre bonito:
    suele ser nombre + apellido, pero no siempre el primer nombre y el primer
    apellido de `nombre`/`apellido` (y a veces con otra grafia), asi que se
    guarda tal cual y no se deriva.

    `medio_supervisor` es el de `Oportunidad/Administrador`, que para la misma persona
    Odoo a veces escribe distinto. Vacio es "el mismo que `medio`", que es lo
    habitual; solo lo llevan los cargos que supervisan
    (`CARGOS_QUE_SUPERVISAN`). `literal_supervisor` da el que vale.

    `estado_fijo` solo lo lleva el asesor: el estado con que se le aplica el
    bono por meta cuando el de sus clientes no es el que vale.

    `usuario_odoo` solo lo lleva el coordinador de oficina: es el literal de
    `Vendedor`, y se guarda siempre con el sufijo canonico, como el directorio
    de soporte. `site` tambien es solo suyo: el site de los reportes bajo el que
    se la muestra en el Sales Report.

    La comparacion contra el export no distingue mayusculas ni el sufijo
    (`core.odoo_nombres.clave_nombre`), y por eso las dos unicidades son sobre
    el texto en minusculas.
    """

    nombre = models.CharField(max_length=80)
    apellido = models.CharField(max_length=80)
    cargo = models.CharField(max_length=16, choices=CARGO_CHOICES)
    medio = models.CharField(max_length=160)
    medio_supervisor = models.CharField(max_length=160, blank=True, default="")
    usuario_odoo = models.CharField(max_length=200, blank=True, default="")
    # El estado con que se le aplica el bono por meta a un asesor, fijado a
    # mano. Vacio: el de la zona donde tiene mas clientes (ver
    # `comisiones.analytics.calculo._estados_asesores`). Solo lo lleva el asesor.
    estado_fijo = models.ForeignKey(
        "subscriptions.Estado",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="asesores_fijados",
    )
    # El site del Sales Report al que pertenece una coordinadora de oficina.
    # `PROTECT`: borrar el site la dejaria fuera del reporte sin avisar.
    site = models.ForeignKey(
        "subscriptions.Site",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="coordinadoras_oficina",
    )

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_personas_ventas"
        ordering = ["nombre", "apellido"]
        constraints = [
            models.UniqueConstraint(Lower("medio"), name="persona_ventas_medio_unico"),
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
            models.CheckConstraint(
                condition=~models.Q(cargo=CARGO_CON_USUARIO) | ~models.Q(usuario_odoo=""),
                name="persona_ventas_coord_oficina_con_usuario",
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
        self.medio = nombre_base(self.medio)
        self.medio_supervisor = nombre_base(self.medio_supervisor) if self.medio_supervisor else ""
        if self.cargo not in CARGOS_QUE_SUPERVISAN or self.medio_supervisor.casefold() == self.medio.casefold():
            self.medio_supervisor = ""
        self.usuario_odoo = normalizar_nombre_odoo(self.usuario_odoo) if self.usuario_odoo else ""
        if self.cargo != "asesor":
            self.estado_fijo = None
        if self.cargo != CARGO_CON_USUARIO:
            self.site = None
        super().save(*args, **kwargs)

    @property
    def literal_supervisor(self) -> str:
        """Como aparece en `Oportunidad/Administrador`."""
        return self.medio_supervisor or self.medio

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido}".strip()

    def __str__(self):
        return f"{self.nombre_completo} ({self.get_cargo_display()})"


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
        limit_choices_to={"cargo": CARGO_CON_USUARIO},
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
