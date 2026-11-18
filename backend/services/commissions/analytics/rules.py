"""Las reglas de pago, como funciones puras.

Nada aqui lee la base de datos: recibe las ventas ya clasificadas y con sus
personas resueltas (`calculation.py`) y las condiciones vigentes, y devuelve lo
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
BILLED = "facturado por completo"
TO_INVOICE = "por facturar"
NOTHING_TO_INVOICE = frozenset({"nada que facturar", "nada por facturar"})

# `Estado` y `Estado del pago` de una factura, normalizados.
INVOICE_DRAFT = "borrador"
INVOICE_CANCELLED = "cancelado"
PAYMENT_REVERSED = "revertido"
# «Pagado parcialmente» no cuenta: la mensualidad tiene que estar pagada entera.
VALID_PAYMENTS = frozenset({"pagado", "en proceso de pago"})

# `Estado de la Suscripción` de las que aun no son un servicio: una cotizacion
# no se vendio y una instalacion no termino. No cuentan nunca.
NO_SERVICE_STATES = frozenset({"cotizacion", "instalacion"})


def one_month_later(day: date) -> date:
    """El mismo dia del mes siguiente, recortado al ultimo si ese mes es mas corto.

    >>> un_mes_despues(date(2026, 8, 31)), un_mes_despues(date(2026, 12, 15))
    (datetime.date(2026, 9, 30), datetime.date(2027, 1, 15))
    """
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def cancelled_within_first_month(installed: date | None, cancelled: date | None) -> bool:
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
    return installed is not None and cancelled is not None and cancelled < one_month_later(installed)

VALID = "valida"
UNPAID = "no_pagada"
REVIEW = "revision"
EXCLUDED = "excluida"
# Instalada en los dias promocionales del mes sin adelantar la mensualidad: su
# comision es del periodo siguiente, y en este solo se informa.
DEFERRED = "diferida"

# Las decisiones a mano (`RevisionComision.decision`). Las dos primeras
# resuelven una venta en revision; las otras dos, en el primer periodo, si una
# instalacion de los dias promocionales del mes anterior ya se cobro en el.
COUNT = "contar"
DONT_COUNT = "no_contar"
ALREADY_PAID = "ya_pagada"
NORMAL = "normal"

# Lo que le paso a la primera mensualidad (`situation`).
PAID = "pagada"
INVOICE_UNPAID = "impaga"
IN_DRAFT = "borrador"
CANCELLED = "cancelada"
NO_INVOICE = "sin_factura"

# Una mensualidad cancelada a los 20 dias o mas de emitida, sin otra despues,
# es un cliente que no pago: no cuenta. Antes de eso pudo ser un error de
# facturacion o una exoneracion, y se revisa.
CANCELLATION_DAYS = 20

PLAN_CHANGE_REASON = "Por facturar con cambio de plan: la primera mensualidad, de otro plan, está pagada"


@dataclass(frozen=True)
class Invoice:
    """Una factura de la suscripcion, tal y como la lee `invoices.read_invoices`.

    `plan` es el plan de catalogo de sus lineas; vacio si no factura ninguno
    (la de instalacion, la del router), y entonces no es una mensualidad.
    `creado_el` es texto ISO (`YYYY-MM-DD HH:MM:SS`), vacio si no se supo leer;
    `fecha_pago` y `actualizado_el` tambien, y vacias si el export no las traia.
    """

    number: str
    state: str
    payment_state: str
    created_at: str
    plan: str
    paid_date: str = ""
    updated_at: str = ""


def _cancelled(invoice: Invoice) -> bool:
    return normalize_text(invoice.state) == INVOICE_CANCELLED


def _reversed(invoice: Invoice) -> bool:
    return normalize_text(invoice.payment_state) == PAYMENT_REVERSED


def first_installment(invoices: list[Invoice], until: date | None = None) -> Invoice | None:
    """La factura que dice si se pago la primera mensualidad.

    Con `hasta` (el corte del periodo) solo se miran las facturas creadas hasta
    ese dia: lo que Odoo emitio despues no existia cuando se saco el informe y
    no rescata una venta de este periodo.

    Es la primera factura con un plan, por `Creado el`, **sin contar las
    canceladas**: una cancelada no es una mensualidad, sea del mes que sea. Si
    todas estan canceladas se devuelve la ultima, y `days_until_cancel`
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
    limit = until.isoformat() if until else None
    installments = sorted(
        (f for f in invoices if f.plan and not (limit and f.created_at and f.created_at[:10] > limit)),
        key=lambda f: (f.created_at == "", f.created_at, f.number),
    )
    if not installments:
        return None
    current = [f for f in installments if not _cancelled(f)]
    if not current:
        return installments[-1]
    chosen = current[0]
    month = chosen.created_at[:7]
    for next_row in current[1:]:
        if not month or next_row.created_at[:7] != month or not _reversed(chosen):
            break
        chosen = next_row
    return chosen


