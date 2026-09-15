"""Acceso unico a los catalogos de referencia (planes, zonas, sites...).

Antes esto leia `data/Planes.json` y `data/Zonas.json`. Ahora son tablas
(`services/subscriptions/models.py`) que se mantienen desde
`/subscriptions/config/`, pero la firma de este modulo no cambio: los cuatro
consumidores —`subscriptions/analytics/{imports,queries,eta_report}.py` y
`support/analytics/queries.py`— siguen recibiendo los mismos diccionarios con
las mismas claves de la epoca JSON (`Site`, `Type`, `Estado`, `TV`...). De eso
se encargan `Zona.to_fixture()` y `Plan.to_fixture()`.

Lo que si cambio es la cache. El `lru_cache` de antes no caducaba nunca: valia
cuando el catalogo era un fichero que solo cambiaba al desplegar, pero ahora se
edita en caliente y el worker de Celery es otro proceso que jamas veria la
edicion. En su lugar se guarda **una sola instantanea coherente de todos los
catalogos** con 60s de vigencia: coherente porque un analisis que consultara
planes antes de una edicion y zonas despues mezclaria dos catalogos distintos.

Las escrituras llaman a `reset_cache()`, y tambien lo hace `_ejecutar_con_turno`
al empezar cada analisis, de modo que una ejecucion no cambia de catalogo a
mitad de camino.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from core.config import PLAN_CANCELADO

logger = logging.getLogger(__name__)

# Vigencia de la instantanea. Corta porque el catalogo se edita desde la web y
# el worker tiene que enterarse; suficiente para que un analisis no vuelva a
# consultar la base de datos en cada uno de los 31 cortes del mes.
TTL_SEGUNDOS = 60


@dataclass(frozen=True)
class _Catalogo:
    """Todos los catalogos leidos de una vez, ya en la forma que se sirve."""

    planes: tuple[dict[str, Any], ...] = ()
    zonas: tuple[dict[str, Any], ...] = ()
    sites: tuple[str, ...] = ()
    ignorados: frozenset[str] = frozenset()
    nombres_planes: frozenset[str] = frozenset()
    zonas_indexadas: dict[str, dict[str, Any]] = field(default_factory=dict)


_VACIO = _Catalogo()

_lock = threading.Lock()
_instantanea: _Catalogo | None = None
_tomada_en: float = 0.0


def _leer() -> _Catalogo:
    """Una lectura completa de las cinco tablas del catalogo.

    Los modelos se importan aqui dentro y no arriba: este modulo lo importan
    paquetes de analisis que se cargan antes de que Django termine de registrar
    las apps, y un import de modelos a nivel de fichero reventaria con
    `AppRegistryNotReady`.
    """
    from services.subscriptions.models import Plan, ProductoIgnorado, Site, Zona

    planes = tuple(p.to_fixture() for p in Plan.objects.all())
    zonas = tuple(
        z.to_fixture()
        for z in Zona.objects.select_related("site", "estado", "coordinador").all()
    )
    sites = tuple(Site.objects.values_list("nombre", flat=True))
    ignorados = frozenset(ProductoIgnorado.objects.values_list("nombre", flat=True))

    return _Catalogo(
        planes=planes,
        zonas=zonas,
        sites=sites,
        ignorados=ignorados,
        nombres_planes=frozenset(p["name"] for p in planes if p.get("name")),
        zonas_indexadas={
            z["name"].strip().lower(): z for z in zonas if z.get("name")
        },
    )


def _catalogo() -> _Catalogo:
    """La instantanea vigente, releyendo si caduco.

    Un fallo de lectura degrada a catalogo vacio —igual que antes degradaba un
    fichero ausente— pero no se guarda: cachear el error dejaria al sistema sin
    catalogo durante un minuto por un corte de un segundo.
    """
    global _instantanea, _tomada_en

    with _lock:
        if _instantanea is not None and (time.monotonic() - _tomada_en) < TTL_SEGUNDOS:
            return _instantanea

        try:
            catalogo = _leer()
        except Exception:
            logger.exception("No se pudo leer el catalogo: se continua con datos vacios.")
            return _VACIO

        _instantanea = catalogo
        _tomada_en = time.monotonic()
        return catalogo


def reset_cache() -> None:
    """Olvida la instantanea. La llaman las escrituras del catalogo y cada analisis."""
    global _instantanea, _tomada_en

    with _lock:
        _instantanea = None
        _tomada_en = 0.0


# --- Lo que consumen los analisis -------------------------------------------

def planes() -> list[dict[str, Any]]:
    """Planes del catalogo, con las claves de `Planes.json`."""
    return list(_catalogo().planes)


def zonas() -> list[dict[str, Any]]:
    """Zonas del catalogo, con las claves de `Zonas.json`."""
    return list(_catalogo().zonas)


def planes_disponibles() -> bool:
    """Si hay algun plan registrado. Distingue "vacio" de "no configurado"."""
    return bool(_catalogo().planes)


def zonas_disponibles() -> bool:
    """Si hay alguna zona registrada. Distingue "vacio" de "no configurado"."""
    return bool(_catalogo().zonas)


def plan_names() -> frozenset[str]:
    """Que planes existen. No incluye `Cancelado`, que no es un plan."""
    return _catalogo().nombres_planes


def nombres_reconocidos() -> frozenset[str]:
    """Si una linea del export es un plan.

    `Cancelado` no esta en el catalogo —no es un producto contratable, es la
    marca que Odoo deja cuando una suscripcion se da de baja— pero lo llevan
    unas 22.000 suscripciones. Sin separarlo de `plan_names()` el sistema
    fallaba por los dos lados: metiendolo en el catalogo aparece como un
    producto editable y borrable, y dejandolo fuera todas esas suscripciones
    cuentan como productos sin registrar y bloquean cada importacion.
    """
    return _catalogo().nombres_planes | {PLAN_CANCELADO}


def zonas_por_nombre() -> dict[str, dict[str, Any]]:
    """Zonas indexadas por nombre en minusculas.

    Las tres lecturas de zonas que habia normalizaban la clave igual
    (`name.strip().lower()`), asi que el indice se construye una sola vez.
    """
    return _catalogo().zonas_indexadas


def orden_sites() -> list[str]:
    """Sites por relevancia comercial, no alfabeticamente.

    Sustituye a la constante `CUSTOM_SITE_ORDER`, que ahora solo es la semilla
    de la columna `Site.orden`. Lo que no este en el catalogo va al final.
    """
    return list(_catalogo().sites)


def productos_ignorados() -> frozenset[str]:
    """Lineas del export que alguien declaro que nunca seran un plan."""
    return _catalogo().ignorados
