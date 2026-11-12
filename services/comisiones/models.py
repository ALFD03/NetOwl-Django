"""Configuracion de comisiones: la ventana de pago y los periodos.

Quien cobra por una venta sale de la propia suscripcion y del directorio de
equipos (`catalogos.MembresiaEquipo`): `Medio` es quien vendio,
`Oportunidad/Administrador` su supervisor y `Vendedor` la coordinadora de
oficina; el resto de la estructura (a quien responde un supervisor, que
unidades lleva cada quien) la dicen las membresias.

Las tarifas, tramos y bonos ya no estan aqui: son las condiciones de cada rol
de cada equipo (`catalogos.CondicionesEquipo`). Un periodo cerrado guarda copia
de las que uso (ver `ComisionPeriodo`), asi que cambiarlas solo afecta a lo
que se calcule despues.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models

from services.catalogos.models import PersonaVentas


# Valores por defecto de campos que ya no existen. Se conservan porque las
# migraciones 0001 y 0009 los referencian por su ruta; no se usan para nada mas.
def _tramos_asesor() -> list[dict]:
    return []


def _tramos_un() -> list[dict]:
    return []


def _bonos_meta() -> list[dict]:
    return []


class CondicionesComision(models.Model):
    """La ventana de pago de los periodos. Fila unica (pk=1).

    Es lo unico global de las condiciones: las reglas que deciden si una venta
    cuenta son las mismas para todos los equipos.

    `dia_promocional` es el dia en que suelen empezar los dias promocionales,
    que es donde se corta cada periodo de comisiones; se propone al calcular
    y se puede cambiar mes a mes. `dias_espera` son los dias tras el cierre
    del periodo antes de calcularlo, para que la primera factura este pagada.
    `dia_corte` es el dia del mes siguiente hasta el que un pago adelantado de
    lo instalado en dias promocionales cuenta en el periodo (ver
    `ComisionPeriodo.corte_adelantos`); tambien se propone y se cambia por mes.
    """

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
    el siguiente. Ese corte es ademas la ventana de pago de **todo** el periodo:
    una venta sin la primera mensualidad pagada hasta ese dia no se paga,
    aunque despues lleguen facturas pagadas. Como los dias promocionales se adelantan o se retrasan, el
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
      oficina, escrito a mano, que multiplica su total (tope 100%). Manda sobre
      el calculado del % Ventas de su site (`calculo._cumplimientos`), y es lo
      unico que vale para quien no tiene calculo. No hay uno general.
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


class CierreInmutable(Exception):
    """Se intento modificar o borrar un cierre archivado."""


class ComisionCierreArchivado(models.Model):
    """La copia de un cierre, guardada en el momento de reabrir el periodo.

    Reabrir borra lo congelado (`ComisionVenta`, `ComisionPago`, las condiciones y
    el resumen) para que el periodo se recalcule, y esas filas no se pueden
    reconstruir: las suscripciones y las facturas se reemplazan en cada
    importacion. Antes de borrarlas se copian aqui, enteras, con quien cerro,
    quien reabrio, cuando y por que. Cada reapertura deja una version mas.

    Es **solo de anadir**: una nomina pagada no se reescribe desde la aplicacion.
    """

    periodo = models.ForeignKey(ComisionPeriodo, on_delete=models.PROTECT, related_name="archivos")
    version = models.PositiveIntegerField()
    cerrado_por = models.CharField(max_length=150, blank=True, default="")
    cerrado_en = models.DateTimeField(null=True, blank=True)
    reabierto_por = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    reabierto_por_nombre = models.CharField(max_length=150, blank=True, default="")
    reabierto_en = models.DateTimeField(auto_now_add=True)
    motivo = models.TextField()
    # Para listar sin abrir la copia.
    total_neto = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    pagos = models.PositiveIntegerField(default=0)
    ventas = models.PositiveIntegerField(default=0)
    # El cierre entero: los campos del periodo, las condiciones, el resumen, y
    # cada venta y cada pago tal y como se congelaron.
    copia = models.JSONField()

    class Meta:
        db_table = "comisiones_cierres_archivados"
        ordering = ["periodo", "-version"]
        constraints = [
            models.UniqueConstraint(fields=["periodo", "version"], name="uq_cierre_archivado_version"),
        ]
        verbose_name = "cierre archivado"
        verbose_name_plural = "cierres archivados"

    def __str__(self):
        return f"{self.periodo} v{self.version}"

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise CierreInmutable("Un cierre archivado no se modifica.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise CierreInmutable("Un cierre archivado no se borra.")
