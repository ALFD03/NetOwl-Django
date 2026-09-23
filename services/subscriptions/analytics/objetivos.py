"""Los objetivos comerciales tal y como los consume el cliente.

Los objetivos no alteran ningun analisis: solo deciden la meta, el
cumplimiento y el color con que se pinta cada cifra. Por eso no se aplican
aqui sino en `web/src/features/subscriptions/lib/objetivos.ts`, y esta funcion
solo los sirve: unas decenas de filas que viajan en los props de las paginas
de Subscriptions.

Todo va indexado por **nombre** (de zona, site, estado o coordinador) porque es
la clave con la que el cliente ya cruza los nodos de los reportes contra
`get_zonas_config()`. La historia entera de cada entidad viaja completa y el
cliente elige el tramo vigente en cada periodo: Results y el Dashboard pintan
varios meses a la vez, y cada uno tiene el suyo.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import DatabaseError

from services.subscriptions.models import (
    REFERENCIA_POR_NIVEL,
    ObjetivoComercial,
    ObjetivoMes,
    SemaforoObjetivos,
)

# Lo que responde si la tabla estuviera vacia: el 6% / 3% que la aplicacion
# tuvo escrito a mano. La migracion ya lo siembra; esto solo evita que un
# entorno sin sembrar pinte metas de cero.
GENERAL_POR_DEFECTO = {"crecimiento": 6.0, "churn": 3.0}

logger = logging.getLogger(__name__)


def _pct(valor) -> float | None:
    """Decimal del ORM a float, conservando el nulo que significa "hereda"."""
    return None if valor is None else float(valor)


def _tramo(fila) -> dict[str, Any]:
    """Un tramo con vigencia, en la forma minima que necesita el cliente."""
    return {
        "desde": fila.desde,
        "crecimiento": _pct(fila.crecimiento_pct),
        "churn": _pct(fila.churn_pct),
    }


def serializar_semaforo(semaforo: SemaforoObjetivos) -> dict[str, float]:
    """Los umbrales de color como numeros planos."""
    return {
        "cumpl_verde": float(semaforo.cumpl_verde),
        "cumpl_amarillo": float(semaforo.cumpl_amarillo),
        "crec_verde": float(semaforo.crec_verde),
        "crec_amarillo": float(semaforo.crec_amarillo),
        "churn_verde": float(semaforo.churn_verde),
        "churn_amarillo": float(semaforo.churn_amarillo),
    }


def _config_por_defecto() -> dict[str, Any]:
    """El 6% / 3% de siempre con el semaforo por defecto, sin tocar la BD."""
    return {
        "general": dict(GENERAL_POR_DEFECTO),
        "meses": {},
        "estados": {},
        "sites": {},
        "coordinadores": {},
        "zonas": {},
        "semaforo": serializar_semaforo(SemaforoObjetivos()),
    }


def get_objetivos_config() -> dict[str, Any]:
    """Todos los objetivos y el semaforo, listos para el cliente.

    Si la lectura falla (un entorno donde aun no se aplico la migracion) se
    sirven los valores por defecto: los objetivos solo ponen metas y colores, y
    no deben tumbar la pagina que los muestra.

    Forma:

        {
          "general": {crecimiento, churn},      # una sola fila, sin fecha
          "meses": {"YYYY-MM": {crecimiento, churn}},
          "estados" | "sites" | "coordinadores" | "zonas": {nombre: [tramo, ...]},
          "semaforo": {...},
        }

    Un tramo es `{desde, crecimiento, churn}`; `desde` nulo es "desde siempre"
    y un valor nulo es "hereda del nivel de arriba".
    """
    try:
        return _leer_objetivos()
    except DatabaseError:
        logger.exception("No se pudieron leer los objetivos; se usan los de por defecto")
        return _config_por_defecto()


def _leer_objetivos() -> dict[str, Any]:
    """La lectura de verdad de `get_objetivos_config`."""
    config: dict[str, Any] = {
        "general": dict(GENERAL_POR_DEFECTO),
        "meses": {},
        "estados": {},
        "sites": {},
        "coordinadores": {},
        "zonas": {},
    }
    por_nivel = {
        "estado": config["estados"],
        "site": config["sites"],
        "coordinador": config["coordinadores"],
        "zona": config["zonas"],
    }

    # El `ordering` del modelo ya los deja con el tramo "desde siempre" primero
    # y el resto por fecha, que es el orden en que el cliente los recorre.
    filas = ObjetivoComercial.objects.select_related(*REFERENCIA_POR_NIVEL.values())
    for fila in filas:
        if fila.nivel == "general":
            # Una sola fila y sin fecha (`objetivo_general_sin_fecha`). Un
            # valor nulo no deberia darse, pero si se diera cae al por defecto.
            for metrica, valor in (("crecimiento", fila.crecimiento_pct), ("churn", fila.churn_pct)):
                if valor is not None:
                    config["general"][metrica] = float(valor)
            continue
        entidad = fila.entidad
        if entidad is not None:
            por_nivel[fila.nivel].setdefault(entidad.nombre, []).append(_tramo(fila))

    for fila in ObjetivoMes.objects.all():
        config["meses"][fila.periodo] = {
            "crecimiento": _pct(fila.crecimiento_pct),
            "churn": _pct(fila.churn_pct),
        }

    config["semaforo"] = serializar_semaforo(SemaforoObjetivos.actual())
    return config
