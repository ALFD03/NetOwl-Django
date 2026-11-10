"""El cumplimiento de ventas de cada site en un mes, calculado en el servidor.

Es el «% Ventas» del site del Sales Report: las instalaciones del mes de sus
zonas contra su meta. Lo necesita Comisiones, que paga a supervisores y
coordinadoras de oficina por el cumplimiento de su site, y el cierre se
calcula en el servidor: no puede esperar a que un navegador resuelva los
objetivos.

Reproduce la regla del cliente (`web/src/features/subscriptions/lib/objetivos.ts`)
para un total de site, y **las dos tienen que decir lo mismo**:

- La meta de un site es la suma, nodo a nodo (zona - sucursal), de su base
  inicial por el objetivo de crecimiento resuelto **desde el nivel del site**:
  manda la sucursal, luego el estado, luego el site, y si ninguno fija uno, el
  general del mes (su excepcion de mes, o el general). Ni la zona ni el
  coordinador mueven el total de un site.
- Las zonas sin objetivo (`zonas_sin_objetivo`) no entran: ni en la meta ni en
  las instalaciones.
- Se mide sobre todas las tecnologias del site juntas.
- Sin recortar: puede pasar del 100 % (el tope, si lo hay, lo pone quien lo
  aplica).

Se lee del cierre del mes (`analyzer_churn_dimensiones`, dimension
`zona_sucursal`); un mes sin analizar no tiene cumplimiento.
"""

from __future__ import annotations

import logging
from typing import Any

from .objetivos import get_objetivos_config
from .queries import get_periodos, get_sales_report_data, get_zonas_config

logger = logging.getLogger(__name__)

# Del nivel mas alto al mas bajo, desde el site hacia arriba (`CADENA` del cliente).
_NIVELES_DESDE_SITE = (("sucursal", "sucursales"), ("estado", "estados"), ("site", "sites"))


def _clave(nombre: Any) -> str:
    return str(nombre or "").strip().lower()


def valor_vigente(tramos: list[dict[str, Any]] | None, mes: str) -> float | None:
    """El crecimiento del tramo vigente en `mes`: el mas reciente que ya empezo y lo fija.

    >>> valor_vigente([{"desde": None, "crecimiento": 6}, {"desde": "2026-09", "crecimiento": 8}], "2026-10")
    8.0
    >>> valor_vigente([{"desde": "2026-09", "crecimiento": None}, {"desde": None, "crecimiento": 5}], "2026-10")
    5.0
    >>> valor_vigente([{"desde": "2026-11", "crecimiento": 8}], "2026-10") is None
    True
    """
    mejor = None
    for tramo in tramos or []:
        if tramo.get("crecimiento") is None:
            continue
        desde = tramo.get("desde")
        if desde is not None and desde > mes:
            continue
        if mejor is None or (mejor.get("desde") or "") <= (desde or ""):
            mejor = tramo
    return float(mejor["crecimiento"]) if mejor else None


def objetivo_general(config: dict[str, Any], mes: str) -> float:
    """El crecimiento general del mes: su excepcion, o el general."""
    excepcion = (config.get("meses") or {}).get(mes) or {}
    if excepcion.get("crecimiento") is not None:
        return float(excepcion["crecimiento"])
    return float((config.get("general") or {}).get("crecimiento") or 0)


def _sin_objetivo(config: dict[str, Any], zona: str, mes: str) -> bool:
    """Si la zona esta apartada del cumplimiento en `mes`."""
    tramos = {_clave(k): v for k, v in (config.get("zonas_sin_objetivo") or {}).items()}
    tramo = tramos.get(_clave(zona))
    if not tramo:
        return False
    return (not tramo.get("desde") or tramo["desde"] <= mes) and (not tramo.get("hasta") or mes <= tramo["hasta"])


def cumplimiento_ventas_sites(mes: str) -> dict[str, dict[str, Any]] | None:
    """`{site: {pct, nuevos, meta, zonas_sin_objetivo}}` del mes, o None si no esta analizado.

    `pct` es nulo en un site sin meta (todas sus zonas sin objetivo, o sin base).
    """
    etiqueta = next((p for p in get_periodos() if str(p).startswith(mes)), None)
    if not etiqueta:
        return None
    datos = get_sales_report_data(etiqueta)
    if datos.get("status") != "success":
        return None

    config = get_objetivos_config()
    estado_de = {_clave(z["name"]): z.get("estado") or "" for z in get_zonas_config()["zonas"]}
    tablas = {nivel: {_clave(k): v for k, v in (config.get(clave) or {}).items()} for nivel, clave in _NIVELES_DESDE_SITE}
    general = objetivo_general(config, mes)

    resultado: dict[str, dict[str, Any]] = {}
    for site in datos.get("data") or []:
        nombre_site = site["site"]
        meta = 0.0
        nuevos = 0
        apartadas = 0
        for tech in site.get("technologies") or []:
            for nodo in tech.get("nodes") or []:
                if _sin_objetivo(config, nodo["zona"], mes):
                    apartadas += 1
                    continue
                ubicacion = {
                    "sucursal": nodo.get("sucursal"),
                    "estado": estado_de.get(_clave(nodo["zona"])),
                    "site": nombre_site,
                }
                pct = next(
                    (v for nivel, _ in _NIVELES_DESDE_SITE
                     if ubicacion[nivel] and (v := valor_vigente(tablas[nivel].get(_clave(ubicacion[nivel])), mes)) is not None),
                    general,
                )
                meta += nodo["activos_inicio"] * pct / 100
                nuevos += nodo["nuevos"]
        resultado[nombre_site] = {
            "pct": round(nuevos / meta * 100, 2) if meta > 0 else None,
            "nuevos": nuevos,
            "meta": round(meta, 2),
            "zonas_sin_objetivo": apartadas,
        }
    return resultado
