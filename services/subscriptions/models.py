"""Catalogos de referencia del negocio: planes, zonas, sites, estados y
coordinadores.

Antes vivian en `data/Planes.json` y `data/Zonas.json`, y cambiarlos exigia
editar un fichero del repositorio y volver a desplegar. Aqui son tablas que se
mantienen desde `/subscriptions/config/`.

**Viven en `public`, sin cualificar con DB_SCHEMA**, igual que `auth_user` y la
matriz de permisos. El catalogo comercial es uno por empresa: darle a cada
entorno el suyo solo produce divergencias silenciosas. Lo que si se cualifica
por esquema son los datos calculados, no el vocabulario del negocio.

Nadie los lee directamente: `core/fixtures.py` es el unico consumidor, y sirve
a los analisis los mismos diccionarios con las mismas claves de la epoca JSON
(`Site`, `Type`, `Estado`, `TV`...). De eso se encargan los `to_fixture()`.
"""

from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models

# Vocabulario de tecnologias. Son dos y solo dos: la red es fibra o radio, y
# ante la reguladora eso se colapsa a alambrico o inalambrico (ver `TECH_MAP`).
TECNOLOGIA_CHOICES = [
    ("FTTH", "FTTH (fibra)"),
    ("RF", "RF (radiofrecuencia)"),
]

TIPO_PERSONA_CHOICES = [
    ("nat", "Persona natural"),
    ("PYME", "Persona juridica / PYME"),
]


class Estado(models.Model):
    """Entidad federal a la que pertenece una zona (Aragua, Carabobo...)."""

    nombre = models.CharField(max_length=80, unique=True)

    class Meta:
        db_table = "catalogo_estados"
        ordering = ["nombre"]
        verbose_name = "estado"
        verbose_name_plural = "estados"

    def __str__(self):
        return self.nombre


class Site(models.Model):
    """Sede regional que agrupa zonas.

    `orden` no es decorativo: los sites no se presentan alfabeticamente sino
    por relevancia comercial. Antes ese orden era la lista `CUSTOM_SITE_ORDER`
    en el codigo; ahora es esta columna, y aquella solo sobrevive como semilla.
    """

    nombre = models.CharField(max_length=80, unique=True)
    orden = models.IntegerField(default=999)

    class Meta:
        db_table = "catalogo_sites"
        ordering = ["orden", "nombre"]
        verbose_name = "site"
        verbose_name_plural = "sites"

    def __str__(self):
        return self.nombre


class Coordinador(models.Model):
    """Responsable comercial de un conjunto de zonas (reporte Business Units)."""

    nombre = models.CharField(max_length=120, unique=True)

    class Meta:
        db_table = "catalogo_coordinadores"
        ordering = ["nombre"]
        verbose_name = "coordinador"
        verbose_name_plural = "coordinadores"

    def __str__(self):
        return self.nombre


class Zona(models.Model):
    """Nodo de red. Es la dimension por la que se desglosa casi toda metrica."""

    nombre = models.CharField(max_length=120, unique=True)
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="zonas")
    estado = models.ForeignKey(Estado, on_delete=models.PROTECT, related_name="zonas")
    tecnologia = models.CharField(max_length=10, choices=TECNOLOGIA_CHOICES, default="FTTH")
    coordinador = models.ForeignKey(
        Coordinador,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zonas",
    )

    class Meta:
        db_table = "catalogo_zonas"
        ordering = ["nombre"]
        verbose_name = "zona"
        verbose_name_plural = "zonas"

    def __str__(self):
        return self.nombre

    def to_fixture(self) -> dict[str, str]:
        """La zona con las claves que usaba `Zonas.json`.

        Los cuatro consumidores de `core/fixtures` leen `Site`, `Type`,
        `Estado` y `Coordinador` tal cual; cambiar aqui los nombres obligaria a
        tocarlos todos sin ganar nada.
        """
        return {
            "name": self.nombre,
            "Site": self.site.nombre,
            "Type": self.tecnologia,
            "Estado": self.estado.nombre,
            "Coordinador": self.coordinador.nombre if self.coordinador else "",
        }


class PlanRegulador(models.Model):
    """Plan tal y como se **declara** a la reguladora, no como se vende.

    La reguladora no quiere el catalogo comercial: quiere una fila por producto
    declarado. Varios planes comerciales acaban siendo el mismo producto —la
    misma velocidad con dos tarifas, o el mismo servicio renombrado por una
    campana—, y declararlos por separado los cuenta dos veces.

    Por eso esta capa existe y por eso lleva sus **propios** campos en vez de
    heredarlos del primer plan que le cuelgue: cuando dos planes del grupo
    difieren en precio o en velocidad, el valor declarado tiene que ser una
    decision explicita y no la del plan que el ORM devuelva primero.

    Un plan comercial sin regulador simplemente no aparece en los formularios;
    `ETAReportManager` lo reporta aparte para que se note.
    """

    nombre = models.CharField(max_length=200, unique=True)
    tecnologia = models.CharField(max_length=10, choices=TECNOLOGIA_CHOICES, default="FTTH")
    tipo_persona = models.CharField(max_length=10, choices=TIPO_PERSONA_CHOICES, default="nat")
    datas_mbps = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # En divisa, igual que `Plan.precio`. La conversion a bolivares se hace al
    # exportar, con la tasa del dia: guardarla aqui congelaria el reporte a la
    # tasa que hubiera cuando alguien edito el catalogo.
    precio = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tiene_tv = models.BooleanField(default=False)
    # Decide en que hoja del libro cae la fila: transporte va en la suya, que
    # pide otras columnas (medio de transmision, numero de enlaces).
    es_transporte = models.BooleanField(default=False)
    notas = models.CharField(max_length=255, blank=True, default="")

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_planes_reguladores"
        ordering = ["nombre"]
        verbose_name = "plan regulador"
        verbose_name_plural = "planes reguladores"

    def __str__(self):
        return self.nombre

    def to_fixture(self) -> dict[str, str]:
        """El regulador con las claves planas que consume `eta_report`.

        Mismo criterio que `Plan.to_fixture`: numeros como texto, porque los
        consumidores de `core/fixtures` los convierten ellos.
        """
        return {
            "name": self.nombre,
            "type": self.tecnologia,
            "people": self.tipo_persona,
            "TV": "True" if self.tiene_tv else "False",
            "datas": _numero(self.datas_mbps),
            "price": _numero(self.precio),
            "es_transporte": self.es_transporte,
        }


