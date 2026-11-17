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
- **Supervisor**: 2.5$ por cada venta residencial de su equipo y 4$ por cada
  una propia, y el total por el % de cumplimiento de su objetivo, con tope en
  100%.
- **Coordinador de oficina**: la misma regla con sus propias tarifas: 2.5$ por
  cada venta de su equipo y 2.5$ tambien por cada una propia.
- **Coordinador de unidad de negocio**: por cada venta residencial de su
  equipo, el monto del tramo del crecimiento de sus unidades; 4$ por cada una
  propia. Sin objetivo.
- **Bono por meta del asesor**: ademas de los tramos, un monto unico segun
  cuantas ventas residenciales hizo y el estado en que vende (Aragua: de 15 a
  19, 50$; ... Carabobo: desde 30). Un estado sin bonos no paga ninguno.

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
from dataclasses import dataclass
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
# «Pagado parcialmente» no cuenta: la mensualidad tiene que estar pagada entera.
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
# Instalada en los dias promocionales del mes sin adelantar la mensualidad: su
# comision es del periodo siguiente, y en este solo se informa.
DIFERIDA = "diferida"

# Las decisiones a mano (`RevisionComision.decision`). Las dos primeras
# resuelven una venta en revision; las otras dos, en el primer periodo, si una
# instalacion de los dias promocionales del mes anterior ya se cobro en el.
CONTAR = "contar"
NO_CONTAR = "no_contar"
YA_PAGADA = "ya_pagada"
NORMAL = "normal"

# Lo que le paso a la primera mensualidad (`situacion`).
PAGADA = "pagada"
IMPAGA = "impaga"
EN_BORRADOR = "borrador"
CANCELADA = "cancelada"
SIN_FACTURA = "sin_factura"

# Una mensualidad cancelada a los 20 dias o mas de emitida, sin otra despues,
# es un cliente que no pago: no cuenta. Antes de eso pudo ser un error de
# facturacion o una exoneracion, y se revisa.
DIAS_CANCELACION = 20

MOTIVO_CAMBIO_PLAN = "Por facturar con cambio de plan: la primera mensualidad, de otro plan, está pagada"


@dataclass(frozen=True)
class Factura:
    """Una factura de la suscripcion, tal y como la lee `facturas.leer_facturas`.

    `plan` es el plan de catalogo de sus lineas; vacio si no factura ninguno
    (la de instalacion, la del router), y entonces no es una mensualidad.
    `creado_el` es texto ISO (`YYYY-MM-DD HH:MM:SS`), vacio si no se supo leer;
    `fecha_pago` y `actualizado_el` tambien, y vacias si el export no las traia.
    """

    numero: str
    estado: str
    estado_pago: str
    creado_el: str
    plan: str
    fecha_pago: str = ""
    actualizado_el: str = ""


def _cancelada(factura: Factura) -> bool:
    return normalize_text(factura.estado) == FACTURA_CANCELADA


def _revertida(factura: Factura) -> bool:
    return normalize_text(factura.estado_pago) == PAGO_REVERTIDO


