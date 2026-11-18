"""Catalogos de referencia del negocio: planes, zonas, sites, estados y
coordinadores.

Antes vivian en `data/Planes.json` y `data/Zonas.json`, y cambiarlos exigia
editar un fichero del repositorio y volver a desplegar. Aqui son tablas que se
mantienen desde el modulo de Catalogos (`/catalogos/`).

Viven en el esquema del entorno, como todo lo demas: el `db_table` no se
cualifica porque la conexion ya fija `search_path` a DB_SCHEMA. Desarrollo y
produccion tienen cada uno su catalogo, y un cambio en uno no alcanza al otro.

Nadie los lee directamente: `core/fixtures.py` es el unico consumidor, y sirve
a los analisis los mismos diccionarios con las mismas claves de la epoca JSON
(`Site`, `Type`, `Estado`, `TV`...). De eso se encargan los `to_fixture()`.
"""

from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models

# Vocabulario de tecnologias. Son dos y solo dos: la red es fibra o radio, y
# ante la reguladora eso se colapsa a alambrico o inalambrico (ver `TECH_MAP`).
TECHNOLOGY_CHOICES = [
    ("FTTH", "FTTH (fibra)"),
    ("RF", "RF (radiofrecuencia)"),
]

PERSON_KIND_CHOICES = [
    ("nat", "Persona natural"),
    ("PYME", "Persona juridica / PYME"),
]


# Las listas de "por registrar" que admiten un "ignorar": cada area del modulo
# de catalogos detecta en los datos importados los nombres que no reconoce.
IGNORED_AREA_CHOICES = [
    ("productos", "Productos"),
    ("estructura", "Estructura"),
    ("ventas", "Ventas"),
]


class State(models.Model):
    """Entidad federal a la que pertenece una zona (Aragua, Carabobo...)."""

    name = models.CharField(max_length=80, unique=True, db_column="nombre")

    class Meta:
        db_table = "catalogo_estados"
        ordering = ["name"]
        verbose_name = "estado"
        verbose_name_plural = "estados"

    def __str__(self):
        return self.name


class Site(models.Model):
    """Sede regional que agrupa zonas.

    `order` no es decorativo: los sites no se presentan alfabeticamente sino
    por relevancia comercial. Antes ese orden era la lista `CUSTOM_SITE_ORDER`
    en el codigo; ahora es esta columna, y aquella solo sobrevive como semilla.

    `teams` son los equipos de ventas que trabajan en el site (se eligen en
    Catalogos › Ventas › Estructura de ventas).
    """

    name = models.CharField(max_length=80, unique=True, db_column="nombre")
    order = models.IntegerField(default=999, db_column="orden")
    teams = models.ManyToManyField("catalogos.SalesTeam", blank=True, related_name="sites", through="SiteTeam")

    class Meta:
        db_table = "catalogo_sites"
        ordering = ["order", "name"]
        verbose_name = "site"
        verbose_name_plural = "sites"

    def __str__(self):
        return self.name


class Coordinator(models.Model):
    """Unidad de negocio: un conjunto de zonas llevado por un responsable comercial.

    `name` es como se presenta en Unidades de negocio, no una persona: una
    misma persona puede llevar dos unidades («German Cerruti» y «German
    Cerruti 2») y una unidad puede estar «Vacante». Quien la lleva no se guarda
    aqui sino en la membresia de equipo que la tiene en `units`
    (`catalogos.TeamMembership`): el coordinador de UN, y los jefes y gerentes
    que cobran por ella. `teams` son los equipos de ventas que la trabajan.
    """

    name = models.CharField(max_length=120, unique=True, db_column="nombre")
    teams = models.ManyToManyField(
        "catalogos.SalesTeam", blank=True, related_name="business_units", through="CoordinatorTeam",
    )

    class Meta:
        db_table = "catalogo_coordinadores"
        ordering = ["name"]
        verbose_name = "coordinador"
        verbose_name_plural = "coordinadores"

    def __str__(self):
        return self.name


class SiteTeam(models.Model):
    """Un equipo de ventas que trabaja en un site (la tabla del M2M `Site.teams`)."""

    site = models.ForeignKey(Site, on_delete=models.CASCADE, db_column="site_id")
    team = models.ForeignKey("catalogos.SalesTeam", on_delete=models.CASCADE, db_column="equipoventas_id")

    class Meta:
        db_table = "catalogo_sites_equipos"
        unique_together = [("site", "team")]


