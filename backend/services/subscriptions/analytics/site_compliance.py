"""El cumplimiento de cada site, unidad de negocio y de la empresa en un mes, en el servidor.

Es el «% Ventas» y el «% Ingresos» que el cliente calcula en el Sales Report y
en Unidades de negocio (`calcComercial`, `lib/commercial.ts`): las instalaciones
del mes (`nuevos`) y el crecimiento neto (`final - inicio`), cada uno contra la
meta del grupo. Lo necesita Comisiones, que paga por esos cumplimientos, y el
cierre se calcula en el servidor: no puede esperar a que un navegador resuelva
los objetivos.

Reproduce la regla del cliente (`frontend/src/features/subscriptions/lib/objetivos.ts`)
para el total de un grupo, y **las dos tienen que decir lo mismo**. El nivel del
grupo decide desde donde se resuelve el objetivo de cada nodo (`CADENA` del
cliente, del nivel mas alto al del grupo: sucursal, estado, site y, en una unidad
de negocio, coordinador):

- La meta de un grupo es la suma, nodo a nodo (zona - sucursal), de su base
  inicial por el objetivo de crecimiento resuelto **desde el nivel del grupo**:
  manda el nivel mas alto que lo fije, y si ninguno, el general del mes (su
  excepcion de mes, o el general). Ni la zona ni, en un site, el coordinador
  mueven el total.
- Las zonas sin objetivo (`zonas_sin_objetivo`) no entran: ni en la meta, ni en
  las instalaciones, ni en el crecimiento o el churn.
- Un site se mide sobre todas sus tecnologias juntas. Una unidad de negocio, sobre
  los nodos que Unidades de negocio le asigna (`get_business_units_data`).
- La empresa es la suma de los sites.
- Sin recortar: puede pasar del 100 % (el tope, si lo hay, lo pone quien lo
  aplica).

Se lee del cierre del mes (`analyzer_churn_dimensiones`, dimension
`zona_sucursal`); un mes sin analizar no tiene cumplimiento.
"""

from __future__ import annotations

import logging
from typing import Any

from .queries import get_business_units_data, get_periods, get_sales_report_data, get_zones_config
from .targets import get_targets_config

logger = logging.getLogger(__name__)

# Del nivel mas alto al mas bajo, desde el nivel del grupo hacia arriba (`CADENA` del cliente).
_LEVELS_FROM_SITE = (("sucursal", "sucursales"), ("estado", "estados"), ("site", "sites"))
_LEVELS_FROM_UNIT = (*_LEVELS_FROM_SITE, ("coordinador", "coordinadores"))


def _key(name: Any) -> str:
    return str(name or "").strip().lower()


def current_value(tiers: list[dict[str, Any]] | None, month: str) -> float | None:
    """El crecimiento del tramo vigente en `mes`: el mas reciente que ya empezo y lo fija.

    >>> valor_vigente([{"desde": None, "crecimiento": 6}, {"desde": "2026-09", "crecimiento": 8}], "2026-10")
    8.0
    >>> valor_vigente([{"desde": "2026-09", "crecimiento": None}, {"desde": None, "crecimiento": 5}], "2026-10")
    5.0
    >>> valor_vigente([{"desde": "2026-11", "crecimiento": 8}], "2026-10") is None
    True
    """
    best = None
    for tier in tiers or []:
        if tier.get("crecimiento") is None:
            continue
        since = tier.get("desde")
        if since is not None and since > month:
            continue
        if best is None or (best.get("desde") or "") <= (since or ""):
            best = tier
    return float(best["crecimiento"]) if best else None


def overall_target(config: dict[str, Any], month: str) -> float:
    """El crecimiento general del mes: su excepcion, o el general."""
    exception = (config.get("meses") or {}).get(month) or {}
    if exception.get("crecimiento") is not None:
        return float(exception["crecimiento"])
    return float((config.get("general") or {}).get("crecimiento") or 0)


def _without_target(config: dict[str, Any], zone: str, month: str) -> bool:
    """Si la zona esta apartada del cumplimiento en `mes`."""
    tiers = {_key(k): v for k, v in (config.get("zonas_sin_objetivo") or {}).items()}
    tier = tiers.get(_key(zone))
    if not tier:
        return False
    return (not tier.get("desde") or tier["desde"] <= month) and (not tier.get("hasta") or month <= tier["hasta"])


