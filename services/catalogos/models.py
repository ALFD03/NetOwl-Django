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

Los equipos de ventas (`EquipoVentas`) son el cuarto literal: la columna
`Equipo de ventas` del export, con el nombre con el que se presentan, su tipo
y a quien pertenecen.

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
    de soporte.

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


TIPO_EQUIPO_CHOICES = [
    ("oficina", "Oficina"),
    ("externa", "Externa"),
]

# El unico tipo de equipo que responde ademas a un coordinador de unidad de
# negocio: el de oficina es de la oficina y nada mas.
TIPO_EQUIPO_CON_UN = "externa"


class NombreEquipo(models.Model):
    """Un nombre con el que se presenta un equipo de ventas.

    Es una lista aparte, y no un texto del equipo, para que varios literales de
    Odoo puedan presentarse como un mismo equipo y para que el nombre se escriba
    siempre igual: tecleado libremente acaba escrito de tres formas y deja de
    agrupar, como pasaba con los departamentos de soporte.
    """

    nombre = models.CharField(max_length=120)

    class Meta:
        db_table = "catalogo_nombres_equipo"
        ordering = ["nombre"]
        constraints = [
            models.UniqueConstraint(Lower("nombre"), name="nombre_equipo_unico"),
        ]
        verbose_name = "nombre de equipo"
        verbose_name_plural = "nombres de equipo"

    def __str__(self):
        return self.nombre


class EquipoVentas(models.Model):
    """Un equipo de ventas tal y como lo escribe Odoo en `Equipo de ventas`.

    `nombre_odoo` es el literal del export, que se compara como los demas
    (`clave_nombre`: sin mayusculas ni sufijo). `nombre_visualizacion` es como
    se presenta, elegido de `NombreEquipo`.

    Todo equipo es de una coordinadora de oficina. El externo responde ademas a
    un coordinador de unidad de negocio, que puede quedar vacio; en uno de
    oficina no se guarda aunque llegue.

    Las dos personas van con `PROTECT`: borrar a alguien del directorio que
    lleva un equipo lo dejaria sin a quien agruparse.
    """

    nombre_odoo = models.CharField(max_length=200)
    nombre_visualizacion = models.ForeignKey(
        NombreEquipo, on_delete=models.PROTECT, related_name="equipos",
    )
    tipo = models.CharField(max_length=10, choices=TIPO_EQUIPO_CHOICES, default="oficina")
    coord_oficina = models.ForeignKey(
        PersonaVentas,
        on_delete=models.PROTECT,
        related_name="equipos_oficina",
        limit_choices_to={"cargo": "coord_oficina"},
    )
    coord_un = models.ForeignKey(
        PersonaVentas,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="equipos_un",
        limit_choices_to={"cargo": "coord_un"},
    )

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_equipos_ventas"
        ordering = ["nombre_odoo"]
        constraints = [
            models.UniqueConstraint(Lower("nombre_odoo"), name="equipo_ventas_nombre_odoo_unico"),
        ]
        verbose_name = "equipo de ventas"
        verbose_name_plural = "equipos de ventas"

    def save(self, *args, **kwargs):
        """Normaliza el literal y descarta el coordinador de UN si no es externo."""
        self.nombre_odoo = nombre_base(self.nombre_odoo)
        if self.tipo != TIPO_EQUIPO_CON_UN:
            self.coord_un = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nombre_visualizacion} ({self.nombre_odoo})"