class CoordinatorTeam(models.Model):
    """Un equipo de ventas que trabaja una unidad de negocio (la tabla del M2M `Coordinator.teams`)."""

    coordinator = models.ForeignKey(Coordinator, on_delete=models.CASCADE, db_column="coordinador_id")
    team = models.ForeignKey("catalogos.SalesTeam", on_delete=models.CASCADE, db_column="equipoventas_id")

    class Meta:
        db_table = "catalogo_coordinadores_equipos"
        unique_together = [("coordinator", "team")]


class Zone(models.Model):
    """Nodo de red. Es la dimension por la que se desglosa casi toda metrica."""

    name = models.CharField(max_length=120, unique=True, db_column="nombre")
    site = models.ForeignKey(Site, on_delete=models.PROTECT, related_name="zones")
    state = models.ForeignKey(State, on_delete=models.PROTECT, related_name="zones", db_column="estado_id")
    technology = models.CharField(max_length=10, choices=TECHNOLOGY_CHOICES, default="FTTH", db_column="tecnologia")
    coordinator = models.ForeignKey(
        Coordinator,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="zones",
        db_column="coordinador_id",
    )

    class Meta:
        db_table = "catalogo_zonas"
        ordering = ["name"]
        verbose_name = "zona"
        verbose_name_plural = "zonas"

    def __str__(self):
        return self.name

    def to_fixture(self) -> dict[str, str]:
        """La zona con las claves que usaba `Zonas.json`.

        Los cuatro consumidores de `core/fixtures` leen `Site`, `Type`,
        `Estado` y `Coordinador` tal cual; cambiar aqui los nombres obligaria a
        tocarlos todos sin ganar nada.
        """
        return {
            "name": self.name,
            "Site": self.site.name,
            "Type": self.technology,
            "Estado": self.state.name,
            "Coordinador": self.coordinator.name if self.coordinator else "",
        }


class RegulatoryPlan(models.Model):
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

    name = models.CharField(max_length=200, unique=True, db_column="nombre")
    technology = models.CharField(max_length=10, choices=TECHNOLOGY_CHOICES, default="FTTH", db_column="tecnologia")
    person_type = models.CharField(max_length=10, choices=PERSON_KIND_CHOICES, default="nat", db_column="tipo_persona")
    data_mbps = models.DecimalField(max_digits=10, decimal_places=2, default=0, db_column="datas_mbps")
    # En divisa, igual que `Plan.price`. La conversion a bolivares se hace al
    # exportar, con la tasa del dia: guardarla aqui congelaria el reporte a la
    # tasa que hubiera cuando alguien edito el catalogo.
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0, db_column="precio")
    has_tv = models.BooleanField(default=False, db_column="tiene_tv")
    # Decide en que hoja del libro cae la fila: transporte va en la suya, que
    # pide otras columnas (medio de transmision, numero de enlaces).
    is_transport = models.BooleanField(default=False, db_column="es_transporte")
    notes = models.CharField(max_length=255, blank=True, default="", db_column="notas")

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_planes_reguladores"
        ordering = ["name"]
        verbose_name = "plan regulador"
        verbose_name_plural = "planes reguladores"

    def __str__(self):
        return self.name

    def to_fixture(self) -> dict[str, str]:
        """El regulador con las claves planas que consume `eta_report`.

        Mismo criterio que `Plan.to_fixture`: numeros como texto, porque los
        consumidores de `core/fixtures` los convierten ellos.
        """
        return {
            "name": self.name,
            "type": self.technology,
            "people": self.person_type,
            "TV": "True" if self.has_tv else "False",
            "datas": _number(self.data_mbps),
            "price": _number(self.price),
            "es_transporte": self.is_transport,
        }