class _Group:
    """Lo que se suma de los nodos de un grupo y los cumplimientos que salen de ello."""

    def __init__(self) -> None:
        self.start = 0.0
        self.final = 0.0
        self.new = 0.0
        self.churns = 0.0
        self.meta = 0.0
        self.set_aside = 0

    def add(self, other: _Group) -> None:
        for field in ("start", "final", "new", "churns", "meta", "set_aside"):
            setattr(self, field, getattr(self, field) + getattr(other, field))

    def result(self) -> dict[str, Any]:
        """Los cumplimientos del grupo; nulos si no hay meta (o base) sobre la que medir."""
        with_goal = self.meta > 0
        return {
            "pct_ventas": round(self.new / self.meta * 100, 2) if with_goal else None,
            # `tasaCumplimiento` del cliente: el crecimiento neto contra la meta.
            "pct_ingresos": round((self.final - self.start) / self.meta * 100, 2) if with_goal else None,
            "crecimiento": round((self.final - self.start) / self.start * 100, 2) if self.start > 0 else None,
            "churn_bruto": round(self.churns / self.start * 100, 2) if self.start > 0 else None,
            "nuevos": int(self.new),
            "meta": round(self.meta, 2),
            "zonas_sin_objetivo": self.set_aside,
        }


def month_indicators(month: str) -> dict[str, Any] | None:
    """Los cumplimientos de `mes` por site, unidad de negocio y empresa; None si no esta analizado.

    ```
    {"sites":     {site:   {pct_ventas, pct_ingresos, crecimiento, churn_bruto, nuevos, meta, zonas_sin_objetivo}},
     "unidades":  {unidad: {...lo mismo...}},
     "empresa":   {...lo mismo...}}
    ```

    Cada `pct_*` es nulo en un grupo sin meta (todas sus zonas sin objetivo, o
    sin base). Un site o una unidad que el mes no trae no aparece.
    """
    label = next((p for p in get_periods() if str(p).startswith(month)), None)
    if not label:
        return None
    sales = get_sales_report_data(label)
    if sales.get("status") != "success":
        return None

    config = get_targets_config()
    zones = {_key(z["name"]): z for z in get_zones_config()["zonas"]}
    tables = {
        level: {_key(k): v for k, v in (config.get(key) or {}).items()}
        for level, key in _LEVELS_FROM_UNIT
    }
    general = overall_target(config, month)

    def sum_nodes(nodes: list[dict[str, Any]], levels, locate) -> _Group:
        group = _Group()
        for node in nodes:
            if _without_target(config, node["zona"], month):
                group.set_aside += 1
                continue
            location = locate(node)
            pct = next(
                (v for level, _ in levels
                 if location.get(level) and (v := current_value(tables[level].get(_key(location[level])), month)) is not None),
                general,
            )
            start = float(node.get("activos_inicio") or 0)
            group.start += start
            group.final += float(node.get("activos_final") or 0)
            group.new += float(node.get("nuevos") or 0)
            group.churns += float(node.get("bajas") or 0)
            group.meta += start * pct / 100
        return group

    sites: dict[str, dict[str, Any]] = {}
    company = _Group()
    for site in sales.get("data") or []:
        site_name = site["site"]
        nodes = [n for tech in site.get("technologies") or [] for n in tech.get("nodes") or []]
        group = sum_nodes(
            nodes, _LEVELS_FROM_SITE,
            lambda n, s=site_name: {
                "sucursal": n.get("sucursal"), "estado": zones.get(_key(n["zona"]), {}).get("estado"), "site": s,
            },
        )
        sites[site_name] = group.result()
        company.add(group)

    units: dict[str, dict[str, Any]] = {}
    for bu_group in (get_business_units_data(label).get("data") or []):
        if bu_group.get("is_rf"):
            continue
        def locate_unit(n, u=bu_group["coordinador"]):
            z = zones.get(_key(n["zona"]), {})
            return {"sucursal": n.get("sucursal"), "estado": z.get("estado"), "site": z.get("site"), "coordinador": u}
        units[bu_group["coordinador"]] = sum_nodes(bu_group.get("nodes") or [], _LEVELS_FROM_UNIT, locate_unit).result()

    return {"sites": sites, "unidades": units, "empresa": company.result()}


def site_sales_compliance(month: str) -> dict[str, dict[str, Any]] | None:
    """`{site: {pct, nuevos, meta, zonas_sin_objetivo}}` del mes, o None si no esta analizado.

    `pct` es el «% Ventas», nulo en un site sin meta. Se conserva por quien solo
    quiere los sites; el resto de niveles y el «% Ingresos» salen de `month_indicators`.
    """
    data = month_indicators(month)
    if data is None:
        return None
    return {
        site: {"pct": row["pct_ventas"], "nuevos": row["nuevos"], "meta": row["meta"],
               "zonas_sin_objetivo": row["zonas_sin_objetivo"]}
        for site, row in data["sites"].items()
    }
