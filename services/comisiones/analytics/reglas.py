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

El equipo de cada uno sale de la propia venta: la oficina cobra por las que
la nombran como `Vendedor` y el supervisor por las que lo nombran como
`Oportunidad/Administrador`. El coordinador de UN cobra por las de los supervisores
que le responden, sean de la oficina que sean; la venta de un supervisor sin
coordinador de UN llega aqui sin `coord_un_id`.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from core.utils import normalize_text

# --- Clasificacion de una venta -----------------------------------------------

# `Estado de la factura` de la suscripcion, normalizado. Odoo escribe «Nada que
# facturar»; la politica lo llama «nada por facturar».
FACTURADO = "facturado por completo"
POR_FACTURAR = "por facturar"
NADA_POR_FACTURAR = frozenset({"nada que facturar", "nada por facturar"})

# `Estado` y `Estado del pago` de una factura, normalizados.
FACTURA_BORRADOR = "borrador"
FACTURA_CANCELADA = "cancelado"
PAGO_REVERTIDO = "revertido"
PAGOS_VALIDOS = frozenset({"pagado", "en proceso de pago"})

# `Estado de la Suscripción` de las que aun no son un servicio: una cotizacion
# no se vendio y una instalacion no termino. No cuentan nunca.
ESTADOS_SIN_SERVICIO = frozenset({"cotizacion", "instalacion"})


def un_mes_despues(dia: date) -> date:
    """El mismo dia del mes siguiente, recortado al ultimo si ese mes es mas corto.

    >>> un_mes_despues(date(2026, 8, 31)), un_mes_despues(date(2026, 12, 15))
    (datetime.date(2026, 9, 30), datetime.date(2027, 1, 15))
    """
    anio, mes = (dia.year + 1, 1) if dia.month == 12 else (dia.year, dia.month + 1)
    return date(anio, mes, min(dia.day, calendar.monthrange(anio, mes)[1]))


def cancelada_sin_cumplir_un_mes(instalada: date | None, cancelada: date | None) -> bool:
    """Si se cancelo antes de cumplir un mes desde su instalacion.

    Un mes es hasta el mismo dia del mes siguiente: instalada el 1 de septiembre
    y cancelada el 30 no lo cumplio; cancelada el 1 de octubre, si. Sin una de
    las dos fechas no se puede decir, y no se excluye.

    >>> cancelada_sin_cumplir_un_mes(date(2026, 9, 1), date(2026, 9, 30))
    True
    >>> cancelada_sin_cumplir_un_mes(date(2026, 8, 31), date(2026, 9, 30))
    False
    >>> cancelada_sin_cumplir_un_mes(date(2026, 9, 1), None)
    False
    """
    return instalada is not None and cancelada is not None and cancelada < un_mes_despues(instalada)

VALIDA = "valida"
NO_PAGADA = "no_pagada"
REVISION = "revision"
EXCLUIDA = "excluida"

# Lo que le paso a la primera mensualidad (`situacion`).
PAGADA = "pagada"
IMPAGA = "impaga"
EN_BORRADOR = "borrador"
CANCELADA = "cancelada"
SIN_FACTURA = "sin_factura"

MOTIVO_CAMBIO_PLAN = "Por facturar con cambio de plan: la primera mensualidad, de otro plan, está pagada"


@dataclass(frozen=True)
class Factura:
    """Una factura de la suscripcion, tal y como la lee `facturas.leer_facturas`.

    `plan` es el plan de catalogo de sus lineas; vacio si no factura ninguno
    (la de instalacion, la del router), y entonces no es una mensualidad.
    `creado_el` es texto ISO (`YYYY-MM-DD HH:MM:SS`), vacio si no se supo leer.
    """

    numero: str
    estado: str
    estado_pago: str
    creado_el: str
    plan: str


def _cancelada(factura: Factura) -> bool:
    return normalize_text(factura.estado) == FACTURA_CANCELADA


def _revertida(factura: Factura) -> bool:
    return normalize_text(factura.estado_pago) == PAGO_REVERTIDO