class Plan(models.Model):
    """Producto comercial contratable.

    El nombre no es unico a proposito: el catalogo original traia el mismo plan
    dos veces cuando cambiaba de tarifa (los de Puerto Cabello tienen otra
    velocidad de referencia). La pareja (nombre, tarifa) si lo es.

    `declarar_en_eta` es el unico campo que el JSON no tenia: sustituye a la
    tabla `analyzer_eta_config_planes`, que guardaba una segunda copia —con
    prioridad— de tecnologia, persona, TV y Mbps. Un plan se clasifica en un
    solo sitio, y es este.
    """

    nombre = models.CharField(max_length=150)
    tarifa = models.CharField(max_length=150, blank=True, default="")
    tecnologia = models.CharField(max_length=10, choices=TECNOLOGIA_CHOICES, default="FTTH")
    tipo_persona = models.CharField(max_length=10, choices=TIPO_PERSONA_CHOICES, default="nat")
    referencia = models.CharField(max_length=200, blank=True, default="")
    tiene_tv = models.BooleanField(default=False)
    datas_mbps = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    precio = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    declarar_en_eta = models.BooleanField(default=True)
    # Con que fila de los formularios de la reguladora se declara este plan.
    # Nulo no es un error de datos: un plan recien creado todavia no esta
    # agrupado, y hasta que lo este no se declara.
    plan_regulador = models.ForeignKey(
        PlanRegulador,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planes",
    )

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_planes"
        # El orden importa: cuando dos filas comparten nombre, los consumidores
        # construyen un mapa por nombre y gana la ultima. Ordenar por tarifa
        # deja ganar a la variante con tarifa propia, que es la que ganaba en
        # `Planes.json` por venir despues en el fichero.
        ordering = ["nombre", "tarifa"]
        constraints = [
            models.UniqueConstraint(fields=["nombre", "tarifa"], name="catalogo_plan_nombre_tarifa")
        ]
        verbose_name = "plan"
        verbose_name_plural = "planes"

    def __str__(self):
        return f"{self.nombre} ({self.tarifa})" if self.tarifa else self.nombre

    def to_fixture(self) -> dict[str, str]:
        """El plan con las claves que usaba `Planes.json`.

        Los valores viajan como texto porque asi los leia el JSON y asi los
        convierten los consumidores (`float(p.get("datas") or "0")`).
        """
        return {
            "name": self.nombre,
            "type": self.tecnologia,
            "people": self.tipo_persona,
            "ref": self.referencia,
            "TV": "True" if self.tiene_tv else "False",
            "datas": _numero(self.datas_mbps),
            "price": _numero(self.precio),
            "tarifa": self.tarifa,
            "declarar_en_eta": self.declarar_en_eta,
            # El regulador viaja como el diccionario entero y no como su id:
            # el consumidor (`eta_report`) necesita sus campos, y `fixtures`
            # sirve diccionarios planos, no filas del ORM.
            "regulador": self.plan_regulador.to_fixture() if self.plan_regulador_id else None,
        }


class ProductoIgnorado(models.Model):
    """Linea del export que nunca sera un plan (routers, instalaciones...).

    La verificacion del catalogo no puede distinguir un plan nuevo de un
    servicio puntual, asi que ofrece las dos respuestas. Registrar el nombre
    aqui lo saca de la lista de candidatos sin meterlo en el catalogo, que es
    lo que evita que una instalacion bloquee cada importacion para siempre.

    No confundirlo con `Plan.declarar_en_eta`: aquello es un plan de verdad que
    queda fuera del reporte de la reguladora y sigue contando como plan.
    """

    nombre = models.CharField(max_length=200, unique=True)
    nota = models.CharField(max_length=255, blank=True, default="")
    creado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "catalogo_productos_ignorados"
        ordering = ["nombre"]
        verbose_name = "producto ignorado"
        verbose_name_plural = "productos ignorados"

    def __str__(self):
        return self.nombre


def _numero(valor) -> str:
    """Decimal a texto sin ceros de relleno: `60.00` -> `60`, `2.50` -> `2.5`."""
    if valor is None:
        return ""
    texto = f"{valor}"
    if "." in texto:
        texto = texto.rstrip("0").rstrip(".")
    return texto or "0"
