"""El cumplimiento de cada site, unidad de negocio y de la empresa en un mes, en el servidor.

Es el «% Ventas» y el «% Ingresos» que el cliente calcula en el Sales Report y
en Unidades de negocio (`calcComercial`, `lib/commercial.ts`): las instalaciones
del mes (`nuevos`) y el crecimiento neto (`final - inicio`), cada uno contra la
meta del grupo. Lo necesita Comisiones, que paga por esos cumplimientos, y el
cierre se calcula en el servidor: no puede esperar a que un navegador resuelva
los objetivos.

Reproduce la regla del cliente (`web/src/features/subscriptions/lib/objetivos.ts`)
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

from .objetivos import get_objetivos_config
from .queries import get_business_units_data, get_periodos, get_sales_report_data, get_zonas_config

logger = logging.getLogger(__name__)

# Del nivel mas alto al mas bajo, desde el nivel del grupo hacia arriba (`CADENA` del cliente).
_NIVELES_DESDE_SITE = (("sucursal", "sucursales"), ("estado", "estados"), ("site", "sites"))
_NIVELES_DESDE_UNIDAD = (*_NIVELES_DESDE_SITE, ("coordinador", "coordinadores"))


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


class _Grupo:
    """Lo que se suma de los nodos de un grupo y los cumplimientos que salen de ello."""

    def __init__(self) -> None:
        self.inicio = 0.0
        self.final = 0.0
        self.nuevos = 0.0
        self.bajas = 0.0
        self.meta = 0.0
        self.apartadas = 0

    def sumar(self, otro: _Grupo) -> None:
        for campo in ("inicio", "final", "nuevos", "bajas", "meta", "apartadas"):
            setattr(self, campo, getattr(self, campo) + getattr(otro, campo))

    def resultado(self) -> dict[str, Any]:
        """Los cumplimientos del grupo; nulos si no hay meta (o base) sobre la que medir."""
        con_meta = self.meta > 0
        return {
            "pct_ventas": round(self.nuevos / self.meta * 100, 2) if con_meta else None,
            # `tasaCumplimiento` del cliente: el crecimiento neto contra la meta.
            "pct_ingresos": round((self.final - self.inicio) / self.meta * 100, 2) if con_meta else None,
            "crecimiento": round((self.final - self.inicio) / self.inicio * 100, 2) if self.inicio > 0 else None,
            "churn_bruto": round(self.bajas / self.inicio * 100, 2) if self.inicio > 0 else None,
            "nuevos": int(self.nuevos),
            "meta": round(self.meta, 2),
            "zonas_sin_objetivo": self.apartadas,
        }


def indicadores_del_mes(mes: str) -> dict[str, Any] | None:
    """Los cumplimientos de `mes` por site, unidad de negocio y empresa; None si no esta analizado.

    ```
    {"sites":     {site:   {pct_ventas, pct_ingresos, crecimiento, churn_bruto, nuevos, meta, zonas_sin_objetivo}},
     "unidades":  {unidad: {...lo mismo...}},
     "empresa":   {...lo mismo...}}
    ```

    Cada `pct_*` es nulo en un grupo sin meta (todas sus zonas sin objetivo, o
    sin base). Un site o una unidad que el mes no trae no aparece.
    """
    etiqueta = next((p for p in get_periodos() if str(p).startswith(mes)), None)
    if not etiqueta:
        return None
    ventas = get_sales_report_data(etiqueta)
    if ventas.get("status") != "success":
        return None

    config = get_objetivos_config()
    zonas = {_clave(z["name"]): z for z in get_zonas_config()["zonas"]}
    tablas = {
        nivel: {_clave(k): v for k, v in (config.get(clave) or {}).items()}
        for nivel, clave in _NIVELES_DESDE_UNIDAD
    }
    general = objetivo_general(config, mes)

    def sumar_nodos(nodos: list[dict[str, Any]], niveles, ubicar) -> _Grupo:
        grupo = _Grupo()
        for nodo in nodos:
            if _sin_objetivo(config, nodo["zona"], mes):
                grupo.apartadas += 1
                continue
            ubicacion = ubicar(nodo)
            pct = next(
                (v for nivel, _ in niveles
                 if ubicacion.get(nivel) and (v := valor_vigente(tablas[nivel].get(_clave(ubicacion[nivel])), mes)) is not None),
                general,
            )
            inicio = float(nodo.get("activos_inicio") or 0)
            grupo.inicio += inicio
            grupo.final += float(nodo.get("activos_final") or 0)
            grupo.nuevos += float(nodo.get("nuevos") or 0)
            grupo.bajas += float(nodo.get("bajas") or 0)
            grupo.meta += inicio * pct / 100
        return grupo

    sites: dict[str, dict[str, Any]] = {}
    empresa = _Grupo()
    for site in ventas.get("data") or []:
        nombre_site = site["site"]
        nodos = [n for tech in site.get("technologies") or [] for n in tech.get("nodes") or []]
        grupo = sumar_nodos(
            nodos, _NIVELES_DESDE_SITE,
            lambda n, s=nombre_site: {
                "sucursal": n.get("sucursal"), "estado": zonas.get(_clave(n["zona"]), {}).get("estado"), "site": s,
            },
        )
        sites[nombre_site] = grupo.resultado()
        empresa.sumar(grupo)

    unidades: dict[str, dict[str, Any]] = {}
    for grupo_bu in (get_business_units_data(etiqueta).get("data") or []):
        if grupo_bu.get("is_rf"):
            continue
        def ubicar_unidad(n, u=grupo_bu["coordinador"]):
            z = zonas.get(_clave(n["zona"]), {})
            return {"sucursal": n.get("sucursal"), "estado": z.get("estado"), "site": z.get("site"), "coordinador": u}
        unidades[grupo_bu["coordinador"]] = sumar_nodos(grupo_bu.get("nodes") or [], _NIVELES_DESDE_UNIDAD, ubicar_unidad).resultado()

    return {"sites": sites, "unidades": unidades, "empresa": empresa.resultado()}


def cumplimiento_ventas_sites(mes: str) -> dict[str, dict[str, Any]] | None:
    """`{site: {pct, nuevos, meta, zonas_sin_objetivo}}` del mes, o None si no esta analizado.

    `pct` es el «% Ventas», nulo en un site sin meta. Se conserva por quien solo
    quiere los sites; el resto de niveles y el «% Ingresos» salen de `indicadores_del_mes`.
    """
    datos = indicadores_del_mes(mes)
    if datos is None:
        return None
    return {
        site: {"pct": fila["pct_ventas"], "nuevos": fila["nuevos"], "meta": fila["meta"],
               "zonas_sin_objetivo": fila["zonas_sin_objetivo"]}
        for site, fila in datos["sites"].items()
    }