def primera_mensualidad(facturas: list[Factura], hasta: date | None = None) -> Factura | None:
    """La factura que dice si se pago la primera mensualidad.

    Con `hasta` (el corte del periodo) solo se miran las facturas creadas hasta
    ese dia: lo que Odoo emitio despues no existia cuando se saco el informe y
    no rescata una venta de este periodo.

    Es la primera factura con un plan, por `Creado el`, **sin contar las
    canceladas**: una cancelada no es una mensualidad, sea del mes que sea. Si
    todas estan canceladas se devuelve la ultima, y `dias_hasta_cancelar`
    decide si la venta se excluye o va a revision.

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
    >>> primera_mensualidad([f("A", "2026-09-05", estado="Cancelado"), f("B", "2026-11-01")], hasta=date(2026, 10, 22)).numero
    'A'
    >>> primera_mensualidad([f("B", "2026-11-01")], hasta=date(2026, 10, 22)) is None
    True
    """
    limite = hasta.isoformat() if hasta else None
    mensualidades = sorted(
        (f for f in facturas if f.plan and not (limite and f.creado_el and f.creado_el[:10] > limite)),
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


def dias_hasta_cancelar(factura: Factura | None) -> int | None:
    """Dias entre el `Creado el` de una factura y su «Última actualización el».

    En una cancelada, la ultima actualizacion es la cancelacion. `None` si
    falta alguna de las dos fechas: entonces no se puede medir.

    >>> dias_hasta_cancelar(Factura("F", "Cancelado", "", "2026-09-05 10:00:00", "P", "", "2026-09-30 08:00:00"))
    25
    >>> dias_hasta_cancelar(Factura("F", "Cancelado", "", "2026-09-05", "P")) is None
    True
    """
    if factura is None or not factura.creado_el or not factura.actualizado_el:
        return None
    try:
        creada = date.fromisoformat(factura.creado_el[:10])
        actualizada = date.fromisoformat(factura.actualizado_el[:10])
    except ValueError:
        return None
    return (actualizada - creada).days


def situacion(factura: Factura | None) -> str:
    """`PAGADA`, `IMPAGA`, `EN_BORRADOR`, `CANCELADA` o `SIN_FACTURA`.

    Solo cuenta como pagada una factura con el pago «Pagado» o «En proceso de
    pago»: «Pagado parcialmente», «Revertido» y «Sin pagar» no. **Una factura en
    borrador con uno de esos pagos tambien cuenta**: el pago manda sobre el
    estado del documento (el cliente ya pago, aunque Odoo no la haya
    registrado). En borrador y sin ese pago es `EN_BORRADOR`.

    >>> f = lambda estado, pago: Factura("F", estado, pago, "2026-09-05", "Plan")
    >>> situacion(f("Borrador", "Pagado")), situacion(f("Borrador", "En proceso de pago"))
    ('pagada', 'pagada')
    >>> situacion(f("Borrador", "Sin pagar")), situacion(f("Borrador", "Pagado parcialmente"))
    ('borrador', 'borrador')
    >>> situacion(f("Cancelado", "Pagado")), situacion(f("Registrado", "Pagado"))
    ('cancelada', 'pagada')
    """
    if factura is None:
        return SIN_FACTURA
    estado = normalize_text(factura.estado)
    if estado == FACTURA_CANCELADA:
        return CANCELADA
    if normalize_text(factura.estado_pago) in PAGOS_VALIDOS:
        return PAGADA
    return EN_BORRADOR if estado == FACTURA_BORRADOR else IMPAGA


def clasificar(
    estado_factura: str,
    factura: Factura | None,
    plan_suscripcion: str = "",
    gratuita: bool = False,
    decision: str | None = None,
    estado_suscripcion: str = "",
    cancelada_sin_mes: bool = False,
    corte: date | None = None,
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
    - Con `corte`, una mensualidad **pagada despues del corte** es como si no
      se hubiera pagado: lo que interesa es que pagara en la ventana del periodo.
    - **Mensualidad pagada** (entera; una factura **en borrador** con el pago
      «Pagado» o «En proceso de pago» cuenta): valida, este como este la
      facturacion de la suscripcion: la factura ya se pago. Si la suscripcion dice «Por
      facturar» y la factura es de otro plan, se apunta como cambio de plan
      (Odoo factura el nuevo y deja la venta por facturar).
    - **Sin pagar** (o revertida) o **en borrador**: no pagada.
    - **Todas sus mensualidades canceladas**: si la ultima se cancelo a los
      `DIAS_CANCELACION` dias o mas de emitida, excluida (el cliente no pago);
      antes de eso, o si no se puede medir, se revisa. Salvo «Nada que facturar».
    - **Ninguna mensualidad**, con la suscripcion «Facturado por completo» o
      «Por facturar»: no pagada. Sin factura no se paga.

    >>> f = lambda pago="Pagado", estado="Registrado", plan="Plan A", act="": Factura("F1", estado, pago, "2026-09-05", plan, "", act)
    >>> clasificar("Facturado por completo", f())[0]
    'valida'
    >>> clasificar("Facturado por completo", f("Pagado", estado="Borrador"))
    ('valida', 'Primera mensualidad pagada (la factura sigue en borrador)')
    >>> clasificar("Facturado por completo", f("Sin pagar", estado="Borrador"))[0]
    'no_pagada'
    >>> clasificar("Facturado por completo", f("Pagado parcialmente"))[0]
    'no_pagada'
    >>> clasificar("Facturado por completo", f("Sin pagar"))[0]
    'no_pagada'
    >>> clasificar("Facturado por completo", f(estado="Cancelado", act="2026-09-25"))[0]
    'excluida'
    >>> clasificar("Facturado por completo", f(estado="Cancelado", act="2026-09-24"))[0]
    'revision'
    >>> clasificar("Facturado por completo", f(estado="Cancelado"))[0]
    'revision'
    >>> clasificar("Facturado por completo", None)[0]
    'no_pagada'
    >>> clasificar("Por facturar", f(), "Plan A")[0]
    'valida'
    >>> clasificar("Por facturar", f(), "Plan B")[0]
    'valida'
    >>> clasificar("Por facturar", None)[0]
    'no_pagada'
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
    >>> g = lambda pago: Factura("F1", "Registrado", "Pagado", "2026-09-05", "Plan A", pago)
    >>> clasificar("Facturado por completo", g("2026-10-22"), corte=date(2026, 10, 22))[0]
    'valida'
    >>> clasificar("Facturado por completo", g("2026-10-23"), corte=date(2026, 10, 22))
    ('no_pagada', 'Primera mensualidad pagada el 23/10/2026, después del corte del 22/10/2026')
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
    pagada_tarde = pago == PAGADA and corte is not None and not pagada_hasta(factura, corte)
    if pagada_tarde:
        pago = IMPAGA

    if gratuita:
        if pago == PAGADA:
            return REVISION, "Pasó a plan gratuito, pero su primera mensualidad está pagada"
        return EXCLUIDA, "Pasó a plan gratuito: no paga comisión"

    if pago == PAGADA:
        cambio_plan = plan_suscripcion and normalize_text(plan_suscripcion) != normalize_text(factura.plan)
        if estado == POR_FACTURAR and cambio_plan:
            return VALIDA, MOTIVO_CAMBIO_PLAN
        if normalize_text(factura.estado) == FACTURA_BORRADOR:
            return VALIDA, "Primera mensualidad pagada (la factura sigue en borrador)"
        return VALIDA, "Primera mensualidad pagada"
    if pagada_tarde:
        dia = fecha_del_pago(factura)[0]
        cuando = f" el {date.fromisoformat(dia).strftime('%d/%m/%Y')}" if dia else ""
        return NO_PAGADA, f"Primera mensualidad pagada{cuando}, después del corte del {corte.strftime('%d/%m/%Y')}"
    if pago == IMPAGA:
        return NO_PAGADA, f"Primera mensualidad «{factura.estado_pago or 'sin estado de pago'}»"
    if pago == EN_BORRADOR:
        return NO_PAGADA, "Primera mensualidad en borrador: todavía no se emitió"

    if estado in NADA_POR_FACTURAR:
        return EXCLUIDA, "Nada que facturar"
    if pago == CANCELADA:
        dias = dias_hasta_cancelar(factura)
        if dias is None:
            return REVISION, "Todas sus mensualidades están canceladas y no se sabe cuándo se canceló la última"
        if dias >= DIAS_CANCELACION:
            return EXCLUIDA, f"Su mensualidad se canceló a los {dias} días de emitida y no tiene otra"
        return REVISION, f"Su mensualidad se canceló a los {dias} días de emitida (menos de {DIAS_CANCELACION}) y no tiene otra"
    if estado in (FACTURADO, POR_FACTURAR):
        return NO_PAGADA, f"«{estado_factura}» sin factura de mensualidad: sin factura no se paga"
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


def bono_meta(ventas: int, tramos: list[dict[str, float]]) -> tuple[dict[str, float] | None, float]:
    """`(tramo, monto)` del bono por meta de un asesor con `ventas` residenciales.

    El tramo es el ultimo que empieza en o antes de `ventas`; por debajo del
    primero no hay bono (`None`, 0). La politica dice «mas de 50» despues de
    «40 a 49»: aqui 50 ya cobra el ultimo, porque el tramo empieza en el.

    >>> ARAGUA = [{"desde": 15, "monto": 50}, {"desde": 20, "monto": 80}, {"desde": 30, "monto": 120},
    ...           {"desde": 40, "monto": 200}, {"desde": 50, "monto": 250}]
    >>> [bono_meta(n, ARAGUA)[1] for n in (14, 15, 19, 20, 29, 30, 39, 40, 49, 50, 80)]
    [0.0, 50.0, 50.0, 80.0, 80.0, 120.0, 120.0, 200.0, 200.0, 250.0, 250.0]
    >>> CARABOBO = [{"desde": 30, "monto": 120}, {"desde": 40, "monto": 200}, {"desde": 50, "monto": 250}]
    >>> [bono_meta(n, CARABOBO)[1] for n in (29, 30, 45, 51)]
    [0.0, 120.0, 200.0, 250.0]
    """
    elegido = None
    for tramo in sorted(tramos, key=lambda t: t["desde"]):
        if tramo["desde"] <= ventas:
            elegido = tramo
    return elegido, round(float(elegido["monto"]), 2) if elegido else 0.0


# --- El periodo ---------------------------------------------------------------------

# En que parte de la ventana de un periodo se instalo una venta (`tramo`).
PROMO_ANTERIOR = "promo_anterior"
REGULAR = "regular"
PROMO = "promo"
MANUAL = "manual"


def tramo(instalada: date, inicio: date, inicio_promo: date) -> str:
    """En que parte de la ventana de un periodo cae una instalacion.

    La ventana va del inicio de los dias promocionales del mes anterior al
    ultimo dia del mes, en tres trozos:

    - `PROMO_ANTERIOR`: los dias promocionales del mes anterior. Su comision
      toca en este periodo, salvo que el cliente adelantara la mensualidad y ya
      se cobrara en el anterior.
    - `REGULAR`: del dia 1 al anterior a los dias promocionales del mes.
    - `PROMO`: los dias promocionales del mes. Su comision toca en el periodo
      siguiente; solo cuenta en este si el cliente adelanto el pago.

    >>> [tramo(date(2026, m, d), date(2026, 8, 25), date(2026, 9, 25)) for m, d in ((8, 31), (9, 1), (9, 24), (9, 25))]
    ['promo_anterior', 'regular', 'regular', 'promo']
    """
    if instalada < inicio_promo.replace(day=1):
        return PROMO_ANTERIOR
    return PROMO if instalada >= inicio_promo else REGULAR


def fecha_del_pago(factura: Factura | None) -> tuple[str, str]:
    """`(dia, fuente)`: hasta cuando se sabe que estaba pagada una factura pagada.

    La «Fecha del último pago» si el export la trae. Si no, la «Última
    actualización el»: pagarla la actualiza, asi que el pago no es posterior a
    ella. Y si tampoco, el «Creado el», que es solo una aproximacion (el pago
    pudo llegar despues) y por eso se avisa. Vacio si no esta pagada.

    >>> f = lambda pago="", act="": Factura("F", "Registrado", "Pagado", "2026-10-01 08:00:00", "P", pago, act)
    >>> fecha_del_pago(f("2026-10-07"))
    ('2026-10-07', 'pago')
    >>> fecha_del_pago(f(act="2026-10-09 10:00:00"))
    ('2026-10-09', 'actualizacion')
    >>> fecha_del_pago(f())
    ('2026-10-01', 'creacion')
    >>> fecha_del_pago(Factura("F", "Registrado", "Sin pagar", "2026-10-01", "P"))
    ('', '')
    """
    if situacion(factura) != PAGADA:
        return "", ""
    for valor, fuente in ((factura.fecha_pago, "pago"), (factura.actualizado_el, "actualizacion"), (factura.creado_el, "creacion")):
        if valor:
            return valor[:10], fuente
    return "", ""


def pagada_hasta(factura: Factura | None, corte: date) -> bool:
    """Si la factura estaba pagada el dia `corte` (incluido), segun `fecha_del_pago`.

    >>> f = Factura("F", "Registrado", "Pagado", "2026-10-01", "P", "2026-10-07")
    >>> pagada_hasta(f, date(2026, 10, 22)), pagada_hasta(f, date(2026, 10, 6))
    (True, False)
    """
    dia, _ = fecha_del_pago(factura)
    return bool(dia) and dia <= corte.isoformat()
