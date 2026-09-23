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


# --- Objetivos comerciales ---------------------------------------------------
#
# Las metas de crecimiento y de churn no alteran ningun analisis: solo deciden
# la meta, el cumplimiento y el color con que se pinta cada cifra. Por eso no
# se guardan junto a las metricas calculadas sino aqui, y el cliente las aplica
# al pintar (`web/src/features/subscriptions/lib/objetivos.ts`). Cambiar un
# objetivo se ve al recargar la pagina, sin relanzar ningun mes.
#
# Los niveles, de mas alto a mas bajo: general, estado, site, coordinador y
# zona. **Cada nivel hereda del de arriba y nunca del de abajo**: el objetivo de
# una zona solo cambia esa zona; el de un coordinador, sus zonas y su total; el
# de un site, sus zonas y los coordinadores de esas zonas. La regla completa
# esta en el modulo del cliente, que es quien la aplica.

NIVEL_OBJETIVO_CHOICES = [
    ("general", "General"),
    ("estado", "Estado"),
    ("site", "Site"),
    ("coordinador", "Coordinador"),
    ("zona", "Zona"),
]

# El campo que referencia la entidad de cada nivel. El general no tiene.
REFERENCIA_POR_NIVEL = {
    "estado": "estado",
    "site": "site",
    "coordinador": "coordinador",
    "zona": "zona",
}


def _solo_referencia(nivel: str | None) -> models.Q:
    """La condicion "solo esta rellena la referencia de `nivel`" (None: ninguna)."""
    return models.Q(
        nivel=nivel or "general",
        **{
            f"{campo}__isnull": campo != REFERENCIA_POR_NIVEL.get(nivel or "")
            for campo in REFERENCIA_POR_NIVEL.values()
        },
    )


class ObjetivoComercial(models.Model):
    """Un tramo de objetivo: a partir de `desde`, este nivel apunta a estos valores.

    Mismo criterio que `HistorialDepartamento` en soporte: el tramo vale desde
    su mes hasta que empieza el siguiente de la misma entidad, y `desde` nulo
    significa "desde siempre". Asi cambiar un objetivo no reescribe los meses
    que ya pasaron; quien quiera corregir un mes cerrado usa `ObjetivoMes`.

    `crecimiento_pct` y `churn_pct` son independientes y cualquiera de los dos
    puede quedar vacio. Cada metrica se resuelve por separado: gana el tramo
    mas reciente de la entidad que la fije, asi que un tramo que solo cambia el
    churn desde agosto conserva el crecimiento que la entidad ya tenia; si
    ningun tramo suyo la fija, se hereda del nivel de arriba. El general
    sembrado (6% / 3%, desde siempre) es el que responde cuando nadie mas lo
    hace, y no se puede borrar.

    Las referencias son `CASCADE`: el objetivo de una zona que ya no existe no
    significa nada.
    """

    nivel = models.CharField(max_length=12, choices=NIVEL_OBJETIVO_CHOICES)
    estado = models.ForeignKey(Estado, on_delete=models.CASCADE, null=True, blank=True, related_name="objetivos")
    site = models.ForeignKey(Site, on_delete=models.CASCADE, null=True, blank=True, related_name="objetivos")
    coordinador = models.ForeignKey(
        Coordinador, on_delete=models.CASCADE, null=True, blank=True, related_name="objetivos"
    )
    zona = models.ForeignKey(Zona, on_delete=models.CASCADE, null=True, blank=True, related_name="objetivos")
    # `YYYY-MM`, el mismo texto con el que empiezan los `periodo_reporte`: asi
    # se compara como cadena tanto aqui como en el cliente.
    desde = models.CharField(max_length=7, null=True, blank=True)
    crecimiento_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    churn_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    nota = models.CharField(max_length=255, blank=True, default="")
    actualizado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_objetivos"
        ordering = ["nivel", models.F("desde").asc(nulls_first=True), "id"]
        verbose_name = "objetivo comercial"
        verbose_name_plural = "objetivos comerciales"
        constraints = [
            # Exactamente la referencia que corresponde al nivel. La unicidad de
            # (entidad, desde) no se puede pedir con un UNIQUE —Postgres trata
            # los NULL como distintos— y la comprueba la vista al guardar.
            models.CheckConstraint(
                condition=(
                    _solo_referencia(None)
                    | _solo_referencia("estado")
                    | _solo_referencia("site")
                    | _solo_referencia("coordinador")
                    | _solo_referencia("zona")
                ),
                name="objetivo_referencia_segun_nivel",
            ),
            models.CheckConstraint(
                condition=models.Q(crecimiento_pct__isnull=False) | models.Q(churn_pct__isnull=False),
                name="objetivo_con_algun_valor",
            ),
        ]

    @property
    def entidad(self):
        """La fila de catalogo a la que apunta, o None si es el general."""
        campo = REFERENCIA_POR_NIVEL.get(self.nivel)
        return getattr(self, campo) if campo else None

    def __str__(self):
        entidad = self.entidad
        return f"{self.nivel}:{entidad or '-'} desde {self.desde or 'siempre'}"