def primera_mensualidad(facturas: list[Factura]) -> Factura | None:
    """La factura que dice si se pago la primera mensualidad.

    Es la primera factura con un plan, por `Creado el`, **sin contar las
    canceladas**: una cancelada no es una mensualidad, sea del mes que sea. Si
    todas estan canceladas se devuelve la ultima, y la venta va a revision
    (¿la campana exonero el mes?).

    Si a la elegida se le revirtio el pago y despues, **en el mismo mes**, se
    emitio otra, manda la nueva: un pago revertido suele ser uno que no llego
    al banco y el cliente volvio a pagar. Una de otro mes ya es la mensualidad
    siguiente y no la sustituye.

    >>> f = lambda n, dia, pago="Pagado", estado="Registrado", plan="Plan": Factura(n, estado, pago, dia, plan)
    >>> primera_mensualidad([f("B", "2026-10-05"), f("A", "2026-09-05", "Sin pagar")]).numero
    'A'
    >>> primera_mensualidad([f("A", "2026-09-05", "Revertido"), f("B", "2026-09-20")]).numero
    'B'
    >>> primera_mensualidad([f("A", "2026-09-05", "Revertido"), f("B", "2026-10-05")]).numero
    'A'
    >>> primera_mensualidad([f("A", "2026-09-05", estado="Cancelado"), f("B", "2026-10-06")]).numero
    'B'
    >>> primera_mensualidad([f("A", "2026-09-05", estado="Cancelado"), f("B", "2026-10-06", estado="Cancelado")]).numero
    'B'
    >>> primera_mensualidad([f("I", "2026-09-01", plan="")]) is None
    True
    """
    mensualidades = sorted(
        (f for f in facturas if f.plan),
        key=lambda f: (f.creado_el == "", f.creado_el, f.numero),
    )
    if not mensualidades:
        return None
    vigentes = [f for f in mensualidades if not _cancelada(f)]
    if not vigentes:
        return mensualidades[-1]
    elegida = vigentes[0]
    mes = elegida.creado_el[:7]
    for siguiente in vigentes[1:]:
        if not mes or siguiente.creado_el[:7] != mes or not _revertida(elegida):
            break
        elegida = siguiente
    return elegida


def situacion(factura: Factura | None) -> str:
    """`PAGADA`, `IMPAGA`, `EN_BORRADOR`, `CANCELADA` o `SIN_FACTURA`.

    Solo cuenta como pagada una factura registrada con el pago «Pagado» o «En
    proceso de pago»: «Pagado parcialmente», «Revertido» y «Sin pagar» no.
    """
    if factura is None:
        return SIN_FACTURA
    estado = normalize_text(factura.estado)
    if estado == FACTURA_CANCELADA:
        return CANCELADA
    if estado == FACTURA_BORRADOR:
        return EN_BORRADOR
    return PAGADA if normalize_text(factura.estado_pago) in PAGOS_VALIDOS else IMPAGA