def days_until_cancel(invoice: Invoice | None) -> int | None:
    """Dias entre el `Creado el` de una factura y su «Última actualización el».

    En una cancelada, la ultima actualizacion es la cancelacion. `None` si
    falta alguna de las dos fechas: entonces no se puede medir.

    >>> dias_hasta_cancelar(Factura("F", "Cancelado", "", "2026-09-05 10:00:00", "P", "", "2026-09-30 08:00:00"))
    25
    >>> dias_hasta_cancelar(Factura("F", "Cancelado", "", "2026-09-05", "P")) is None
    True
    """
    if invoice is None or not invoice.created_at or not invoice.updated_at:
        return None
    try:
        created = date.fromisoformat(invoice.created_at[:10])
        updated = date.fromisoformat(invoice.updated_at[:10])
    except ValueError:
        return None
    return (updated - created).days


def situation(invoice: Invoice | None) -> str:
    """`PAID`, `INVOICE_UNPAID`, `IN_DRAFT`, `CANCELLED` o `NO_INVOICE`.

    Solo cuenta como pagada una factura con el pago «Pagado» o «En proceso de
    pago»: «Pagado parcialmente», «Revertido» y «Sin pagar» no. **Una factura en
    borrador con uno de esos pagos tambien cuenta**: el pago manda sobre el
    estado del documento (el cliente ya pago, aunque Odoo no la haya
    registrado). En borrador y sin ese pago es `IN_DRAFT`.

    >>> f = lambda estado, pago: Factura("F", estado, pago, "2026-09-05", "Plan")
    >>> situacion(f("Borrador", "Pagado")), situacion(f("Borrador", "En proceso de pago"))
    ('pagada', 'pagada')
    >>> situacion(f("Borrador", "Sin pagar")), situacion(f("Borrador", "Pagado parcialmente"))
    ('borrador', 'borrador')
    >>> situacion(f("Cancelado", "Pagado")), situacion(f("Registrado", "Pagado"))
    ('cancelada', 'pagada')
    """
    if invoice is None:
        return NO_INVOICE
    state = normalize_text(invoice.state)
    if state == INVOICE_CANCELLED:
        return CANCELLED
    if normalize_text(invoice.payment_state) in VALID_PAYMENTS:
        return PAID
    return IN_DRAFT if state == INVOICE_DRAFT else INVOICE_UNPAID


