"""Lo que cobra cada persona por las ventas validas del periodo, segun su equipo y su rol.

Es la parte de las comisiones que no mira facturas ni fechas —eso decide que
ventas cuentan (`reglas.clasificar`)— sino **cuanto se paga por una venta que
ya cuenta**. Es pura: recibe las ventas con sus personas resueltas, la
estructura de cada equipo, las condiciones de cada rol y los indicadores ya
calculados, y devuelve un `Pago` por persona y equipo. Nada de base de datos.

Cada rol de cada equipo lleva las piezas de pago que declara
`catalogos.equipos.PIEZAS_POR_ROL`; aqui estan implementadas una a una:

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

from dataclasses import dataclass, field
from typing import Any

from .reglas import bono_meta, pago_asesor

Clave = tuple[int, str]  # (persona_id, equipo)

ROLES_ASESOR = ("asesor", "telemarketing")


@dataclass
class Miembro:
    """El papel de una persona en un equipo, con lo que el motor necesita saber de el."""

    persona_id: int
    equipo: str
    rol: str
    # Las unidades de negocio que lleva (`unidades` de la membresia).
    unidades: tuple[int, ...] = ()

    @property
    def clave(self) -> Clave:
        return (self.persona_id, self.equipo)


@dataclass
class Venta:
    """Una venta valida con las personas que cobran por ella ya resueltas.

    Los ids son de `PersonaVentas`; nulos si la venta no trae la columna o su
    literal no esta en el directorio. `equipo` es el slug del equipo de la venta
    (vacio si no se pudo saber, y entonces no cobra nadie). `unidad_ids` son las
    unidades de negocio a las que pertenece, por la cadena supervisor → su
    superior; `es_oficina`, si quien vendio es una coordinadora de oficina.
    """

    orden: str
    pyme: bool
    precio: float
    pct_pyme: float | None
    equipo: str
    medio_id: int | None = None
    supervisor_id: int | None = None
    coord_oficina_id: int | None = None
    unidad_ids: tuple[int, ...] = ()
    es_oficina: bool = False


@dataclass
class Indicadores:
    """Los porcentajes que condicionan el pago, ya resueltos (manual o calculado)."""

    # El % de cumplimiento que multiplica a quien lleva `factor`, por membresia.
    factores: dict[Clave, float | None] = field(default_factory=dict)
    # El crecimiento de la unidad de cada coordinador de UN (para su escalon).
    crecimientos: dict[Clave, float | None] = field(default_factory=dict)
    # El churn bruto de la unidad de cada coordinador de UN (para su bono).
    churns: dict[Clave, float | None] = field(default_factory=dict)
    # El % de ingresos de cada unidad (para el bono del jefe de UN).
    ingresos_unidad: dict[int, float | None] = field(default_factory=dict)
    # El % de ventas de toda la empresa (para el bono de la administradora).
    pct_empresa: float | None = None


@dataclass
class Pago:
    """Lo que cobra una persona en un equipo en el periodo, con el desglose que lo explica."""

    persona_id: int
    equipo: str
    rol: str
    ventas_propias: int = 0
    ventas_equipo: int = 0
    ventas_pyme: int = 0
    monto_pyme: float = 0.0
    pyme_sin_porcentaje: int = 0
    monto_propias: float = 0.0
    monto_equipo: float = 0.0
    # Lo que se multiplica por el factor: propias + equipo. La PYME queda fuera.
    bruto: float = 0.0
    factor_pct: float | None = None
    # Los bonos, sumados; cada uno con su concepto en `detalle["bonos"]`.
    bono: float = 0.0
    neto: float = 0.0
    detalle: dict[str, Any] = field(default_factory=dict)
    avisos: list[str] = field(default_factory=list)


def _por_venta(pieza: dict[str, Any] | None, venta: Venta) -> float:
    """Lo que paga una pieza `propia`/`equipo` por una venta: un monto, o un % del plan."""
    if not pieza:
        return 0.0
    if pieza["tipo"] == "pct_plan":
        return venta.precio * float(pieza["valor"]) / 100
    return float(pieza["valor"])


def _escalon(crecimiento: float, pieza: dict[str, Any]) -> float:
    """Lo que cobra el coordinador de UN por venta de equipo segun el crecimiento de su unidad.

    >>> p = {"umbral_pct": 6, "alto": 2, "bajo": 1}
    >>> [_escalon(c, p) for c in (-3, 5.99, 6, 12)]
    [1.0, 1.0, 2.0, 2.0]
    """
    return float(pieza["alto"] if crecimiento >= float(pieza["umbral_pct"]) else pieza["bajo"])


def _tramo_alcanzado(ventas: float, tramos: list[dict[str, float]]) -> dict[str, float] | None:
    """El ultimo tramo que empieza en o antes de `ventas`; nulo por debajo del primero.

    >>> T = [{"desde": 30, "monto": 20}, {"desde": 40, "monto": 25}, {"desde": 50, "monto": 30}]
    >>> [(_tramo_alcanzado(n, T) or {}).get("monto") for n in (29, 30, 45, 50, 80)]
    [None, 20, 25, 30, 30]
    """
    elegido = None
    for tramo in sorted(tramos, key=lambda t: t["desde"]):
        if tramo["desde"] <= ventas:
            elegido = tramo
    return elegido


def bono_churn(churn: float, tramos: list[dict[str, float]]) -> float:
    """El bono por el churn bruto: el del tramo mas exigente que se cumple (churn <= max).

    >>> T = [{"max": 3, "monto": 100}, {"max": 1.9, "monto": 200}]
    >>> [bono_churn(c, T) for c in (5, 3, 2.5, 1.9, 0.4)]
    [0.0, 100.0, 100.0, 200.0, 200.0]
    """
    cumplidos = [t for t in tramos if churn <= float(t["max"])]
    if not cumplidos:
        return 0.0
    return float(min(cumplidos, key=lambda t: t["max"])["monto"])


def bono_administradora(pct: float, pieza: dict[str, float]) -> float:
    """Menos del 100 %: el monto proporcional (80 % → 80 $); el 100 %: el monto; mas: el excedente.

    >>> P = {"monto": 100, "excedente": 120}
    >>> [bono_administradora(p, P) for p in (80, 99.5, 100, 100.01, 130)]
    [80.0, 99.5, 100.0, 120.0, 120.0]
    """
    if pct > 100:
        return float(pieza["excedente"])
    return round(float(pieza["monto"]) * max(pct, 0.0) / 100, 2)


def calcular_pagos(
    ventas: list[Venta],
    miembros: dict[Clave, Miembro],
    condiciones: dict[str, dict[str, dict[str, Any]]],
    indicadores: Indicadores,
) -> list[Pago]:
    """Lo que cobra cada persona, por equipo, por las ventas validas del periodo.

    - `miembros`: todas las membresias, por (persona, equipo).
    - `condiciones`: `{equipo: {rol: parametros}}`, ya validados y completados
      (`equipos.parametros_vigentes`).
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
    pagos: dict[Clave, Pago] = {}

    def pago(m: Miembro) -> Pago:
        if m.clave not in pagos:
            pagos[m.clave] = Pago(persona_id=m.persona_id, equipo=m.equipo, rol=m.rol)
        return pagos[m.clave]

    def piezas(m: Miembro) -> dict[str, Any]:
        return condiciones.get(m.equipo, {}).get(m.rol, {})

    # Los miembros que cobran venta de equipo por cada via, para no recorrerlos todos en cada venta.
    por_unidad: dict[tuple[str, int], list[Miembro]] = {}
    completos: dict[str, list[Miembro]] = {}
    for m in miembros.values():
        equipo = piezas(m).get("equipo")
        if not equipo:
            continue
        if equipo["alcance"] == "unidades":
            for u in m.unidades:
                por_unidad.setdefault((m.equipo, u), []).append(m)
        elif equipo["alcance"] == "equipo_completo":
            completos.setdefault(m.equipo, []).append(m)

    # Con quien vende cada asesor, para asignarlo al supervisor con el que mas vende.
    con_supervisor: dict[tuple[int, int], int] = {}

    for venta in ventas:
        if not venta.equipo:
            continue
        medio = miembros.get((venta.medio_id, venta.equipo)) if venta.medio_id is not None else None

        if venta.pyme:
            if medio is not None:
                p = pago(medio)
                p.ventas_pyme += 1
                if venta.pct_pyme is None:
                    p.pyme_sin_porcentaje += 1
                else:
                    p.monto_pyme += venta.precio * venta.pct_pyme / 100
            continue

        if medio is not None:
            p = pago(medio)
            p.ventas_propias += 1
            p.monto_propias += _por_venta(piezas(medio).get("propia"), venta)
            if venta.supervisor_id is not None:
                clave = (venta.medio_id, venta.supervisor_id)
                con_supervisor[clave] = con_supervisor.get(clave, 0) + 1

        candidatos: dict[Clave, Miembro] = {}
        for persona_id, alcance in ((venta.supervisor_id, "supervisados"), (venta.coord_oficina_id, "oficina")):
            m = miembros.get((persona_id, venta.equipo)) if persona_id is not None else None
            if m is not None and (piezas(m).get("equipo") or {}).get("alcance") == alcance:
                candidatos[m.clave] = m
        for unidad in venta.unidad_ids:
            for m in por_unidad.get((venta.equipo, unidad), []):
                candidatos[m.clave] = m
        for m in completos.get(venta.equipo, []):
            candidatos[m.clave] = m

        for m in candidatos.values():
            if medio is not None and m.clave == medio.clave:
                continue  # quien vendio cobra la propia, no ademas la de equipo
            equipo = piezas(m)["equipo"]
            if equipo.get("excluir_oficina") and venta.es_oficina:
                continue
            p = pago(m)
            p.ventas_equipo += 1
            escalon = piezas(m).get("escalon_crecimiento")
            if escalon is not None:
                crecimiento = indicadores.crecimientos.get(m.clave)
                if crecimiento is not None:
                    p.monto_equipo += _escalon(crecimiento, escalon)
            else:
                p.monto_equipo += _por_venta(equipo, venta)

    # Los asesores de cada supervisor: los que mas venden con el.
    principal: dict[int, int] = {}
    for asesor_id, supervisor_id in sorted(con_supervisor, key=lambda k: (-con_supervisor[k], k[1])):
        principal.setdefault(asesor_id, supervisor_id)

    # Quien cobra bonos sin haber vendido (administradora, jefe y coordinador de UN) tiene pago igual.
    for m in miembros.values():
        if {"bono_empresa", "bono_por_unidad", "bono_churn"} & piezas(m).keys():
            pago(m)

    for p in pagos.values():
        m = miembros[(p.persona_id, p.equipo)]
        cond_rol = piezas(m)
        bonos: list[dict[str, Any]] = []
        p.monto_pyme = round(p.monto_pyme, 2)
        if p.pyme_sin_porcentaje:
            p.avisos.append(f"{p.pyme_sin_porcentaje} venta(s) PYME de un plan sin % de comisión definido")
        if p.ventas_propias and not (cond_rol.get("propia") or cond_rol.get("tramos_asesor")):
            p.avisos.append("Su rol no cobra por venta propia")
        if p.ventas_equipo and not cond_rol.get("equipo"):
            p.avisos.append("Figura como superior de otras ventas, pero su rol no cobra por equipo")

        if "tramos_asesor" in cond_rol:
            tramo, pagadas, monto = pago_asesor(p.ventas_propias, _con_descuento(cond_rol["tramos_asesor"]))
            p.monto_propias = monto
            p.detalle = {"tramo_desde": tramo["desde"], "monto_por_venta": tramo["monto"], "ventas_pagadas": pagadas}
            if "bono_tramos" in cond_rol:
                tramo_bono, monto_bono = bono_meta(p.ventas_propias, cond_rol["bono_tramos"])
                p.detalle["bono_desde"] = tramo_bono["desde"] if tramo_bono else None
                if monto_bono:
                    bonos.append({"concepto": f"Meta de {tramo_bono['desde']} ventas", "monto": monto_bono})
        else:
            p.monto_propias = round(p.monto_propias, 2)

        if "escalon_crecimiento" in cond_rol:
            crecimiento = indicadores.crecimientos.get(m.clave)
            p.detalle["crecimiento_pct"] = crecimiento
            if crecimiento is None and p.ventas_equipo:
                p.avisos.append("Crecimiento de su unidad desconocido: las ventas de equipo no se pagan")
            elif crecimiento is not None:
                p.detalle["monto_por_venta_equipo"] = _escalon(crecimiento, cond_rol["escalon_crecimiento"])
        p.monto_equipo = round(p.monto_equipo, 2)
        p.bruto = round(p.monto_propias + p.monto_equipo, 2)

        if cond_rol.get("factor") not in (None, "ninguno"):
            factor = indicadores.factores.get(m.clave)
            if factor is None:
                p.avisos.append("Cumplimiento del objetivo sin definir: se paga como 100%")
                factor = 100.0
            p.factor_pct = min(max(float(factor), 0.0), 100.0)
            p.detalle["factor"] = cond_rol["factor"]

        if "bono_por_asesor" in cond_rol:
            asesores = [
                (aid, pagos[(aid, m.equipo)].ventas_propias)
                for aid, sup in principal.items()
                if sup == m.persona_id and (aid, m.equipo) in pagos and miembros[(aid, m.equipo)].rol in ROLES_ASESOR
            ]
            total, llegaron = 0.0, 0
            for _, ventas_asesor in asesores:
                tramo = _tramo_alcanzado(ventas_asesor, cond_rol["bono_por_asesor"])
                if tramo is not None:
                    total += float(tramo["monto"])
                    llegaron += 1
            p.detalle["asesores"] = len(asesores)
            if llegaron:
                bonos.append({"concepto": f"{llegaron} asesor(es) que llegaron a su meta", "monto": round(total, 2)})

        if "bono_por_unidad" in cond_rol:
            por_unidad_bono = float(cond_rol["bono_por_unidad"]["monto"])
            sin_dato = []
            for unidad in m.unidades:
                pct = indicadores.ingresos_unidad.get(unidad)
                if pct is None:
                    sin_dato.append(unidad)
                    continue
                bonos.append({
                    "concepto": f"Unidad {unidad} al {min(max(pct, 0.0), 100.0):g} % de ingresos",
                    "unidad_id": unidad,
                    "monto": round(por_unidad_bono * min(max(pct, 0.0), 100.0) / 100, 2),
                })
            if sin_dato:
                p.avisos.append(f"{len(sin_dato)} unidad(es) sin % de ingresos: no suman al bono")

        if "bono_churn" in cond_rol:
            churn = indicadores.churns.get(m.clave)
            p.detalle["churn_bruto_pct"] = churn
            if churn is None:
                p.avisos.append("Churn de su unidad desconocido: sin bono por churn")
            else:
                monto = bono_churn(churn, cond_rol["bono_churn"])
                if monto:
                    bonos.append({"concepto": f"Churn bruto de {churn:g} %", "monto": monto})

        if "bono_empresa" in cond_rol:
            pct = indicadores.pct_empresa
            p.detalle["pct_empresa"] = pct
            if pct is None:
                p.avisos.append("Cumplimiento de ventas de la empresa desconocido: sin bono")
            else:
                bonos.append({"concepto": f"Ventas de la empresa al {pct:g} %", "monto": bono_administradora(pct, cond_rol["bono_empresa"])})

        p.bono = round(sum(b["monto"] for b in bonos), 2)
        p.detalle["bonos"] = bonos
        factor = 1.0 if p.factor_pct is None else p.factor_pct / 100
        p.neto = round(p.bruto * factor + p.monto_pyme + p.bono, 2)

    return sorted(pagos.values(), key=lambda p: (p.equipo, p.rol, p.persona_id))


def _con_descuento(tramos: list[dict[str, float]]) -> list[dict[str, float]]:
    """Los tramos del asesor, ordenados por `desde` (los guardados ya vienen validados)."""
    return sorted(tramos, key=lambda t: t["desde"])
