"""Carga de los ficheros de datos de referencia (`Planes.json`, `Zonas.json`).

Antes cada consumidor recalculaba la ruta y volvia a abrir el fichero: cinco
sitios distintos, y solo uno de ellos cacheaba. Como estos ficheros solo
cambian cuando alguien los edita a mano y se leen en caliente dentro de
reportes, aqui se leen una vez por proceso.

Los ficheros que faltan devuelven una estructura vacia en vez de reventar:
varios reportes ya dependian de ese comportamiento para degradar en vez de
caerse. Quien necesite distinguir "vacio" de "ausente" tiene `planes_disponibles()`
y `zonas_disponibles()`.
"""

from __future__ import annotations

import json
import logging
import pathlib
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)

# core/fixtures.py -> core/ -> raiz del repositorio -> data/
DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"

PLANES_PATH = DATA_DIR / "Planes.json"
ZONAS_PATH = DATA_DIR / "Zonas.json"


def _read_json(path: pathlib.Path) -> dict[str, Any]:
    if not path.exists():
        logger.warning("No se encontro %s: se continua con datos vacios.", path.name)
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        logger.exception("No se pudo leer %s: se continua con datos vacios.", path.name)
        return {}


def planes_disponibles() -> bool:
    return PLANES_PATH.exists()


def zonas_disponibles() -> bool:
    return ZONAS_PATH.exists()


@lru_cache(maxsize=1)
def load_planes() -> dict[str, Any]:
    """Contenido crudo de `Planes.json` (`{"planes": [...]}`)."""
    return _read_json(PLANES_PATH)


@lru_cache(maxsize=1)
def load_zonas() -> dict[str, Any]:
    """Contenido crudo de `Zonas.json` (`{"zonas": [...]}`)."""
    return _read_json(ZONAS_PATH)


@lru_cache(maxsize=1)
def planes() -> list[dict[str, Any]]:
    return load_planes().get("planes", [])


@lru_cache(maxsize=1)
def zonas() -> list[dict[str, Any]]:
    return load_zonas().get("zonas", [])


@lru_cache(maxsize=1)
def plan_names() -> frozenset[str]:
    """Nombres de plan canonicos, para decidir si una linea de orden es un plan."""
    return frozenset(p["name"] for p in planes() if p.get("name"))


@lru_cache(maxsize=1)
def zonas_por_nombre() -> dict[str, dict[str, Any]]:
    """Zonas indexadas por nombre en minusculas.

    Las tres lecturas de `Zonas.json` que habia normalizaban la clave igual
    (`name.strip().lower()`), asi que el indice se construye una sola vez.
    """
    return {
        z["name"].strip().lower(): z
        for z in zonas()
        if z.get("name")
    }


def reset_cache() -> None:
    """Olvida lo cacheado. Pensado para pruebas y para recargar sin reiniciar."""
    for fn in (load_planes, load_zonas, planes, zonas, plan_names, zonas_por_nombre):
        fn.cache_clear()
