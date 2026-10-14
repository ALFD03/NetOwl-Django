"""Las reglas de pago, como funciones puras.

Nada aqui lee la base de datos: recibe las ventas ya clasificadas y con sus
personas resueltas (`calculo.py`) y las condiciones vigentes, y devuelve lo
que cobra cada uno. Asi se pueden comprobar contra los ejemplos de la politica
sin datos reales.

La politica, en resumen:

- **PYME**: quien la vendio (el `Medio`) cobra el % del precio del plan, sea
  cual sea su cargo y vendiera lo que vendiera. Nadie mas cobra por ella, y no
  cuenta para ningun tramo ni para ningun equipo.
- **Asesor**: por tramos de cuantas ventas residenciales hizo. Hasta 5, nada;
  de 6 a 19, 5$ cada una menos 5 ventas; 20, todas a 6$; de 21 a 25, a 7$;
  mas de 25, a 8$ (los montos son los de `CondicionesComision`).
- **Supervisor y coordinador de oficina**: 2.5$ por cada venta residencial de
  su equipo y 4$ por cada una propia, y el total por el % de cumplimiento de su
  objetivo, con tope en 100%.
- **Coordinador de unidad de negocio**: por cada venta residencial de su
  equipo, el monto del tramo del crecimiento de sus unidades; 4$ por cada una
  propia. Sin objetivo.

Una venta propia de un supervisor no le cuenta ademas como venta de equipo:
cobra 4$, no 6.5$. Si que cuenta como venta de equipo para quienes estan por
encima de el.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from core.utils import normalize_text

# --- Clasificacion de una venta -----------------------------------------------

FACTURADO = "facturado por completo"
POR_FACTURAR = "por facturar"
NADA_POR_FACTURAR = "nada por facturar"

VALIDA = "valida"
NO_PAGADA = "no_pagada"
REVISION = "revision"
EXCLUIDA = "excluida"


def clasificar(activa: bool, estado_factura: str, decision: str | None = None) -> tuple[str, str]:
    """`(clasificacion, motivo)` de una venta del periodo.

    - Facturado por completo y en progreso: la primera mensualidad esta
      facturada y pagada. **Valida.**
    - Facturado por completo y no en progreso: se facturo y no se pago. Esa
      comision se pierde: en el corte siguiente la venta ya no aparece.
    - Por facturar y en progreso: no ha emitido la primera factura, asi que una
      campana le exonero un mes. Se revisa a mano: contarla aqui o diferirla a
      un periodo posterior (`decision`).
    - Lo demas no se paga.
    """
    factura = normalize_text(estado_factura)
    if factura == FACTURADO:
        if activa:
            return VALIDA, "Facturada y en progreso"
        return NO_PAGADA, "Facturada y no está en progreso: la primera factura no se pagó"
    if factura == POR_FACTURAR:
        if not activa:
            return EXCLUIDA, "Por facturar y no está en progreso"
        if decision == "contar":
            return VALIDA, "Por facturar: se decidió contarla en este corte"
        return REVISION, "Por facturar y en progreso: sin primera factura (¿mes exonerado?)"
    if factura == NADA_POR_FACTURAR:
        return EXCLUIDA, "Nada por facturar"
    return EXCLUIDA, "Sin estado de factura"


# --- Tramos ----------------------------------------------------------------------

def validar_tramos_asesor(tramos: Any) -> list[dict[str, float]]:
    """Los tramos del asesor, comprobados y ordenados. Levanta `ValueError`.

    Cada tramo vale desde `desde` ventas hasta el siguiente: el primero tiene
    que empezar en 0 y no puede haber dos con el mismo inicio. `descontar` no
    puede pasar de `desde`, o el tramo pagaria ventas negativas.
    """
    if not isinstance(tramos, list) or not tramos:
        raise ValueError("Los tramos del asesor no pueden quedar vacíos.")
    limpios = []
    for tramo in tramos:
        try:
            desde = int(tramo["desde"])
            monto = float(tramo["monto"])
            descontar = int(tramo.get("descontar") or 0)
        except (KeyError, TypeError, ValueError):
            raise ValueError("Cada tramo del asesor necesita «desde», «monto» y «descontar» numéricos.") from None
        if desde < 0 or monto < 0 or descontar < 0:
            raise ValueError("Los tramos del asesor no admiten valores negativos.")
        if descontar > desde:
            raise ValueError(f"El tramo desde {desde} ventas no puede descontar {descontar}.")
        limpios.append({"desde": desde, "monto": monto, "descontar": descontar})
    limpios.sort(key=lambda t: t["desde"])
    if limpios[0]["desde"] != 0:
        raise ValueError("El primer tramo del asesor tiene que empezar en 0 ventas.")
    if len({t["desde"] for t in limpios}) != len(limpios):
        raise ValueError("Dos tramos del asesor empiezan en la misma cantidad de ventas.")
    return limpios


def validar_tramos_un(tramos: Any) -> list[dict[str, float | None]]:
    """Los tramos de crecimiento del coordinador de UN, comprobados y ordenados.

    El primero no tiene inicio (`desde_pct` nulo: cualquier crecimiento, hasta
    negativo); los demas empiezan en un % creciente.
    """
    if not isinstance(tramos, list) or not tramos:
        raise ValueError("Los tramos de crecimiento no pueden quedar vacíos.")
    limpios = []
    for tramo in tramos:
        try:
            bruto = tramo.get("desde_pct")
            desde = None if bruto in (None, "") else float(bruto)
            monto = float(tramo["monto"])
        except (AttributeError, KeyError, TypeError, ValueError):
            raise ValueError("Cada tramo de crecimiento necesita «desde_pct» y «monto» numéricos.") from None
        if monto < 0:
            raise ValueError("Los montos de los tramos de crecimiento no pueden ser negativos.")
        limpios.append({"desde_pct": desde, "monto": monto})
    sin_inicio = [t for t in limpios if t["desde_pct"] is None]
    if len(sin_inicio) != 1:
        raise ValueError("Exactamente un tramo de crecimiento tiene que valer «desde siempre».")
    con_inicio = sorted((t for t in limpios if t["desde_pct"] is not None), key=lambda t: t["desde_pct"])
    if len({t["desde_pct"] for t in con_inicio}) != len(con_inicio):
        raise ValueError("Dos tramos de crecimiento empiezan en el mismo %.")
    return sin_inicio + con_inicio


def tramo_asesor(ventas: int, tramos: list[dict[str, float]]) -> dict[str, float]:
    """El tramo en el que cae una cantidad de ventas (el ultimo que empieza en o antes)."""
    elegido = tramos[0]
    for tramo in tramos:
        if tramo["desde"] <= ventas:
            elegido = tramo
    return elegido


def pago_asesor(ventas: int, tramos: list[dict[str, float]]) -> tuple[dict[str, float], int, float]:
    """`(tramo, ventas pagadas, monto)` de un asesor con `ventas` residenciales.

    >>> T = validar_tramos_asesor([{"desde": 0, "monto": 0, "descontar": 0},
    ...     {"desde": 6, "monto": 5, "descontar": 5}, {"desde": 20, "monto": 6, "descontar": 0},
    ...     {"desde": 21, "monto": 7, "descontar": 0}, {"desde": 26, "monto": 8, "descontar": 0}])
    >>> [pago_asesor(n, T)[2] for n in (5, 6, 19, 20, 21, 25, 26)]
    [0.0, 5.0, 70.0, 120.0, 147.0, 175.0, 208.0]
    """
    tramo = tramo_asesor(ventas, tramos)
    pagadas = max(0, ventas - int(tramo["descontar"]))
    return tramo, pagadas, round(pagadas * float(tramo["monto"]), 2)


def monto_un(crecimiento: float, tramos: list[dict[str, float | None]]) -> float:
    """Lo que cobra el coordinador de UN por venta de equipo con ese crecimiento (%).

    >>> T = validar_tramos_un([{"desde_pct": None, "monto": 1},
    ...     {"desde_pct": 1, "monto": 1.5}, {"desde_pct": 2, "monto": 2}])
    >>> [monto_un(c, T) for c in (-3, 0.99, 1, 1.5, 2, 7)]
    [1.0, 1.0, 1.5, 1.5, 2.0, 2.0]
    """
    monto = float(tramos[0]["monto"])
    for tramo in tramos:
        if tramo["desde_pct"] is not None and tramo["desde_pct"] <= crecimiento:
            monto = float(tramo["monto"])
    return monto


# --- Pagos -------------------------------------------------------------------------

@dataclass
class Venta:
    """Una venta del periodo con las personas que cobran por ella ya resueltas.

    Los `*_id` son de `PersonaVentas`; nulos si el literal no esta en el
    directorio (o, en el coordinador de UN, si la jerarquia no lo da).
    """

    orden: str
    pyme: bool
    precio: float
    pct_pyme: float | None
    medio_id: int | None
    supervisor_id: int | None
    coord_oficina_id: int | None
    coord_un_id: int | None


@dataclass
class Pago:
    """Lo que cobra una persona en el periodo, con el desglose que lo explica."""

    persona_id: int
    cargo: str
    ventas_propias: int = 0
    ventas_equipo: int = 0
    ventas_pyme: int = 0
    monto_pyme: float = 0.0
    pyme_sin_porcentaje: int = 0
    monto_propias: float = 0.0
    monto_equipo: float = 0.0
    # Lo que se multiplica por el cumplimiento (supervisor y coordinador de
    # oficina): propias + equipo. La PYME queda fuera, es del vendedor directo.
    bruto: float = 0.0
    factor_pct: float | None = None
    neto: float = 0.0
    detalle: dict[str, Any] = field(default_factory=dict)
    avisos: list[str] = field(default_factory=list)


def calcular_pagos(
    ventas: list[Venta],
    cargos: dict[int, str],
    condiciones: dict[str, Any],
    cumplimientos: dict[int, float | None],
    crecimientos: dict[int, float | None],
) -> dict[int, Pago]:
    """Lo que cobra cada persona por las ventas validas del periodo.

    - `cargos`: el cargo de cada persona del directorio.
    - `condiciones`: tarifas y tramos ya validados (ver `CondicionesComision`).
    - `cumplimientos`: % de objetivo de supervisores y coordinadores de
      oficina; nulo es "sin definir", que paga como 100% y lo avisa.
    - `crecimientos`: % de crecimiento de las unidades de cada coordinador de
      UN; nulo es "desconocido", y entonces sus ventas de equipo no se pagan
      hasta que se conozca.
    """
    pagos: dict[int, Pago] = {}

    def pago(persona_id: int) -> Pago:
        if persona_id not in pagos:
            pagos[persona_id] = Pago(persona_id=persona_id, cargo=cargos.get(persona_id, ""))
        return pagos[persona_id]

    for venta in ventas:
        if venta.pyme:
            if venta.medio_id is None:
                continue
            p = pago(venta.medio_id)
            p.ventas_pyme += 1
            if venta.pct_pyme is None:
                p.pyme_sin_porcentaje += 1
            else:
                p.monto_pyme += venta.precio * venta.pct_pyme / 100
            continue

        if venta.medio_id is not None:
            pago(venta.medio_id).ventas_propias += 1
        for superior in (venta.supervisor_id, venta.coord_oficina_id, venta.coord_un_id):
            if superior is not None and superior != venta.medio_id:
                pago(superior).ventas_equipo += 1

    monto_equipo = float(condiciones["monto_equipo"])
    monto_directa = float(condiciones["monto_directa"])
    monto_directa_un = float(condiciones["monto_directa_un"])

    for p in pagos.values():
        p.monto_pyme = round(p.monto_pyme, 2)
        if p.pyme_sin_porcentaje:
            p.avisos.append(f"{p.pyme_sin_porcentaje} venta(s) PYME de un plan sin % de comisión definido")

        if p.cargo == "asesor":
            tramo, pagadas, monto = pago_asesor(p.ventas_propias, condiciones["tramos_asesor"])
            p.monto_propias = monto
            p.bruto = monto
            p.detalle = {"tramo_desde": tramo["desde"], "monto_por_venta": tramo["monto"], "ventas_pagadas": pagadas}
            if p.ventas_equipo:
                p.avisos.append("Figura como superior de otras ventas, pero un asesor no cobra por equipo")
        elif p.cargo in ("supervisor", "coord_oficina"):
            p.monto_propias = round(p.ventas_propias * monto_directa, 2)
            p.monto_equipo = round(p.ventas_equipo * monto_equipo, 2)
            p.bruto = round(p.monto_propias + p.monto_equipo, 2)
            cumplimiento = cumplimientos.get(p.persona_id)
            if cumplimiento is None:
                p.avisos.append("Cumplimiento del objetivo sin definir: se paga como 100%")
                cumplimiento = 100.0
            p.factor_pct = min(max(float(cumplimiento), 0.0), 100.0)
            p.detalle = {"monto_equipo": monto_equipo, "monto_directa": monto_directa}
        elif p.cargo == "coord_un":
            p.monto_propias = round(p.ventas_propias * monto_directa_un, 2)
            crecimiento = crecimientos.get(p.persona_id)
            if crecimiento is None:
                if p.ventas_equipo:
                    p.avisos.append("Crecimiento de sus unidades desconocido: las ventas de equipo no se pagan")
                por_venta = 0.0
            else:
                por_venta = monto_un(crecimiento, condiciones["tramos_un"])
            p.monto_equipo = round(p.ventas_equipo * por_venta, 2)
            p.bruto = round(p.monto_propias + p.monto_equipo, 2)
            p.detalle = {"crecimiento_pct": crecimiento, "monto_por_venta_equipo": por_venta, "monto_directa": monto_directa_un}
        else:
            p.avisos.append("Sin cargo conocido: no se le paga")

        factor = 1.0 if p.factor_pct is None else p.factor_pct / 100
        p.neto = round(p.bruto * factor + p.monto_pyme, 2)

    return pagos


# --- El periodo ---------------------------------------------------------------------

def ventana(inicio_promo_anterior: date, inicio_promo: date) -> tuple[date, date]:
    """El primer y el ultimo dia de instalacion que cuentan para un periodo.

    Va del inicio de los dias promocionales del mes anterior hasta el dia antes
    del inicio de los del mes a calcular: lo instalado en dias promocionales no
    paga la mensualidad siguiente sino la otra, asi que su comision es del
    periodo siguiente.

    >>> ventana(date(2026, 8, 25), date(2026, 9, 24))
    (datetime.date(2026, 8, 25), datetime.date(2026, 9, 23))
    """
    from datetime import timedelta

    if inicio_promo <= inicio_promo_anterior:
        raise ValueError("Los días promocionales del mes tienen que empezar después de los del mes anterior.")
    return inicio_promo_anterior, inicio_promo - timedelta(days=1)