class Plan(models.Model):
    """Producto comercial contratable.

    El nombre no es unico a proposito: el catalogo original traia el mismo plan
    dos veces cuando cambiaba de tarifa (los de Puerto Cabello tienen otra
    velocidad de referencia). La pareja (nombre, tarifa) si lo es.

    `declare_in_eta` es el unico campo que el JSON no tenia. Un plan se
    clasifica en un solo sitio, y es este.
    """

    name = models.CharField(max_length=150, db_column="nombre")
    tariff = models.CharField(max_length=150, blank=True, default="", db_column="tarifa")
    technology = models.CharField(max_length=10, choices=TECHNOLOGY_CHOICES, default="FTTH", db_column="tecnologia")
    person_type = models.CharField(max_length=10, choices=PERSON_KIND_CHOICES, default="nat", db_column="tipo_persona")
    reference = models.CharField(max_length=200, blank=True, default="", db_column="referencia")
    has_tv = models.BooleanField(default=False, db_column="tiene_tv")
    data_mbps = models.DecimalField(max_digits=10, decimal_places=2, default=0, db_column="datas_mbps")
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0, db_column="precio")
    declare_in_eta = models.BooleanField(default=True, db_column="declarar_en_eta")
    # Lo que se lleva quien vende un plan PYME, en % de `price`. Solo tiene
    # sentido en los PYME: un plan residencial se paga por tramos de cantidad
    # de ventas (ver `services/commissions`). Nulo es "sin definir": la venta
    # sale en el informe de comisiones sin monto, para que se note.
    sme_commission_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, db_column="comision_pyme_pct")
    # Con que fila de los formularios de la reguladora se declara este plan.
    # Nulo no es un error de datos: un plan recien creado todavia no esta
    # agrupado, y hasta que lo este no se declara.
    regulator_plan = models.ForeignKey(
        RegulatoryPlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="plans", db_column="plan_regulador_id",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_planes"
        # El orden importa: cuando dos filas comparten nombre, los consumidores
        # construyen un mapa por nombre y gana la ultima. Ordenar por tarifa
        # deja ganar a la variante con tarifa propia, que es la que ganaba en
        # `Planes.json` por venir despues en el fichero.
        ordering = ["name", "tariff"]
        constraints = [
            models.UniqueConstraint(fields=["name", "tariff"], name="catalogo_plan_nombre_tarifa")
        ]
        verbose_name = "plan"
        verbose_name_plural = "planes"

    def __str__(self):
        return f"{self.name} ({self.tariff})" if self.tariff else self.name

    def to_fixture(self) -> dict[str, str]:
        """El plan con las claves que usaba `Planes.json`.

        Los valores viajan como texto porque asi los leia el JSON y asi los
        convierten los consumidores (`float(p.get("datas") or "0")`).
        """
        return {
            "name": self.name,
            "type": self.technology,
            "people": self.person_type,
            "ref": self.reference,
            "TV": "True" if self.has_tv else "False",
            "datas": _number(self.data_mbps),
            "price": _number(self.price),
            "tarifa": self.tariff,
            "declarar_en_eta": self.declare_in_eta,
            # Nulo y no texto vacio: es "sin definir", y Comisiones lo distingue de 0.
            "comision_pyme_pct": (
                float(self.sme_commission_pct) if self.sme_commission_pct is not None else None
            ),
            # El regulador viaja como el diccionario entero y no como su id:
            # el consumidor (`eta_report`) necesita sus campos, y `fixtures`
            # sirve diccionarios planos, no filas del ORM.
            "regulador": self.regulator_plan.to_fixture() if self.regulator_plan_id else None,
        }


class IgnoredProduct(models.Model):
    """Nombre del export que nunca sera una fila del catalogo.

    Nacio para las lineas que nunca seran un plan (routers, instalaciones...)
    y se extendio a las otras dos listas de pendientes: zonas que no son nodos
    de verdad y vendedores que no se registran. `area` dice de cual sale; lo
    que sigue se escribio para los productos y sigue valiendo para ellos.

    La verificacion del catalogo no puede distinguir un plan nuevo de un
    servicio puntual, asi que ofrece las dos respuestas. Registrar el nombre
    aqui lo saca de la lista de candidatos sin meterlo en el catalogo, que es
    lo que evita que una instalacion bloquee cada importacion para siempre.

    No confundirlo con `Plan.declare_in_eta`: aquello es un plan de verdad que
    queda fuera del reporte de la reguladora y sigue contando como plan.
    """

    name = models.CharField(max_length=200, db_column="nombre")
    # De que lista de "por registrar" sale el nombre. El mismo texto puede ser
    # un producto que no es plan y, a la vez, un vendedor que no se registra:
    # ignorarlo en un sitio no lo calla en el otro. Solo los de `productos`
    # alimentan `fixtures.ignored_products()`.
    area = models.CharField(max_length=16, choices=IGNORED_AREA_CHOICES, default="productos")
    note = models.CharField(max_length=255, blank=True, default="", db_column="nota")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column="creado_por_id")
    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")

    class Meta:
        db_table = "catalogo_productos_ignorados"
        ordering = ["area", "name"]
        constraints = [
            models.UniqueConstraint(fields=["area", "name"], name="catalogo_ignorado_area_nombre"),
        ]
        verbose_name = "nombre ignorado"
        verbose_name_plural = "nombres ignorados"

    def __str__(self):
        return self.name


