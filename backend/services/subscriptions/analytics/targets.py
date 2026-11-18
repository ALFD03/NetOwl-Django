"""Los objetivos comerciales tal y como los consume el cliente.

Los objetivos no alteran ningun analisis: solo deciden la meta, el
cumplimiento y el color con que se pinta cada cifra. Por eso no se aplican
aqui sino en `frontend/src/features/subscriptions/lib/objetivos.ts`, y esta funcion
solo los sirve: unas decenas de filas que viajan en los props de las paginas
de Subscriptions.

Todo va indexado por **nombre** (de zona, site, estado o coordinador) porque es
la clave con la que el cliente ya cruza los nodos de los reportes contra
`get_zones_config()`. La historia entera de cada entidad viaja completa y el
cliente elige el tramo vigente en cada periodo: Results y el Dashboard pintan
varios meses a la vez, y cada uno tiene el suyo.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import DatabaseError

from core.config import DB_SCHEMA, TableNames
from core.database import DBConnector
from services.subscriptions.models import (
    REFERENCE_BY_LEVEL,
    CommercialTarget,
    MonthTarget,
    TargetThresholds,
    ZoneWithoutTarget,
)

# Lo que responde si la tabla estuviera vacia: el 6% / 3% que la aplicacion
# tuvo escrito a mano. La migracion ya lo siembra; esto solo evita que un
# entorno sin sembrar pinte metas de cero.
DEFAULT_GENERAL = {"crecimiento": 6.0, "churn": 3.0}

logger = logging.getLogger(__name__)


def _pct(value) -> float | None:
    """Decimal del ORM a float, conservando el nulo que significa "hereda"."""
    return None if value is None else float(value)


def _tier(row) -> dict[str, Any]:
    """Un tramo con vigencia, en la forma minima que necesita el cliente."""
    return {
        "desde": row.since,
        "crecimiento": _pct(row.growth_pct),
        "churn": _pct(row.churn_pct),
    }


def serialize_traffic_light(traffic_light: TargetThresholds) -> dict[str, float]:
    """Los umbrales de color como numeros planos."""
    return {
        "cumpl_verde": float(traffic_light.compliance_green),
        "cumpl_amarillo": float(traffic_light.compliance_yellow),
        "crec_verde": float(traffic_light.growth_green),
        "crec_amarillo": float(traffic_light.growth_yellow),
        "churn_verde": float(traffic_light.churn_green),
        "churn_amarillo": float(traffic_light.churn_yellow),
    }


def _default_config() -> dict[str, Any]:
    """El 6% / 3% de siempre con el semaforo por defecto, sin tocar la BD."""
    return {
        "general": dict(DEFAULT_GENERAL),
        "meses": {},
        "estados": {},
        "sites": {},
        "coordinadores": {},
        "zonas": {},
        "sucursales": {},
        "zonas_sucursal": {},
        "zonas_sin_objetivo": {},
        "semaforo": serialize_traffic_light(TargetThresholds()),
    }


def get_targets_config() -> dict[str, Any]:
    """Todos los objetivos y el semaforo, listos para el cliente.

    Si la lectura falla (un entorno donde aun no se aplico la migracion) se
    sirven los valores por defecto: los objetivos solo ponen metas y colores, y
    no deben tumbar la pagina que los muestra.

    Forma:

        {
          "general": {crecimiento, churn},      # una sola fila, sin fecha
          "meses": {"YYYY-MM": {crecimiento, churn}},
          "estados" | "sites" | "coordinadores" | "zonas" | "sucursales": {nombre: [tramo, ...]},
          "zonas_sucursal": {"Zona - Sucursal": [tramo, ...]},
          "zonas_sin_objetivo": {zona: {desde, hasta}},   # apartadas del cumplimiento
          "semaforo": {...},
        }

    Un tramo es `{desde, crecimiento, churn}`; `desde` nulo es "desde siempre"
    y un valor nulo es "hereda del nivel de arriba".
    """
    try:
        return _read_targets()
    except DatabaseError:
        logger.exception("No se pudieron leer los objetivos; se usan los de por defecto")
        return _default_config()


def _read_targets() -> dict[str, Any]:
    """La lectura de verdad de `get_targets_config`."""
    config: dict[str, Any] = {
        "general": dict(DEFAULT_GENERAL),
        "meses": {},
        "estados": {},
        "sites": {},
        "coordinadores": {},
        "zonas": {},
        "sucursales": {},
        "zonas_sucursal": {},
        "zonas_sin_objetivo": {},
    }
    by_level = {
        "estado": config["estados"],
        "site": config["sites"],
        "coordinador": config["coordinadores"],
        "zona": config["zonas"],
        "sucursal": config["sucursales"],
        "zona_sucursal": config["zonas_sucursal"],
    }

    # El `ordering` del modelo ya los deja con el tramo "desde siempre" primero
    # y el resto por fecha, que es el orden en que el cliente los recorre.
    rows = CommercialTarget.objects.select_related(*REFERENCE_BY_LEVEL.values())
    for row in rows:
        if row.level == "general":
            # Una sola fila y sin fecha (`objetivo_general_sin_fecha`). Un
            # valor nulo no deberia darse, pero si se diera cae al por defecto.
            for metric, value in (("crecimiento", row.growth_pct), ("churn", row.churn_pct)):
                if value is not None:
                    config["general"][metric] = float(value)
            continue
        # Un nodo va con la misma clave que el `valor` de la dimension
        # `zona_sucursal` ("Guacara - NYC"), que es contra lo que se cruza.
        name = row.entity_name
        if name:
            by_level[row.level].setdefault(name, []).append(_tier(row))

    for row in MonthTarget.objects.all():
        config["meses"][row.period] = {
            "crecimiento": _pct(row.growth_pct),
            "churn": _pct(row.churn_pct),
        }

    # Las zonas apartadas del cumplimiento, con su tramo: el cliente decide en
    # cada periodo si rige (Results y el Dashboard pintan varios meses).
    for row in ZoneWithoutTarget.objects.select_related("zone"):
        config["zonas_sin_objetivo"][row.zone.name] = {"desde": row.since, "hasta": row.until}

    config["semaforo"] = serialize_traffic_light(TargetThresholds.current())
    return config


def known_nodes() -> list[dict[str, str]]:
    """Los nodos (zona - sucursal) que aparecen en algun cierre calculado.

    La sucursal no es un catalogo: solo existe en los datos. Esta lista es de
    donde elegirla, y el nodo, al fijar un objetivo desde el catalogo. Si la
    lectura falla, lista vacia: el formulario sigue sirviendo para lo demas.
    """
    try:
        df = DBConnector().query(
            f"""
            SELECT DISTINCT valor
            FROM {DB_SCHEMA}.{TableNames.ANALYZER_CHURN_DIMENSIONS}
            WHERE dimension = 'zona_sucursal'
            """
        )
    except Exception:
        logger.exception("No se pudieron leer los nodos conocidos")
        return []

    nodes = []
    for value in sorted(str(v) for v in df.get("valor", [])):
        zone, _, branch = value.partition(" - ")
        if zone.strip() and branch.strip():
            nodes.append({"nodo": value, "zona": zone.strip(), "sucursal": branch.strip()})
    return nodes