def classify(
    invoice_state: str,
    invoice: Invoice | None,
    subscription_plan: str = "",
    free: bool = False,
    decision: str | None = None,
    subscription_state: str = "",
    cancelled_without_month: bool = False,
    cutoff: date | None = None,
) -> tuple[str, str]:
    """`(clasificacion, motivo)` de una venta del periodo.

    `factura` es su primera mensualidad (`first_installment`), `estado_factura`
    el de la suscripcion y `plan_suscripcion` su plan de hoy si esta en el
    catalogo. Que la suscripcion siga hoy en progreso no importa: lo que paga
    la comision es la primera mensualidad.

    - Una suscripcion en **Cotización** o **Instalación** no cuenta nunca, ni
      con una decision manual: todavia no es un servicio. Tampoco una que se
      **cancelo sin cumplir un mes** activa (`cancelled_within_first_month`).
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
      `CANCELLATION_DAYS` dias o mas de emitida, excluida (el cliente no pago);
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
    if normalize_text(subscription_state) in NO_SERVICE_STATES:
        return EXCLUDED, f"En «{subscription_state}»: todavía no es un servicio"
    if cancelled_without_month:
        return EXCLUDED, "Se canceló sin cumplir un mes activa"
    if decision == "contar":
        return VALID, "Decisión manual: contarla"
    if decision == "no_contar":
        return EXCLUDED, "Decisión manual: no contarla"

    payment = situation(invoice)
    state = normalize_text(invoice_state)
    paid_late = payment == PAID and cutoff is not None and not paid_until(invoice, cutoff)
    if paid_late:
        payment = INVOICE_UNPAID

    if free:
        if payment == PAID:
            return REVIEW, "Pasó a plan gratuito, pero su primera mensualidad está pagada"
        return EXCLUDED, "Pasó a plan gratuito: no paga comisión"

    if payment == PAID:
        plan_change = subscription_plan and normalize_text(subscription_plan) != normalize_text(invoice.plan)
        if state == TO_INVOICE and plan_change:
            return VALID, PLAN_CHANGE_REASON
        if normalize_text(invoice.state) == INVOICE_DRAFT:
            return VALID, "Primera mensualidad pagada (la factura sigue en borrador)"
        return VALID, "Primera mensualidad pagada"
    if paid_late:
        day = payment_date(invoice)[0]
        when = f" el {date.fromisoformat(day).strftime('%d/%m/%Y')}" if day else ""
        return UNPAID, f"Primera mensualidad pagada{when}, después del corte del {cutoff.strftime('%d/%m/%Y')}"
    if payment == INVOICE_UNPAID:
        return UNPAID, f"Primera mensualidad «{invoice.payment_state or 'sin estado de pago'}»"
    if payment == IN_DRAFT:
        return UNPAID, "Primera mensualidad en borrador: todavía no se emitió"

    if state in NOTHING_TO_INVOICE:
        return EXCLUDED, "Nada que facturar"
    if payment == CANCELLED:
        days = days_until_cancel(invoice)
        if days is None:
            return REVIEW, "Todas sus mensualidades están canceladas y no se sabe cuándo se canceló la última"
        if days >= CANCELLATION_DAYS:
            return EXCLUDED, f"Su mensualidad se canceló a los {days} días de emitida y no tiene otra"
        return REVIEW, f"Su mensualidad se canceló a los {days} días de emitida (menos de {CANCELLATION_DAYS}) y no tiene otra"
    if state in (BILLED, TO_INVOICE):
        return UNPAID, f"«{invoice_state}» sin factura de mensualidad: sin factura no se paga"
    return EXCLUDED, "Sin estado de factura ni factura de mensualidad"


# --- Tramos ----------------------------------------------------------------------

def validate_advisor_tiers(tiers: Any) -> list[dict[str, float]]:
    """Los tramos del asesor, comprobados y ordenados. Levanta `ValueError`.

    Cada tramo vale desde `desde` ventas hasta el siguiente: el primero tiene
    que empezar en 0 y no puede haber dos con el mismo inicio. `descontar` no
    puede pasar de `desde`, o el tramo pagaria ventas negativas.
    """
    if not isinstance(tiers, list) or not tiers:
        raise ValueError("Los tramos del asesor no pueden quedar vacíos.")
    clean = []
    for tier in tiers:
        try:
            since = int(tier["desde"])
            amount = float(tier["monto"])
            discount = int(tier.get("descontar") or 0)
        except (KeyError, TypeError, ValueError):
            raise ValueError("Cada tramo del asesor necesita «desde», «monto» y «descontar» numéricos.") from None
        if since < 0 or amount < 0 or discount < 0:
            raise ValueError("Los tramos del asesor no admiten valores negativos.")
        if discount > since:
            raise ValueError(f"El tramo desde {since} ventas no puede descontar {discount}.")
        clean.append({"desde": since, "monto": amount, "descontar": discount})
    clean.sort(key=lambda t: t["desde"])
    if clean[0]["desde"] != 0:
        raise ValueError("El primer tramo del asesor tiene que empezar en 0 ventas.")
    if len({t["desde"] for t in clean}) != len(clean):
        raise ValueError("Dos tramos del asesor empiezan en la misma cantidad de ventas.")
    return clean


def advisor_tier(sales: int, tiers: list[dict[str, float]]) -> dict[str, float]:
    """El tramo en el que cae una cantidad de ventas (el ultimo que empieza en o antes)."""
    chosen = tiers[0]
    for tier in tiers:
        if tier["desde"] <= sales:
            chosen = tier
    return chosen


def advisor_payment(sales: int, tiers: list[dict[str, float]]) -> tuple[dict[str, float], int, float]:
    """`(tramo, ventas pagadas, monto)` de un asesor con `ventas` residenciales.

    >>> T = validar_tramos_asesor([{"desde": 0, "monto": 0, "descontar": 0},
    ...     {"desde": 6, "monto": 5, "descontar": 5}, {"desde": 20, "monto": 6, "descontar": 0},
    ...     {"desde": 21, "monto": 7, "descontar": 0}, {"desde": 26, "monto": 8, "descontar": 0}])
    >>> [pago_asesor(n, T)[2] for n in (5, 6, 19, 20, 21, 25, 26)]
    [0.0, 5.0, 70.0, 120.0, 147.0, 175.0, 208.0]
    """
    tier = advisor_tier(sales, tiers)
    paid = max(0, sales - int(tier["descontar"]))
    return tier, paid, round(paid * float(tier["monto"]), 2)


def goal_bonus(sales: int, tiers: list[dict[str, float]]) -> tuple[dict[str, float] | None, float]:
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
    chosen = None
    for tier in sorted(tiers, key=lambda t: t["desde"]):
        if tier["desde"] <= sales:
            chosen = tier
    return chosen, round(float(chosen["monto"]), 2) if chosen else 0.0


# --- El periodo ---------------------------------------------------------------------

# En que parte de la ventana de un periodo se instalo una venta (`tier`).
PREVIOUS_PROMO = "promo_anterior"
REGULAR = "regular"
PROMO = "promo"
MANUAL = "manual"


def tier(installed: date, start: date, promo_start: date) -> str:
    """En que parte de la ventana de un periodo cae una instalacion.

    La ventana va del inicio de los dias promocionales del mes anterior al
    ultimo dia del mes, en tres trozos:

    - `PREVIOUS_PROMO`: los dias promocionales del mes anterior. Su comision
      toca en este periodo, salvo que el cliente adelantara la mensualidad y ya
      se cobrara en el anterior.
    - `REGULAR`: del dia 1 al anterior a los dias promocionales del mes.
    - `PROMO`: los dias promocionales del mes. Su comision toca en el periodo
      siguiente; solo cuenta en este si el cliente adelanto el pago.

    >>> [tramo(date(2026, m, d), date(2026, 8, 25), date(2026, 9, 25)) for m, d in ((8, 31), (9, 1), (9, 24), (9, 25))]
    ['promo_anterior', 'regular', 'regular', 'promo']
    """
    if installed < promo_start.replace(day=1):
        return PREVIOUS_PROMO
    return PROMO if installed >= promo_start else REGULAR


def payment_date(invoice: Invoice | None) -> tuple[str, str]:
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
    if situation(invoice) != PAID:
        return "", ""
    for value, source in ((invoice.paid_date, "pago"), (invoice.updated_at, "actualizacion"), (invoice.created_at, "creacion")):
        if value:
            return value[:10], source
    return "", ""


def paid_until(invoice: Invoice | None, cutoff: date) -> bool:
    """Si la factura estaba pagada el dia `corte` (incluido), segun `payment_date`.

    >>> f = Factura("F", "Registrado", "Pagado", "2026-10-01", "P", "2026-10-07")
    >>> pagada_hasta(f, date(2026, 10, 22)), pagada_hasta(f, date(2026, 10, 6))
    (True, False)
    """
    day, _ = payment_date(invoice)
    return bool(day) and day <= cutoff.isoformat()