# --- Objetivos comerciales ---------------------------------------------------
#
# Las metas de crecimiento y de churn no alteran ningun analisis: solo deciden
# la meta y el cumplimiento de cada fila. Por eso no se guardan junto a las
# metricas calculadas sino aqui, y el cliente las aplica al pintar
# (`frontend/src/features/subscriptions/lib/objetivos.ts`). Cambiar un objetivo se ve
# al recargar la pagina, sin relanzar ningun mes. El color lo decide aparte el
# semaforo, con umbrales fijos (`TargetThresholds`).
#
# Los niveles, de mas alto a mas bajo: sucursal, estado, site, coordinador,
# zona y zona-sucursal (el nodo), con el general como respaldo. **Manda el nivel
# mas alto que tenga objetivo**: el de un nodo solo rige si nada por encima fija
# uno, y el de una sucursal manda sobre toda la geografia. Los totales ignoran
# los niveles por debajo del grupo: el objetivo de una zona no mueve el total de
# su coordinador ni el de su site, y el de un coordinador no mueve el del site.
# La regla completa esta en el modulo del cliente, que es quien la aplica.

TARGET_LEVEL_CHOICES = [
    ("general", "General"),
    ("sucursal", "Sucursal"),
    ("estado", "Estado"),
    ("site", "Site"),
    ("coordinador", "Coordinador"),
    ("zona", "Zona"),
    ("zona_sucursal", "Zona - sucursal"),
]

# La clave ajena de la entidad de cada nivel. El general no tiene; la sucursal
# tampoco, porque no es un catalogo sino el texto que trae el export (`NETCOM`,
# `NYC`...), y va en `branch`. Un nodo es su zona mas su sucursal.
REFERENCE_BY_LEVEL = {
    "estado": "state",
    "site": "site",
    "coordinador": "coordinator",
    "zona": "zone",
    "zona_sucursal": "zone",
}
REFERENCE_FIELDS = ("state", "site", "coordinator", "zone")
LEVELS_WITH_BRANCH = ("sucursal", "zona_sucursal")


def _reference_only(level: str | None) -> models.Q:
    """La condicion "solo esta rellena la referencia de `nivel`" (None: el general).

    Ademas de las claves ajenas, la sucursal: obligatoria en los dos niveles
    que la usan y vacia en el resto.
    """
    level = level or "general"
    condition = models.Q(
        level=level,
        **{f"{field}__isnull": field != REFERENCE_BY_LEVEL.get(level) for field in REFERENCE_FIELDS},
    )
    if level in LEVELS_WITH_BRANCH:
        return condition & ~models.Q(branch="")
    return condition & models.Q(branch="")


