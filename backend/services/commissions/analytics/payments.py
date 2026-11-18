"""Lo que cobra cada persona por las ventas validas del periodo, segun su equipo y su rol.

Es la parte de las comisiones que no mira facturas ni fechas —eso decide que
ventas cuentan (`rules.classify`)— sino **cuanto se paga por una venta que
ya cuenta**. Es pura: recibe las ventas con sus personas resueltas, la
estructura de cada equipo, las condiciones de cada rol y los indicadores ya
calculados, y devuelve un `Payment` por persona y equipo. Nada de base de datos.

Cada rol de cada equipo lleva las piezas de pago que declara
`catalogos.equipos.PIECES_BY_ROLE`; aqui estan implementadas una a una:

- Una persona cobra cada venta **una sola vez, con la regla de su rol**: el
  vendedor (`Medio`) cobra la venta propia y nada mas; cualquier otro que tenga
  la venta en su alcance, una de equipo. El alcance de la venta de equipo
  (`equipo.alcance`) dice por donde le llega: `supervisados` (es el supervisor de
  la venta), `oficina` (es su `Vendedor`), `unidades` (la venta es de una unidad
  de negocio que lleva) o `equipo_completo` (cualquier venta de su equipo).
- La **PYME** la cobra solo quien la vendio, un % del precio del plan, y no
  cuenta para tramos, equipos ni factor.
- Neto = (propias + equipo) × factor de cumplimiento + PYME + bonos. Los bonos
  no se multiplican por el factor.
- Un equipo es el del `Medio` de la venta (o, si no esta registrado, el de su
  supervisor): ahi se buscan las membresias de todos los demas.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .rules import advisor_payment, goal_bonus

Key = tuple[int, str]  # (persona_id, equipo)

ADVISOR_ROLES = ("asesor", "telemarketing")


@dataclass
class Member:
    """El papel de una persona en un equipo, con lo que el motor necesita saber de el."""

    person_id: int
    team: str
    role: str
    # Las unidades de negocio que lleva (`unidades` de la membresia).
    units: tuple[int, ...] = ()

    @property
    def key(self) -> Key:
        return (self.person_id, self.team)


@dataclass
class Sale:
    """Una venta valida con las personas que cobran por ella ya resueltas.

    Los ids son de `PersonaVentas`; nulos si la venta no trae la columna o su
    literal no esta en el directorio. `equipo` es el slug del equipo de la venta
    (vacio si no se pudo saber, y entonces no cobra nadie). `unidad_ids` son las
    unidades de negocio a las que pertenece, por la cadena supervisor → su
    superior; `es_oficina`, si quien vendio es una coordinadora de oficina.
    """

    order: str
    pyme: bool
    price: float
    pct_pyme: float | None
    team: str
    channel_id: int | None = None
    supervisor_id: int | None = None
    office_coord_id: int | None = None
    unit_ids: tuple[int, ...] = ()
    is_office: bool = False


@dataclass
class Indicators:
    """Los porcentajes que condicionan el pago, ya resueltos (manual o calculado)."""

    # El % de cumplimiento que multiplica a quien lleva `factor`, por membresia.
    factors: dict[Key, float | None] = field(default_factory=dict)
    # El crecimiento de la unidad de cada coordinador de UN (para su escalon).
    growths: dict[Key, float | None] = field(default_factory=dict)
    # El churn bruto de la unidad de cada coordinador de UN (para su bono).
    churns: dict[Key, float | None] = field(default_factory=dict)
    # El % de ingresos de cada unidad (para el bono del jefe de UN).
    unit_inflows: dict[int, float | None] = field(default_factory=dict)
    # El % de ventas de toda la empresa (para el bono de la administradora).
    company_pct: float | None = None


@dataclass
class Payment:
    """Lo que cobra una persona en un equipo en el periodo, con el desglose que lo explica."""

    person_id: int
    team: str
    role: str
    own_sales: int = 0
    team_sales: int = 0
    sme_sales: int = 0
    sme_amount: float = 0.0
    sme_without_pct: int = 0
    own_amount: float = 0.0
    team_amount: float = 0.0
    # Lo que se multiplica por el factor: propias + equipo. La PYME queda fuera.
    gross: float = 0.0
    factor_pct: float | None = None
    # Los bonos, sumados; cada uno con su concepto en `detalle["bonos"]`.
    bonus: float = 0.0
    net: float = 0.0
    detail: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)



# Las claves con que un pago sale en el informe y se guarda en la copia del cierre.
PAYMENT_KEYS = {
    "person_id": "persona_id", "team": "equipo", "role": "rol",
    "own_sales": "ventas_propias", "team_sales": "ventas_equipo", "sme_sales": "ventas_pyme",
    "sme_amount": "monto_pyme", "sme_without_pct": "pyme_sin_porcentaje",
    "own_amount": "monto_propias", "team_amount": "monto_equipo", "gross": "bruto",
    "factor_pct": "factor_pct", "bonus": "bono", "net": "neto", "detail": "detalle",
    "warnings": "avisos",
}


def payment_row(payment: Payment) -> dict[str, Any]:
    """El pago como fila del informe, con sus claves guardadas."""
    return {PAYMENT_KEYS[k]: v for k, v in asdict(payment).items()}


def _per_sale(piece: dict[str, Any] | None, sale: Sale) -> float:
    """Lo que paga una pieza `propia`/`equipo` por una venta: un monto, o un % del plan."""
    if not piece:
        return 0.0
    if piece["tipo"] == "pct_plan":
        return sale.price * float(piece["valor"]) / 100
    return float(piece["valor"])


def _step(growth: float, piece: dict[str, Any]) -> float:
    """Lo que cobra el coordinador de UN por venta de equipo segun el crecimiento de su unidad.

    >>> p = {"umbral_pct": 6, "alto": 2, "bajo": 1}
    >>> [_escalon(c, p) for c in (-3, 5.99, 6, 12)]
    [1.0, 1.0, 2.0, 2.0]
    """
    return float(piece["alto"] if growth >= float(piece["umbral_pct"]) else piece["bajo"])


def _reached_tier(sales: float, tiers: list[dict[str, float]]) -> dict[str, float] | None:
    """El ultimo tramo que empieza en o antes de `ventas`; nulo por debajo del primero.

    >>> T = [{"desde": 30, "monto": 20}, {"desde": 40, "monto": 25}, {"desde": 50, "monto": 30}]
    >>> [(_tramo_alcanzado(n, T) or {}).get("monto") for n in (29, 30, 45, 50, 80)]
    [None, 20, 25, 30, 30]
    """
    chosen = None
    for tier in sorted(tiers, key=lambda t: t["desde"]):
        if tier["desde"] <= sales:
            chosen = tier
    return chosen


def bonus_churn(churn: float, tiers: list[dict[str, float]]) -> float:
    """El bono por el churn bruto: el del tramo mas exigente que se cumple (churn <= max).

    >>> T = [{"max": 3, "monto": 100}, {"max": 1.9, "monto": 200}]
    >>> [bono_churn(c, T) for c in (5, 3, 2.5, 1.9, 0.4)]
    [0.0, 100.0, 100.0, 200.0, 200.0]
    """
    fulfilled = [t for t in tiers if churn <= float(t["max"])]
    if not fulfilled:
        return 0.0
    return float(min(fulfilled, key=lambda t: t["max"])["monto"])


def administrator_bonus(pct: float, piece: dict[str, float]) -> float:
    """Menos del 100 %: el monto proporcional (80 % → 80 $); el 100 %: el monto; mas: el excedente.

    >>> P = {"monto": 100, "excedente": 120}
    >>> [bono_administradora(p, P) for p in (80, 99.5, 100, 100.01, 130)]
    [80.0, 99.5, 100.0, 120.0, 120.0]
    """
    if pct > 100:
        return float(piece["excedente"])
    return round(float(piece["monto"]) * max(pct, 0.0) / 100, 2)


def compute_payments(
    sales: list[Sale],
    members: dict[Key, Member],
    conditions: dict[str, dict[str, dict[str, Any]]],
    indicators: Indicators,
) -> list[Payment]:
    """Lo que cobra cada persona, por equipo, por las ventas validas del periodo.

    - `members`: todas las membresias, por (persona, equipo).
    - `condiciones`: `{equipo: {rol: parametros}}`, ya validados y completados
      (`teams.current_parameters`).
    - `indicadores`: los % que piden `factor` y los bonos; nulo es «desconocido»:
      el factor paga como 100 % y lo avisa, el resto de piezas no paga.

    Un supervisor que vende directamente cobra la propia con la tarifa de su rol:

    >>> sup = Miembro(1, "aragua", "supervisor"); ase = Miembro(2, "aragua", "asesor")
    >>> cond = {"aragua": {
    ...     "supervisor": {"propia": {"tipo": "monto", "valor": 4},
    ...                    "equipo": {"tipo": "monto", "valor": 2.5, "alcance": "supervisados", "excluir_oficina": False}},
    ...     "asesor": {"tramos_asesor": [{"desde": 0, "monto": 5, "descontar": 0}]}}}
    >>> M = {sup.clave: sup, ase.clave: ase}
    >>> V = lambda o, medio, sup_id: Venta(o, False, 0, None, "aragua", medio_id=medio, supervisor_id=sup_id)
    >>> r = {p.persona_id: p for p in calcular_pagos([V("a", 1, 1), V("b", 2, 1)], M, cond, Indicadores())}
    >>> r[1].ventas_propias, r[1].ventas_equipo, r[1].neto
    (1, 1, 6.5)
    >>> r[2].ventas_propias, r[2].neto
    (1, 5.0)

    El bono del supervisor es por cada asesor de su equipo que llega al tramo
    (4 asesores con 30 ventas y 1 con 50: 20 × 4 + 30 = 110 $):

    >>> BONO = [{"desde": 30, "monto": 20}, {"desde": 40, "monto": 25}, {"desde": 50, "monto": 30}]
    >>> cond["aragua"]["supervisor"]["bono_por_asesor"] = BONO
    >>> M = {sup.clave: sup, **{(i, "aragua"): Miembro(i, "aragua", "asesor") for i in range(10, 18)}}
    >>> n = {10: 30, 11: 30, 12: 30, 13: 30, 14: 50, 15: 12, 16: 29, 17: 1}
    >>> vs = [V(f"{i}-{k}", i, 1) for i, c in n.items() for k in range(c)]
    >>> cond["aragua"]["asesor"] = {"tramos_asesor": [{"desde": 0, "monto": 0, "descontar": 0}]}
    >>> [p for p in calcular_pagos(vs, M, cond, Indicadores()) if p.persona_id == 1][0].bono
    110.0
    """
    payments: dict[Key, Payment] = {}

    def payment(m: Member) -> Payment:
        if m.key not in payments:
            payments[m.key] = Payment(person_id=m.person_id, team=m.team, role=m.role)
        return payments[m.key]

    def pieces(m: Member) -> dict[str, Any]:
        return conditions.get(m.team, {}).get(m.role, {})

    # Los miembros que cobran venta de equipo por cada via, para no recorrerlos todos en cada venta.
    by_unit: dict[tuple[str, int], list[Member]] = {}
    complete: dict[str, list[Member]] = {}
    for m in members.values():
        team = pieces(m).get("equipo")
        if not team:
            continue
        if team["alcance"] == "unidades":
            for u in m.units:
                by_unit.setdefault((m.team, u), []).append(m)
        elif team["alcance"] == "equipo_completo":
            complete.setdefault(m.team, []).append(m)

    # Con quien vende cada asesor, para asignarlo al supervisor con el que mas vende.
    with_supervisor: dict[tuple[int, int], int] = {}

    for sale in sales:
        if not sale.team:
            continue
        channel = members.get((sale.channel_id, sale.team)) if sale.channel_id is not None else None

        if sale.pyme:
            if channel is not None:
                p = payment(channel)
                p.sme_sales += 1
                if sale.pct_pyme is None:
                    p.sme_without_pct += 1
                else:
                    p.sme_amount += sale.price * sale.pct_pyme / 100
            continue

        if channel is not None:
            p = payment(channel)
            p.own_sales += 1
            p.own_amount += _per_sale(pieces(channel).get("propia"), sale)
            if sale.supervisor_id is not None:
                key = (sale.channel_id, sale.supervisor_id)
                with_supervisor[key] = with_supervisor.get(key, 0) + 1

        candidates: dict[Key, Member] = {}
        for person_id, scope in ((sale.supervisor_id, "supervisados"), (sale.office_coord_id, "oficina")):
            m = members.get((person_id, sale.team)) if person_id is not None else None
            if m is not None and (pieces(m).get("equipo") or {}).get("alcance") == scope:
                candidates[m.key] = m
        for unit in sale.unit_ids:
            for m in by_unit.get((sale.team, unit), []):
                candidates[m.key] = m
        for m in complete.get(sale.team, []):
            candidates[m.key] = m

        for m in candidates.values():
            if channel is not None and m.key == channel.key:
                continue  # quien vendio cobra la propia, no ademas la de equipo
            team = pieces(m)["equipo"]
            if team.get("excluir_oficina") and sale.is_office:
                continue
            p = payment(m)
            p.team_sales += 1
            step = pieces(m).get("escalon_crecimiento")
            if step is not None:
                growth = indicators.growths.get(m.key)
                if growth is not None:
                    p.team_amount += _step(growth, step)
            else:
                p.team_amount += _per_sale(team, sale)

    # Los asesores de cada supervisor: los que mas venden con el.
    main: dict[int, int] = {}
    for advisor_id, supervisor_id in sorted(with_supervisor, key=lambda k: (-with_supervisor[k], k[1])):
        main.setdefault(advisor_id, supervisor_id)

    # Quien cobra bonos sin haber vendido (administradora, jefe y coordinador de UN) tiene pago igual.
    for m in members.values():
        if {"bono_empresa", "bono_por_unidad", "bono_churn"} & pieces(m).keys():
            payment(m)

    for p in payments.values():
        m = members[(p.person_id, p.team)]
        role_cond = pieces(m)
        bonuses: list[dict[str, Any]] = []
        p.sme_amount = round(p.sme_amount, 2)
        if p.sme_without_pct:
            p.warnings.append(f"{p.sme_without_pct} venta(s) PYME de un plan sin % de comisión definido")
        if p.own_sales and not (role_cond.get("propia") or role_cond.get("tramos_asesor")):
            p.warnings.append("Su rol no cobra por venta propia")
        if p.team_sales and not role_cond.get("equipo"):
            p.warnings.append("Figura como superior de otras ventas, pero su rol no cobra por equipo")

        if "tramos_asesor" in role_cond:
            tier, paid, amount = advisor_payment(p.own_sales, _discounted(role_cond["tramos_asesor"]))
            p.own_amount = amount
            p.detail = {"tramo_desde": tier["desde"], "monto_por_venta": tier["monto"], "ventas_pagadas": paid}
            if "bono_tramos" in role_cond:
                bonus_tier, bonus_amount = goal_bonus(p.own_sales, role_cond["bono_tramos"])
                p.detail["bono_desde"] = bonus_tier["desde"] if bonus_tier else None
                if bonus_amount:
                    bonuses.append({"concepto": f"Meta de {bonus_tier['desde']} ventas", "monto": bonus_amount})
        else:
            p.own_amount = round(p.own_amount, 2)

        if "escalon_crecimiento" in role_cond:
            growth = indicators.growths.get(m.key)
            p.detail["crecimiento_pct"] = growth
            if growth is None and p.team_sales:
                p.warnings.append("Crecimiento de su unidad desconocido: las ventas de equipo no se pagan")
            elif growth is not None:
                p.detail["monto_por_venta_equipo"] = _step(growth, role_cond["escalon_crecimiento"])
        p.team_amount = round(p.team_amount, 2)
        p.gross = round(p.own_amount + p.team_amount, 2)

        if role_cond.get("factor") not in (None, "ninguno"):
            factor = indicators.factors.get(m.key)
            if factor is None:
                p.warnings.append("Cumplimiento del objetivo sin definir: se paga como 100%")
                factor = 100.0
            p.factor_pct = min(max(float(factor), 0.0), 100.0)
            p.detail["factor"] = role_cond["factor"]

        if "bono_por_asesor" in role_cond:
            advisors = [
                (aid, payments[(aid, m.team)].own_sales)
                for aid, sup in main.items()
                if sup == m.person_id and (aid, m.team) in payments and members[(aid, m.team)].role in ADVISOR_ROLES
            ]
            total, arrived = 0.0, 0
            for _, advisor_sales in advisors:
                tier = _reached_tier(advisor_sales, role_cond["bono_por_asesor"])
                if tier is not None:
                    total += float(tier["monto"])
                    arrived += 1
            p.detail["asesores"] = len(advisors)
            if arrived:
                bonuses.append({"concepto": f"{arrived} asesor(es) que llegaron a su meta", "monto": round(total, 2)})

        if "bono_por_unidad" in role_cond:
            bonus_by_unit = float(role_cond["bono_por_unidad"]["monto"])
            without_data = []
            for unit in m.units:
                pct = indicators.unit_inflows.get(unit)
                if pct is None:
                    without_data.append(unit)
                    continue
                bonuses.append({
                    "concepto": f"Unidad {unit} al {min(max(pct, 0.0), 100.0):g} % de ingresos",
                    "unidad_id": unit,
                    "monto": round(bonus_by_unit * min(max(pct, 0.0), 100.0) / 100, 2),
                })
            if without_data:
                p.warnings.append(f"{len(without_data)} unidad(es) sin % de ingresos: no suman al bono")

        if "bono_churn" in role_cond:
            churn = indicators.churns.get(m.key)
            p.detail["churn_bruto_pct"] = churn
            if churn is None:
                p.warnings.append("Churn de su unidad desconocido: sin bono por churn")
            else:
                amount = bonus_churn(churn, role_cond["bono_churn"])
                if amount:
                    bonuses.append({"concepto": f"Churn bruto de {churn:g} %", "monto": amount})

        if "bono_empresa" in role_cond:
            pct = indicators.company_pct
            p.detail["pct_empresa"] = pct
            if pct is None:
                p.warnings.append("Cumplimiento de ventas de la empresa desconocido: sin bono")
            else:
                bonuses.append({"concepto": f"Ventas de la empresa al {pct:g} %", "monto": administrator_bonus(pct, role_cond["bono_empresa"])})

        p.bonus = round(sum(b["monto"] for b in bonuses), 2)
        p.detail["bonos"] = bonuses
        factor = 1.0 if p.factor_pct is None else p.factor_pct / 100
        p.net = round(p.gross * factor + p.sme_amount + p.bonus, 2)

    return sorted(payments.values(), key=lambda p: (p.team, p.role, p.person_id))


def _discounted(tiers: list[dict[str, float]]) -> list[dict[str, float]]:
    """Los tramos del asesor, ordenados por `desde` (los guardados ya vienen validados)."""
    return sorted(tiers, key=lambda t: t["desde"])
