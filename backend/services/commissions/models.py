"""Configuracion de comisiones: la ventana de pago y los periodos.

Quien cobra por una venta sale de la propia suscripcion y del directorio de
equipos (`catalogos.MembresiaEquipo`): `Medio` es quien vendio,
`Oportunidad/Administrador` su supervisor y `Vendedor` la coordinadora de
oficina; el resto de la estructura (a quien responde un supervisor, que
unidades lleva cada quien) la dicen las membresias.

Las tarifas, tramos y bonos ya no estan aqui: son las condiciones de cada rol
de cada equipo (`catalogos.TeamConditions`). Un periodo cerrado guarda copia
de las que uso (ver `CommissionPeriod`), asi que cambiarlas solo afecta a lo
que se calcule despues.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models

from services.catalogs.models import SalesPerson


# Valor por defecto de tres campos que ya no existen. Se conserva porque las
# migraciones 0001 y 0009 lo referencian por su ruta; no se usa para nada mas.
def _empty_list() -> list[dict]:
    return []


class CommissionConditions(models.Model):
    """La ventana de pago de los periodos. Fila unica (pk=1).

    Es lo unico global de las condiciones: las reglas que deciden si una venta
    cuenta son las mismas para todos los equipos.

    `promo_day` es el dia en que suelen empezar los dias promocionales,
    que es donde se corta cada periodo de comisiones; se propone al calcular
    y se puede cambiar mes a mes. `wait_days` son los dias tras el cierre
    del periodo antes de calcularlo, para que la primera factura este pagada.
    `cutoff_day` es el dia del mes siguiente hasta el que un pago adelantado de
    lo instalado en dias promocionales cuenta en el periodo (ver
    `CommissionPeriod.advance_cutoff`); tambien se propone y se cambia por mes.
    """

    promo_day = models.PositiveSmallIntegerField(default=25, db_column="dia_promocional")
    wait_days = models.PositiveSmallIntegerField(default=15, db_column="dias_espera")
    cutoff_day = models.PositiveSmallIntegerField(default=22, db_column="dia_corte")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="actualizado_por_id",
    )
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "comisiones_condiciones"
        verbose_name = "condiciones de comision"
        verbose_name_plural = "condiciones de comision"

    @classmethod
    def current(cls) -> CommissionConditions:
        """La fila unica, creandola con la politica por defecto si falta."""
        row, _ = cls.objects.get_or_create(pk=1)
        return row

    def __str__(self):
        return "condiciones de comision"


# --- Los periodos de comisiones ------------------------------------------------

PERIOD_STATE_CHOICES = [
    ("borrador", "Borrador"),
    ("cerrado", "Cerrado"),
]


class CommissionPeriod(models.Model):
    """Un periodo de comisiones: un mes, con su ventana de instalacion.

    El periodo de un mes no va del 1 al ultimo dia sino del inicio de los dias
    promocionales del mes anterior al fin del mes. Lo instalado en dias
    promocionales paga su primera mensualidad un mes mas tarde, asi que su
    comision es del periodo siguiente, **salvo que el cliente adelante el
    pago**: si la primera mensualidad estaba pagada el dia `advance_cutoff`
    (el 22 del mes siguiente, o el que se escriba), cuenta en este y ya no en
    el siguiente. Ese corte es ademas la ventana de pago de **todo** el periodo:
    una venta sin la primera mensualidad pagada hasta ese dia no se paga,
    aunque despues lleguen facturas pagadas. Como los dias promocionales se adelantan o se retrasan, el
    inicio de los de cada mes se guarda aqui (`promo_start`) y el periodo
    siguiente arranca en el.

    **Un borrador no guarda resultados**: se recalcula cada vez que se abre,
    con las suscripciones de ese momento. Al cerrarlo se congela en
    `CommissionSale` y `CommissionPayment`, con una copia de las condiciones: la
    tabla de suscripciones se trunca en cada importacion y su estado es
    siempre el de hoy, asi que recalcular un mes pasado daria otra cosa.
    """

    period = models.CharField(max_length=7, unique=True, db_column="periodo")
    start = models.DateField(db_column="inicio")
    promo_start = models.DateField(db_column="inicio_promo")
    # Nulo: el `cutoff_day` de las condiciones, en el mes siguiente.
    advance_cutoff = models.DateField(null=True, blank=True, db_column="corte_adelantos")
    status = models.CharField(max_length=10, choices=PERIOD_STATE_CHOICES, default="borrador", db_column="estado")
    # La tasa CONATEL con que se paga: el bolivar oficial del dia 1 del mes
    # siguiente, y de que publicacion del BCV salio (la ultima antes, si ese
    # dia no hubo). Se consulta una vez: el valor de un dia pasado no cambia.
    conatel_rate = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True, db_column="tasa_conatel")
    conatel_rate_published = models.DateField(null=True, blank=True, db_column="tasa_conatel_publicada")
    # Lo congelado al cerrar: las condiciones usadas y el resumen del informe.
    conditions = models.JSONField(null=True, blank=True, db_column="condiciones")
    summary = models.JSONField(null=True, blank=True, db_column="resumen")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="creado_por_id",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_column="creado_en")
    closed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="cerrado_por_id",
    )
    closed_at = models.DateTimeField(null=True, blank=True, db_column="cerrado_en")

    class Meta:
        db_table = "comisiones_periodos"
        ordering = ["-period"]
        verbose_name = "periodo de comisiones"
        verbose_name_plural = "periodos de comisiones"

    @property
    def is_closed(self) -> bool:
        return self.status == "cerrado"

    def __str__(self):
        return self.period


REVIEW_DECISION_CHOICES = [
    ("contar", "Contar en este periodo"),
    ("no_contar", "No contar"),
    # Solo en el primer periodo, para lo instalado en los dias promocionales
    # del mes anterior: si ya se cobro alli por adelantar la mensualidad.
    ("ya_pagada", "Ya cobrada en el periodo anterior"),
    ("normal", "Toca en este periodo"),
]


class CommissionReview(models.Model):
    """La decision a mano sobre una venta: contarla en su periodo o no contarla.

    Las que van a revision son las que las facturas no resuelven: paso a plan
    gratuito con la mensualidad pagada, o todas sus mensualidades se cancelaron
    a menos de 20 dias de emitidas (o no se sabe cuando). La decision manda sobre la
    clasificacion, tambien si despues cambian los datos, hasta que se deshace.
    Una venta solo es candidata en el periodo de su instalacion (o en dos, si
    se instalo en dias promocionales), asi que no contarla es que no se paga.

    En el primer periodo del sistema, lo instalado en los dias promocionales
    del mes anterior pudo cobrarse ya alli, fuera del sistema: `ya_pagada` lo
    excluye y `normal` lo deja clasificarse por sus facturas. A partir del
    segundo periodo eso lo dice el cierre del anterior y no se decide.
    """

    order = models.CharField(max_length=80, db_column="orden")
    source_period = models.CharField(max_length=7, db_column="periodo_origen")
    decision = models.CharField(max_length=10, choices=REVIEW_DECISION_CHOICES)
    note = models.CharField(max_length=255, blank=True, default="", db_column="nota")
    decided_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="decidido_por_id",
    )
    decided_at = models.DateTimeField(auto_now=True, db_column="decidido_en")

    class Meta:
        db_table = "comisiones_revisiones"
        constraints = [
            models.UniqueConstraint(fields=["order", "source_period"], name="comision_revision_unica"),
        ]
        verbose_name = "revision de venta"
        verbose_name_plural = "revisiones de ventas"

    def __str__(self):
        return f"{self.order} ({self.source_period}): {self.decision}"


class ManualSale(models.Model):
    """Una venta agregada a mano a un periodo: cuenta en el, se instalara cuando se instalara.

    Para lo que las reglas no recogen y hay que pagar igual. Las personas que
    cobran salen de la propia suscripcion, asi que la orden tiene que estar en
    la tabla de suscripciones. Solo se rechaza si ya se pago en otro periodo
    cerrado: una venta no se paga dos veces.
    """

    order = models.CharField(max_length=80, db_column="orden")
    period = models.CharField(max_length=7, db_column="periodo")
    note = models.CharField(max_length=255, db_column="nota")
    added_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="agregado_por_id",
    )
    added_at = models.DateTimeField(auto_now_add=True, db_column="agregado_en")

    class Meta:
        db_table = "comisiones_ventas_manuales"
        constraints = [
            models.UniqueConstraint(fields=["order", "period"], name="comision_manual_unica"),
        ]
        verbose_name = "venta agregada a mano"
        verbose_name_plural = "ventas agregadas a mano"

    def __str__(self):
        return f"{self.order} ({self.period})"


class CommissionIndicator(models.Model):
    """Lo que de una persona en un periodo no sale de las suscripciones.

    - `compliance_pct`: el % de objetivo de un supervisor o coordinador de
      oficina, escrito a mano, que multiplica su total (tope 100%). Manda sobre
      el calculado del % Ventas de su site (`calculation._cumplimientos`), y es lo
      unico que vale para quien no tiene calculo. No hay uno general.
    - `growth_pct`: corrige a mano el crecimiento de un coordinador de UN
      cuando Unidades de negocio no tiene el mes calculado.
    """

    period = models.CharField(max_length=7, db_column="periodo")
    person = models.ForeignKey(SalesPerson, on_delete=models.CASCADE, related_name="commission_indicators", db_column="persona_id")
    compliance_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, db_column="cumplimiento_pct")
    growth_pct = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, db_column="crecimiento_pct")
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="actualizado_por_id",
    )
    updated_at = models.DateTimeField(auto_now=True, db_column="actualizado_en")

    class Meta:
        db_table = "comisiones_indicadores"
        constraints = [
            models.UniqueConstraint(fields=["period", "person"], name="comision_indicador_unico"),
        ]
        verbose_name = "indicador de comision"
        verbose_name_plural = "indicadores de comision"

    def __str__(self):
        return f"{self.person} {self.period}"


class CommissionSale(models.Model):
    """Una venta de un periodo cerrado, tal y como se clasifico al cerrarlo.

    `order` y `classification` son columnas porque se consultan: una venta
    valida de un periodo cerrado ya se pago y no vuelve a contar en otro. El
    resto de la fila (cliente, plan, personas, estados) va en `data`.
    """

    period = models.ForeignKey(CommissionPeriod, on_delete=models.CASCADE, related_name="sales", db_column="periodo_id")
    order = models.CharField(max_length=80, db_index=True, db_column="orden")
    classification = models.CharField(max_length=12, db_column="clasificacion")
    data = models.JSONField(db_column="datos")

    class Meta:
        db_table = "comisiones_ventas"
        verbose_name = "venta de un periodo cerrado"
        verbose_name_plural = "ventas de periodos cerrados"


class CommissionPayment(models.Model):
    """Lo que cobro una persona en un periodo cerrado.

    El nombre y el cargo se copian: el directorio puede cambiar despues y el
    pago tiene que seguir diciendo a quien se le hizo y por que.
    """

    period = models.ForeignKey(CommissionPeriod, on_delete=models.CASCADE, related_name="payments", db_column="periodo_id")
    person = models.ForeignKey(SalesPerson, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="persona_id",
    )
    name = models.CharField(max_length=170, db_column="nombre")
    title = models.CharField(max_length=16, db_column="cargo")
    net = models.DecimalField(max_digits=12, decimal_places=2, db_column="neto")
    data = models.JSONField(db_column="datos")

    class Meta:
        db_table = "comisiones_pagos"
        ordering = ["title", "name"]
        verbose_name = "pago de un periodo cerrado"
        verbose_name_plural = "pagos de periodos cerrados"


class ImmutableClose(Exception):
    """Se intento modificar o borrar un cierre archivado."""


class ArchivedClose(models.Model):
    """La copia de un cierre, guardada en el momento de reabrir el periodo.

    Reabrir borra lo congelado (`CommissionSale`, `CommissionPayment`, las condiciones y
    el resumen) para que el periodo se recalcule, y esas filas no se pueden
    reconstruir: las suscripciones y las facturas se reemplazan en cada
    importacion. Antes de borrarlas se copian aqui, enteras, con quien cerro,
    quien reabrio, cuando y por que. Cada reapertura deja una version mas.

    Es **solo de anadir**: una nomina pagada no se reescribe desde la aplicacion.
    """

    period = models.ForeignKey(CommissionPeriod, on_delete=models.PROTECT, related_name="archives", db_column="periodo_id")
    version = models.PositiveIntegerField()
    closed_by = models.CharField(max_length=150, blank=True, default="", db_column="cerrado_por")
    closed_at = models.DateTimeField(null=True, blank=True, db_column="cerrado_en")
    reopened_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
        db_column="reabierto_por_id",
    )
    reopened_by_name = models.CharField(max_length=150, blank=True, default="", db_column="reabierto_por_nombre")
    reopened_at = models.DateTimeField(auto_now_add=True, db_column="reabierto_en")
    reason = models.TextField(db_column="motivo")
    # Para listar sin abrir la copia.
    net_total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"), db_column="total_neto")
    payments = models.PositiveIntegerField(default=0, db_column="pagos")
    sales = models.PositiveIntegerField(default=0, db_column="ventas")
    # El cierre entero: los campos del periodo, las condiciones, el resumen, y
    # cada venta y cada pago tal y como se congelaron.
    snapshot = models.JSONField(db_column="copia")

    class Meta:
        db_table = "comisiones_cierres_archivados"
        ordering = ["period", "-version"]
        constraints = [
            models.UniqueConstraint(fields=["period", "version"], name="uq_cierre_archivado_version"),
        ]
        verbose_name = "cierre archivado"
        verbose_name_plural = "cierres archivados"

    def __str__(self):
        return f"{self.period} v{self.version}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableClose("Un cierre archivado no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableClose("Un cierre archivado no se borra.")