class CommercialTarget(models.Model):
    """Un tramo de objetivo: a partir de `since`, este nivel apunta a estos valores.

    Mismo criterio que `DepartmentHistory` en soporte: el tramo vale desde
    su mes hasta que empieza el siguiente de la misma entidad, y `since` nulo
    significa "desde siempre". Asi cambiar un objetivo no reescribe los meses
    que ya pasaron; quien quiera corregir un mes cerrado usa `MonthTarget`.

    **El general es una sola fila, sin fecha.** Es el valor por defecto de la
    empresa, no una historia: lo que cambia en un mes concreto es una excepcion
    de ese mes (`MonthTarget`), y lo que cambia desde un mes para una parte de
    la red es un tramo de su zona, site, estado o coordinador.

    `growth_pct` y `churn_pct` son independientes y cualquiera de los dos
    puede quedar vacio. Cada metrica se resuelve por separado: gana el tramo
    mas reciente de la entidad que la fije, asi que un tramo que solo cambia el
    churn desde agosto conserva el crecimiento que la entidad ya tenia; si
    ningun tramo suyo la fija, se hereda del nivel de arriba. El general
    sembrado (6% / 3%, desde siempre) es el que responde cuando nadie mas lo
    hace, y no se puede borrar.

    Las referencias son `CASCADE`: el objetivo de una zona que ya no existe no
    significa nada.
    """

    level = models.CharField(max_length=16, choices=TARGET_LEVEL_CHOICES, db_column="nivel")
    state = models.ForeignKey(State, on_delete=models.CASCADE, null=True, blank=True, related_name="targets", db_column="estado_id")
    site = models.ForeignKey(Site, on_delete=models.CASCADE, null=True, blank=True, related_name="targets")
    coordinator = models.ForeignKey(
        Coordinator, on_delete=models.CASCADE, null=True, blank=True, related_name="targets",
        db_column="coordinador_id",
    )
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, null=True, blank=True, related_name="targets", db_column="zona_id")
    # El texto de la sucursal tal y como lo trae el export, en los niveles
    # `sucursal` y `zona_sucursal`; vacio en el resto.
    branch = models.CharField(max_length=80, blank=True, default="", db_column="sucursal")
    # `YYYY-MM`, el mismo texto con el que empiezan los `periodo_reporte`: asi
    # se compara como cadena tanto aqui como en el cliente.
    since = models.CharField(max_length=7, null=True, blank=True, db_column="desde")
    growth_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, db_column="crecimiento_pct")
    churn_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default="", db_column="nota")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", db_column="actualizado_por_id")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_objetivos"
        ordering = ["level", models.F("since").asc(nulls_first=True), "id"]
        verbose_name = "objetivo comercial"
        verbose_name_plural = "objetivos comerciales"
        constraints = [
            # Exactamente la referencia que corresponde al nivel. La unicidad de
            # (entidad, desde) no se puede pedir con un UNIQUE —Postgres trata
            # los NULL como distintos— y la comprueba la vista al guardar.
            models.CheckConstraint(
                condition=(
                    _reference_only(None)
                    | _reference_only("sucursal")
                    | _reference_only("estado")
                    | _reference_only("site")
                    | _reference_only("coordinador")
                    | _reference_only("zona")
                    | _reference_only("zona_sucursal")
                ),
                name="objetivo_referencia_segun_nivel",
            ),
            models.CheckConstraint(
                condition=models.Q(growth_pct__isnull=False) | models.Q(churn_pct__isnull=False),
                name="objetivo_con_algun_valor",
            ),
            models.CheckConstraint(
                condition=~models.Q(level="general") | models.Q(since__isnull=True),
                name="objetivo_general_sin_fecha",
            ),
        ]

    @property
    def entity(self):
        """La fila de catalogo a la que apunta (la zona de un nodo), o None."""
        field = REFERENCE_BY_LEVEL.get(self.level)
        return getattr(self, field) if field else None

    @property
    def entity_name(self) -> str:
        """Como se llama lo que tiene el objetivo, con la clave que usan los nodos.

        Un nodo se escribe `"Zona - Sucursal"`, igual que el `valor` de la
        dimension `zona_sucursal`: es lo que el cliente cruza contra cada fila.
        """
        if self.level == "sucursal":
            return self.branch
        entity = self.entity
        if entity is None:
            return ""
        if self.level == "zona_sucursal":
            return f"{entity.name} - {self.branch}"
        return entity.name

    def __str__(self):
        return f"{self.level}:{self.entity_name or '-'} desde {self.since or 'siempre'}"


class MonthTarget(models.Model):
    """La excepcion de un mes concreto al objetivo general.

    Es la manera de corregir un mes ya calculado sin mover el general: vale
    para ese mes y para ninguno mas. Solo sustituye al general; los objetivos
    propios de zonas, coordinadores, sites y estados siguen ganandole.
    """

    period = models.CharField(max_length=7, unique=True, db_column="periodo")
    growth_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, db_column="crecimiento_pct")
    churn_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True, default="", db_column="nota")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", db_column="actualizado_por_id")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_objetivos_mes"
        ordering = ["-period"]
        verbose_name = "objetivo de un mes"
        verbose_name_plural = "objetivos de meses"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(growth_pct__isnull=False) | models.Q(churn_pct__isnull=False),
                name="objetivo_mes_con_algun_valor",
            ),
        ]

    def __str__(self):
        return self.period