def clasificar(
    estado_factura: str,
    factura: Factura | None,
    plan_suscripcion: str = "",
    gratuita: bool = False,
    decision: str | None = None,
    estado_suscripcion: str = "",
    cancelada_sin_mes: bool = False,
) -> tuple[str, str]:
    """`(clasificacion, motivo)` de una venta del periodo.

    `factura` es su primera mensualidad (`primera_mensualidad`), `estado_factura`
    el de la suscripcion y `plan_suscripcion` su plan de hoy si esta en el
    catalogo. Que la suscripcion siga hoy en progreso no importa: lo que paga
    la comision es la primera mensualidad.

    - Una suscripcion en **Cotización** o **Instalación** no cuenta nunca, ni
      con una decision manual: todavia no es un servicio. Tampoco una que se
      **cancelo sin cumplir un mes** activa (`cancelada_sin_cumplir_un_mes`).
    - Una **decision** manual manda sobre todo lo demas hasta que se deshace.
    - Una suscripcion que **paso a plan gratuito** no paga; si aun asi tiene la
      mensualidad pagada, se revisa.
    - **Mensualidad pagada**: valida, este como este la facturacion de la
      suscripcion: la factura ya se pago. Si la suscripcion dice «Por
      facturar» y la factura es de otro plan, se apunta como cambio de plan
      (Odoo factura el nuevo y deja la venta por facturar).
    - **Sin pagar** (o pagada en parte, o revertida) o **en borrador**: no pagada.
    - **Todas sus mensualidades canceladas**, o **ninguna**: se revisa (¿la
      campana exonero el mes?), salvo «Nada que facturar».

    >>> f = lambda pago="Pagado", estado="Registrado", plan="Plan A": Factura("F1", estado, pago, "2026-09-05", plan)
    >>> clasificar("Facturado por completo", f())[0]
    'valida'
    >>> clasificar("Facturado por completo", f("Pagado parcialmente"))[0]
    'no_pagada'
    >>> clasificar("Facturado por completo", f(estado="Cancelado"))[0]
    'revision'
    >>> clasificar("Por facturar", f(), "Plan A")[0]
    'valida'
    >>> clasificar("Por facturar", f(), "Plan B")[0]
    'valida'
    >>> clasificar("Por facturar", None)[0]
    'revision'
    >>> clasificar("Por facturar", f(estado="Cancelado"), gratuita=True)[0]
    'excluida'
    >>> clasificar("Facturado por completo", f("Sin pagar"), decision="contar")[0]
    'valida'
    >>> clasificar("Nada que facturar", None)[0]
    'excluida'
    >>> clasificar("Facturado por completo", f(), decision="contar", estado_suscripcion="Instalación")[0]
    'excluida'
    >>> clasificar("Facturado por completo", f(), cancelada_sin_mes=True)[0]
    'excluida'
    """
    if normalize_text(estado_suscripcion) in ESTADOS_SIN_SERVICIO:
        return EXCLUIDA, f"En «{estado_suscripcion}»: todavía no es un servicio"
    if cancelada_sin_mes:
        return EXCLUIDA, "Se canceló sin cumplir un mes activa"
    if decision == "contar":
        return VALIDA, "Decisión manual: contarla"
    if decision == "no_contar":
        return EXCLUIDA, "Decisión manual: no contarla"

    pago = situacion(factura)
    estado = normalize_text(estado_factura)

    if gratuita:
        if pago == PAGADA:
            return REVISION, "Pasó a plan gratuito, pero su primera mensualidad está pagada"
        return EXCLUIDA, "Pasó a plan gratuito: no paga comisión"

    if pago == PAGADA:
        cambio_plan = plan_suscripcion and normalize_text(plan_suscripcion) != normalize_text(factura.plan)
        if estado == POR_FACTURAR and cambio_plan:
            return VALIDA, MOTIVO_CAMBIO_PLAN
        return VALIDA, "Primera mensualidad pagada"
    if pago == IMPAGA:
        return NO_PAGADA, f"Primera mensualidad «{factura.estado_pago or 'sin estado de pago'}»"
    if pago == EN_BORRADOR:
        return NO_PAGADA, "Primera mensualidad en borrador: todavía no se emitió"

    if estado in NADA_POR_FACTURAR:
        return EXCLUIDA, "Nada que facturar"
    if pago == CANCELADA:
        return REVISION, "Todas sus facturas de mensualidad están canceladas: ¿exoneración?"
    if estado == FACTURADO:
        return REVISION, "Facturado por completo, pero sin factura de mensualidad"
    if estado == POR_FACTURAR:
        return REVISION, "Por facturar y sin factura de mensualidad: ¿mes exonerado?"
    return EXCLUIDA, "Sin estado de factura ni factura de mensualidad"


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

    Los `*_id` son de `PersonaVentas`; nulos si la venta no trae la columna o
    su literal no esta en el directorio (y, en el coordinador de UN, si el
    supervisor no tiene uno asignado).
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

    **Cada persona cobra una venta una sola vez, con la regla de su cargo**,
    ocupe las columnas que ocupe. Un coordinador de oficina o de UN puede ser
    el `Medio` (venta propia) o el supervisor de la venta, y la oficina suele
    ser a la vez `Medio` y `Vendedor`: quien vendio cobra la propia y nada mas;
    los demas, una venta de equipo cada uno.

    >>> cond = {"monto_equipo": 2.5, "monto_directa": 4, "monto_directa_un": 4,
    ...         "tramos_asesor": validar_tramos_asesor([{"desde": 0, "monto": 5, "descontar": 0}]),
    ...         "tramos_un": validar_tramos_un([{"desde_pct": None, "monto": 2}])}
    >>> cargos = {1: "asesor", 7: "coord_un", 9: "coord_oficina"}

    El coordinador de UN como supervisor de la venta, y como su coordinador:

    >>> p = calcular_pagos([Venta("A", False, 0, None, 1, 7, 9, 7)], cargos, cond, {}, {7: 1.0})
    >>> p[1].ventas_propias, p[7].ventas_equipo, p[9].ventas_equipo
    (1, 1, 1)

    La oficina como `Medio` y `Vendedor`:

    >>> p = calcular_pagos([Venta("B", False, 0, None, 9, None, 9, None)], cargos, cond, {9: 100}, {})
    >>> p[9].ventas_propias, p[9].ventas_equipo, p[9].neto
    (1, 0, 4.0)
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
        superiores = {venta.supervisor_id, venta.coord_oficina_id, venta.coord_un_id} - {None, venta.medio_id}
        for superior in superiores:
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