class ObjetivoMes(models.Model):
    """La excepcion de un mes concreto al objetivo general.

    Es la manera de corregir un mes ya calculado sin mover el general: vale
    para ese mes y para ninguno mas. Solo sustituye al general; los objetivos
    propios de zonas, coordinadores, sites y estados siguen ganandole.
    """

    periodo = models.CharField(max_length=7, unique=True)
    crecimiento_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    churn_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    nota = models.CharField(max_length=255, blank=True, default="")
    actualizado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_objetivos_mes"
        ordering = ["-periodo"]
        verbose_name = "objetivo de un mes"
        verbose_name_plural = "objetivos de meses"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(crecimiento_pct__isnull=False) | models.Q(churn_pct__isnull=False),
                name="objetivo_mes_con_algun_valor",
            ),
        ]

    def __str__(self):
        return self.periodo


class SemaforoObjetivos(models.Model):
    """Los umbrales de color, todos relativos al objetivo. Fila unica (pk=1).

    El cumplimiento ya es relativo (porcentaje de la meta). Crecimiento y churn
    se miden en puntos respecto de su objetivo, para que los umbrales se muevan
    con el: con un 6% de objetivo, `crec_verde_margen = 2` pinta en verde desde
    el 4%; con un 8%, desde el 6%.

    Los valores por defecto reproducen los colores que los reportes tenian
    escritos a mano: crecimiento verde >= 4 y amarillo >= 0 (con 6%), churn
    verde <= 3 y amarillo <= 4 (con 3%), cumplimiento verde >= 100 y amarillo
    >= 60.
    """

    cumpl_verde = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    cumpl_amarillo = models.DecimalField(max_digits=6, decimal_places=2, default=60)
    # Puntos por debajo del objetivo de crecimiento hasta donde sigue el color.
    crec_verde_margen = models.DecimalField(max_digits=6, decimal_places=2, default=2)
    crec_amarillo_margen = models.DecimalField(max_digits=6, decimal_places=2, default=6)
    # Puntos por encima del objetivo de churn hasta donde sigue el color.
    churn_verde_margen = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    churn_amarillo_margen = models.DecimalField(max_digits=6, decimal_places=2, default=1)
    actualizado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catalogo_objetivos_semaforo"
        verbose_name = "semaforo de objetivos"
        verbose_name_plural = "semaforo de objetivos"

    @classmethod
    def actual(cls) -> SemaforoObjetivos:
        """La fila unica, creandola con los valores por defecto si falta."""
        fila, _ = cls.objects.get_or_create(pk=1)
        return fila

    def __str__(self):
        return "semaforo de objetivos"


def _numero(valor) -> str:
    """Decimal a texto sin ceros de relleno: `60.00` -> `60`, `2.50` -> `2.5`."""
    if valor is None:
        return ""
    texto = f"{valor}"
    if "." in texto:
        texto = texto.rstrip("0").rstrip(".")
    return texto or "0"