class ZoneWithoutTarget(models.Model):
    """Una zona que no se mide contra ningun objetivo durante un tramo de meses.

    Es para las zonas nuevas: sin base al empezar el mes, su meta es cero pero
    sus instalaciones y su crecimiento si entraban en el total de su site o de
    su coordinador, e inflaban el cumplimiento del grupo con ventas que nadie
    esperaba. Mientras esta apartada, la zona sigue en la tabla de su grupo
    (su fila dice «Sin objetivo») pero **no entra en el resumen del grupo**: ni
    en la meta ni en la base, las instalaciones, las bajas, el crecimiento o el
    churn.

    Como los objetivos, no toca ningun analisis: se aplica al pintar
    (`lib/objetivos.ts`), y cambiarlo no obliga a relanzar ningun mes. La
    vigencia es por mes (`since`/`until`, ambos incluidos y opcionales) para que
    apartarla hoy no reescriba los meses en que si tenia objetivo. Un tramo por
    zona: cuando vuelva a medirse se le pone `until`.
    """

    zone = models.OneToOneField(Zone, on_delete=models.CASCADE, related_name="without_target", db_column="zona_id")
    since = models.CharField(max_length=7, null=True, blank=True, db_column="desde")
    until = models.CharField(max_length=7, null=True, blank=True, db_column="hasta")
    note = models.CharField(max_length=255, blank=True, default="", db_column="nota")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", db_column="actualizado_por_id")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_zonas_sin_objetivo"
        ordering = ["zone__name"]
        verbose_name = "zona sin objetivo"
        verbose_name_plural = "zonas sin objetivo"

    def effective_on(self, month: str) -> bool:
        """Si el tramo cubre `mes` (`YYYY-MM`).

        >>> ZoneWithoutTarget(since="2026-10", until=None).effective_on("2026-09")
        False
        >>> ZoneWithoutTarget(since="2026-10", until="2026-12").effective_on("2026-12")
        True
        """
        return (not self.since or self.since <= month) and (not self.until or month <= self.until)

    def __str__(self):
        return f"{self.zone} sin objetivo ({self.since or 'siempre'} a {self.until or 'sin fin'})"


class TargetThresholds(models.Model):
    """Los umbrales de color, fijos e iguales para todo el modulo. Fila unica (pk=1).

    Son valores directos, no distancias al objetivo: "crecimiento verde desde
    el 6%" vale igual para una zona con objetivo del 6% que para una con el 10%.
    Asi se leen de un vistazo y el mismo porcentaje se pinta igual en cualquier
    pagina. Lo que si depende del objetivo es el cumplimiento, porque ya es un
    porcentaje de la meta.

    - Crecimiento, mas es mejor: verde desde `growth_green`, amarillo desde
      `growth_yellow`, rojo por debajo.
    - Churn, menos es mejor: verde hasta `churn_green`, amarillo hasta
      `churn_yellow`, rojo por encima.
    - Cumplimiento (% de la meta): verde desde `compliance_green`, amarillo desde
      `compliance_yellow`.

    Los valores por defecto son los que los reportes tenian escritos a mano.
    """

    compliance_green = models.DecimalField(max_digits=6, decimal_places=2, default=100, db_column="cumpl_verde")
    compliance_yellow = models.DecimalField(max_digits=6, decimal_places=2, default=60, db_column="cumpl_amarillo")
    growth_green = models.DecimalField(max_digits=6, decimal_places=2, default=4, db_column="crec_verde")
    growth_yellow = models.DecimalField(max_digits=6, decimal_places=2, default=0, db_column="crec_amarillo")
    churn_green = models.DecimalField(max_digits=6, decimal_places=2, default=3, db_column="churn_verde")
    churn_yellow = models.DecimalField(max_digits=6, decimal_places=2, default=4, db_column="churn_amarillo")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+", db_column="actualizado_por_id")
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "catalogo_objetivos_semaforo"
        verbose_name = "semaforo de objetivos"
        verbose_name_plural = "semaforo de objetivos"

    @classmethod
    def current(cls) -> TargetThresholds:
        """La fila unica, creandola con los valores por defecto si falta."""
        row, _ = cls.objects.get_or_create(pk=1)
        return row

    def __str__(self):
        return "semaforo de objetivos"


def _number(value) -> str:
    """Decimal a texto sin ceros de relleno: `60.00` -> `60`, `2.50` -> `2.5`."""
    if value is None:
        return ""
    text = f"{value}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"
