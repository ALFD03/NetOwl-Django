"""Configuracion de pago de comisiones: los supervisores de cada UN y las condiciones.

Quien cobra por una venta sale de la propia suscripcion y de nada mas:
`Medio` es quien vendio, `Oportunidad/Administrador` su supervisor y `Vendedor` el
coordinador de oficina. Lo unico que Odoo no trae es el coordinador de unidad
de negocio, y eso es lo que se configura aqui: a que coordinador de UN
responde cada supervisor (`SupervisorUnidad`). La venta paga al de su
supervisor; un supervisor sin coordinador de UN no le paga a ninguno.

Las condiciones son las tarifas y los tramos. No se versionan: un periodo
cerrado guarda una copia de las que uso (ver `ComisionPeriodo`), asi que
cambiarlas solo afecta a lo que se calcule despues.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models

from services.catalogos.models import PersonaVentas


class SupervisorUnidad(models.Model):
    """El coordinador de unidad de negocio al que responde un supervisor.

    Una fila por supervisor; sin fila, sus ventas no pagan a ningun
    coordinador de UN. Es independiente de la oficina para la que carga: un
    mismo coordinador de UN tiene supervisores de oficinas distintas, y la
    oficina de cada venta la dice su `Vendedor`. La vista comprueba los cargos
    al guardar.
    """

    supervisor = models.OneToOneField(PersonaVentas, on_delete=models.CASCADE, related_name="unidad_comision")
    coord_un = models.ForeignKey(PersonaVentas, on_delete=models.CASCADE, related_name="supervisores_comision")
    actualizado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "comisiones_supervisor_unidad"
        verbose_name = "coordinador de UN de un supervisor"
        verbose_name_plural = "supervisores por coordinador de UN"

    def __str__(self):
        return f"{self.supervisor} -> {self.coord_un}"


def _tramos_asesor() -> list[dict]:
    """Los tramos de la politica vigente cuando se escribio el modulo.

    Cada tramo vale desde `desde` ventas hasta el siguiente. Se pagan
    `(ventas - descontar) * monto`: de 6 a 19 se descuentan 5, de modo que 19
    ventas cobran 14; desde 20 se pagan todas, y cada vez a mas.
    """
    return [
        {"desde": 0, "monto": 0, "descontar": 0},
        {"desde": 6, "monto": 5, "descontar": 5},
        {"desde": 20, "monto": 6, "descontar": 0},
        {"desde": 21, "monto": 7, "descontar": 0},
        {"desde": 26, "monto": 8, "descontar": 0},
    ]


def _tramos_un() -> list[dict]:
    """Lo que cobra el coordinador de UN por venta de su equipo, segun el crecimiento.

    Cada tramo vale desde `desde_pct` (nulo: desde siempre) hasta el
    siguiente. La politica dice "mayor a 1% y menor a 2%" y "menor a 1%", y no
    dice nada del 1% exacto: aqui cobra 1.5, porque el tramo empieza en el.
    """
    return [
        {"desde_pct": None, "monto": 1},
        {"desde_pct": 1, "monto": 1.5},
        {"desde_pct": 2, "monto": 2},
    ]


class CondicionesComision(models.Model):
    """Las tarifas y los tramos de pago. Fila unica (pk=1).

    - **Asesor** (residencial, como `Medio`): por tramos de cantidad de ventas
      (`tramos_asesor`).
    - **Supervisor y coordinador de oficina**: `monto_equipo` por cada venta
      residencial de su equipo y `monto_directa` por cada una propia, y el
      total por el % de cumplimiento de su objetivo (tope 100%).
    - **Coordinador de unidad de negocio**: por cada venta residencial de su
      equipo, el monto del tramo de crecimiento de sus unidades
      (`tramos_un`), y `monto_directa_un` por cada una propia. Sin objetivo.
    - **PYME**: el % del plan (`Plan.comision_pyme_pct`) a quien la vendio,
      y a nadie mas. No cuenta para ningun tramo.

    `dia_promocional` es el dia en que suelen empezar los dias promocionales,
    que es donde se corta cada periodo de comisiones; se propone al calcular
    y se puede cambiar mes a mes. `dias_espera` son los dias tras el cierre
    del periodo antes de calcularlo, para que la primera factura este pagada.
    `dia_corte` es el dia del mes siguiente hasta el que un pago adelantado de
    lo instalado en dias promocionales cuenta en el periodo (ver
    `ComisionPeriodo.corte_adelantos`); tambien se propone y se cambia por mes.
    """

    monto_equipo = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("2.5"))
    monto_directa = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("4"))
    monto_directa_un = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("4"))
    tramos_asesor = models.JSONField(default=_tramos_asesor)
    tramos_un = models.JSONField(default=_tramos_un)
    dia_promocional = models.PositiveSmallIntegerField(default=25)
    dias_espera = models.PositiveSmallIntegerField(default=15)
    dia_corte = models.PositiveSmallIntegerField(default=22)
    actualizado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "comisiones_condiciones"
        verbose_name = "condiciones de comision"
        verbose_name_plural = "condiciones de comision"

    @classmethod
    def actual(cls) -> CondicionesComision:
        """La fila unica, creandola con la politica por defecto si falta."""
        fila, _ = cls.objects.get_or_create(pk=1)
        return fila

    def __str__(self):
        return "condiciones de comision"


# --- Los periodos de comisiones ------------------------------------------------

ESTADO_PERIODO_CHOICES = [
    ("borrador", "Borrador"),
    ("cerrado", "Cerrado"),
]


class ComisionPeriodo(models.Model):
    """Un periodo de comisiones: un mes, con su ventana de instalacion.

    El periodo de un mes no va del 1 al ultimo dia sino del inicio de los dias
    promocionales del mes anterior al fin del mes. Lo instalado en dias
    promocionales paga su primera mensualidad un mes mas tarde, asi que su
    comision es del periodo siguiente, **salvo que el cliente adelante el
    pago**: si la primera mensualidad estaba pagada el dia `corte_adelantos`
    (el 22 del mes siguiente, o el que se escriba), cuenta en este y ya no en
    el siguiente. Como los dias promocionales se adelantan o se retrasan, el
    inicio de los de cada mes se guarda aqui (`inicio_promo`) y el periodo
    siguiente arranca en el.

    **Un borrador no guarda resultados**: se recalcula cada vez que se abre,
    con las suscripciones de ese momento. Al cerrarlo se congela en
    `ComisionVenta` y `ComisionPago`, con una copia de las condiciones: la
    tabla de suscripciones se trunca en cada importacion y su estado es
    siempre el de hoy, asi que recalcular un mes pasado daria otra cosa.
    """

    periodo = models.CharField(max_length=7, unique=True)
    inicio = models.DateField()
    inicio_promo = models.DateField()
    # Nulo: el `dia_corte` de las condiciones, en el mes siguiente.
    corte_adelantos = models.DateField(null=True, blank=True)
    estado = models.CharField(max_length=10, choices=ESTADO_PERIODO_CHOICES, default="borrador")
    # El % de cumplimiento de todos los supervisores y coordinadores de oficina
    # del periodo, salvo quien tenga uno propio en `IndicadorComision`.
    cumplimiento_general_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    # La tasa CONATEL con que se paga: el bolivar oficial del dia 1 del mes
    # siguiente, y de que publicacion del BCV salio (la ultima antes, si ese
    # dia no hubo). Se consulta una vez: el valor de un dia pasado no cambia.
    tasa_conatel = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    tasa_conatel_publicada = models.DateField(null=True, blank=True)
    # Lo congelado al cerrar: las condiciones usadas y el resumen del informe.
    condiciones = models.JSONField(null=True, blank=True)
    resumen = models.JSONField(null=True, blank=True)
    creado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    creado_en = models.DateTimeField(auto_now_add=True)
    cerrado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    cerrado_en = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "comisiones_periodos"
        ordering = ["-periodo"]
        verbose_name = "periodo de comisiones"
        verbose_name_plural = "periodos de comisiones"

    @property
    def cerrado(self) -> bool:
        return self.estado == "cerrado"

    def __str__(self):
        return self.periodo


DECISION_REVISION_CHOICES = [
    ("contar", "Contar en este periodo"),
    ("no_contar", "No contar"),
    # Solo en el primer periodo, para lo instalado en los dias promocionales
    # del mes anterior: si ya se cobro alli por adelantar la mensualidad.
    ("ya_pagada", "Ya cobrada en el periodo anterior"),
    ("normal", "Toca en este periodo"),
]


class RevisionComision(models.Model):
    """La decision a mano sobre una venta: contarla en su periodo o no contarla.

    Las que van a revision son las que las facturas no resuelven: la
    suscripcion y su primera mensualidad se contradicen, la mensualidad se
    cancelo (¿exoneracion?) o no hay ninguna. La decision manda sobre la
    clasificacion, tambien si despues cambian los datos, hasta que se deshace.
    Una venta solo es candidata en el periodo de su instalacion (o en dos, si
    se instalo en dias promocionales), asi que no contarla es que no se paga.

    En el primer periodo del sistema, lo instalado en los dias promocionales
    del mes anterior pudo cobrarse ya alli, fuera del sistema: `ya_pagada` lo
    excluye y `normal` lo deja clasificarse por sus facturas. A partir del
    segundo periodo eso lo dice el cierre del anterior y no se decide.
    """

    orden = models.CharField(max_length=80)
    periodo_origen = models.CharField(max_length=7)
    decision = models.CharField(max_length=10, choices=DECISION_REVISION_CHOICES)
    nota = models.CharField(max_length=255, blank=True, default="")
    decidido_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    decidido_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "comisiones_revisiones"
        constraints = [
            models.UniqueConstraint(fields=["orden", "periodo_origen"], name="comision_revision_unica"),
        ]
        verbose_name = "revision de venta"
        verbose_name_plural = "revisiones de ventas"

    def __str__(self):
        return f"{self.orden} ({self.periodo_origen}): {self.decision}"


class VentaManual(models.Model):
    """Una venta agregada a mano a un periodo: cuenta en el, se instalara cuando se instalara.

    Para lo que las reglas no recogen y hay que pagar igual. Las personas que
    cobran salen de la propia suscripcion, asi que la orden tiene que estar en
    la tabla de suscripciones. Solo se rechaza si ya se pago en otro periodo
    cerrado: una venta no se paga dos veces.
    """

    orden = models.CharField(max_length=80)
    periodo = models.CharField(max_length=7)
    nota = models.CharField(max_length=255)
    agregado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    agregado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "comisiones_ventas_manuales"
        constraints = [
            models.UniqueConstraint(fields=["orden", "periodo"], name="comision_manual_unica"),
        ]
        verbose_name = "venta agregada a mano"
        verbose_name_plural = "ventas agregadas a mano"

    def __str__(self):
        return f"{self.orden} ({self.periodo})"


class IndicadorComision(models.Model):
    """Lo que de una persona en un periodo no sale de las suscripciones.

    - `cumplimiento_pct`: el % de objetivo de un supervisor o coordinador de
      oficina, que multiplica su total (tope 100%). La politica dice que vendra
      de un campo de suscripciones que aun no existe; hasta entonces se escribe
      uno para todos (`ComisionPeriodo.cumplimiento_general_pct`) y este solo
      hace falta para quien tenga uno distinto.
    - `crecimiento_pct`: corrige a mano el crecimiento de un coordinador de UN
      cuando Unidades de negocio no tiene el mes calculado.
    """

    periodo = models.CharField(max_length=7)
    persona = models.ForeignKey(PersonaVentas, on_delete=models.CASCADE, related_name="indicadores_comision")
    cumplimiento_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    crecimiento_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    actualizado_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "comisiones_indicadores"
        constraints = [
            models.UniqueConstraint(fields=["periodo", "persona"], name="comision_indicador_unico"),
        ]
        verbose_name = "indicador de comision"
        verbose_name_plural = "indicadores de comision"

    def __str__(self):
        return f"{self.persona} {self.periodo}"


class ComisionVenta(models.Model):
    """Una venta de un periodo cerrado, tal y como se clasifico al cerrarlo.

    `orden` y `clasificacion` son columnas porque se consultan: una venta
    valida de un periodo cerrado ya se pago y no vuelve a contar en otro. El
    resto de la fila (cliente, plan, personas, estados) va en `datos`.
    """

    periodo = models.ForeignKey(ComisionPeriodo, on_delete=models.CASCADE, related_name="ventas")
    orden = models.CharField(max_length=80, db_index=True)
    clasificacion = models.CharField(max_length=12)
    datos = models.JSONField()

    class Meta:
        db_table = "comisiones_ventas"
        verbose_name = "venta de un periodo cerrado"
        verbose_name_plural = "ventas de periodos cerrados"


class ComisionPago(models.Model):
    """Lo que cobro una persona en un periodo cerrado.

    El nombre y el cargo se copian: el directorio puede cambiar despues y el
    pago tiene que seguir diciendo a quien se le hizo y por que.
    """

    periodo = models.ForeignKey(ComisionPeriodo, on_delete=models.CASCADE, related_name="pagos")
    persona = models.ForeignKey(PersonaVentas, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    nombre = models.CharField(max_length=170)
    cargo = models.CharField(max_length=16)
    neto = models.DecimalField(max_digits=12, decimal_places=2)
    datos = models.JSONField()

    class Meta:
        db_table = "comisiones_pagos"
        ordering = ["cargo", "nombre"]
        verbose_name = "pago de un periodo cerrado"
        verbose_name_plural = "pagos de periodos cerrados"
