"""Directorio de ventas: las personas que cobran comisiones.

El export de suscripciones dice quien hizo cada venta en tres columnas de
texto libre, y ese texto es lo unico que identifica a una persona:

- `Medio`: quien hizo la venta. Un asesor, o un supervisor o coordinador que
  vendio directamente. Odoo lo escribe como nombre + apellido («Ahiam
  Aguilar»), sin sufijo.
- `Medio/Supervisor`: el supervisor del equipo, escrito igual.
- `Vendedor`: el coordinador de oficina, como **usuario de Odoo**: el nombre
  completo con el sufijo `(User)` («Ahiam Samuel Aguilar Lugo (User)»).

Este directorio es el vocabulario contra el que se contrastan esos literales.
Es una sola tabla con el cargo como campo, y no una por cargo, porque los tres
textos se cruzan contra las mismas personas: un supervisor aparece en
`Medio/Supervisor` en las ventas de su equipo y en `Medio` en las suyas.

El coordinador de unidad de negocio tambien es una persona de aqui. Lo que
agrupa Unidades de negocio no es la persona sino `Coordinador` (el catalogo
dueño de las zonas): una misma persona puede llevar dos («German Cerruti» y
«German Cerruti 2») y una puede estar «Vacante». Por eso es `Coordinador` el
que apunta a la persona, y no al reves.

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


class PersonaVentas(models.Model):
    """Una persona de la fuerza de ventas, con como la escribe Odoo.

    `medio` es el literal exacto de las columnas `Medio` y `Medio/Supervisor`,
    no un nombre bonito: suele ser nombre + apellido, pero no siempre el
    primer nombre y el primer apellido de `nombre`/`apellido` (y a veces con
    otra grafia), asi que se guarda tal cual y no se deriva.

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
    usuario_odoo = models.CharField(max_length=200, blank=True, default="")

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_personas_ventas"
        ordering = ["nombre", "apellido"]
        constraints = [
            models.UniqueConstraint(Lower("medio"), name="persona_ventas_medio_unico"),
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
        """Normaliza los dos literales antes de guardar.

        En `save()` y no solo en la vista porque las unicidades descansan en
        ello: dos espacios de mas harian de la misma persona dos filas.
        """
        self.medio = nombre_base(self.medio)
        self.usuario_odoo = normalizar_nombre_odoo(self.usuario_odoo) if self.usuario_odoo else ""
        super().save(*args, **kwargs)

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido}".strip()

    def __str__(self):
        return f"{self.nombre_completo} ({self.get_cargo_display()})"
