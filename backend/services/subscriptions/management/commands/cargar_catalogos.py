"""Siembra los catalogos desde `data/Planes.json` y `data/Zonas.json`.

Es lo unico que sigue leyendo esos ficheros. Sirve para la migracion inicial y
para levantar un entorno nuevo; a partir de ahi el catalogo se mantiene desde
el modulo de Catalogos (`/catalogos/`).

Es idempotente: lo que ya existe no se toca salvo que se pase `--actualizar`,
para no pisar con el fichero una correccion hecha desde la web.
"""

from __future__ import annotations

import json
import pathlib

from django.core.management.base import BaseCommand
from django.db import transaction

from core.config import CANCELLED_PLAN
from core.fixtures import reset_cache
from services.subscriptions.analytics.config import CUSTOM_SITE_ORDER
from services.subscriptions.models import Coordinador, Estado, Plan, Site, Zona

DATA_DIR = pathlib.Path(__file__).resolve().parents[4] / "data"
PLANS_PATH = DATA_DIR / "Planes.json"
ZONES_PATH = DATA_DIR / "Zonas.json"


def _read(path: pathlib.Path, clave: str) -> list[dict]:
    """Lee una lista del JSON de `data/`, o vacia si el fichero no esta."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f).get(clave, [])


def _text(valor) -> str:
    """El valor como texto recortado, o cadena vacia."""
    return str(valor or "").strip()


def _decimal(valor) -> float:
    """El valor como numero, o 0.0 si no se puede convertir."""
    try:
        return float(_text(valor) or 0)
    except ValueError:
        return 0.0


class Command(BaseCommand):
    """Siembra los catalogos desde los JSON de `data/`."""

    help = "Carga planes, zonas, sites, estados y coordinadores desde los JSON de data/."

    def add_arguments(self, parser):
        """Declara `--actualizar`, que permite pisar lo ya existente."""
        parser.add_argument(
            "--actualizar",
            action="store_true",
            help="Sobrescribe los registros que ya existan con lo que diga el fichero.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        """Siembra en orden: sites, estados, coordinadores, zonas y planes."""
        actualizar = options["actualizar"]

        zones_json = _read(ZONES_PATH, "zonas")
        plans_json = _read(PLANS_PATH, "planes")

        if not zones_json and not plans_json:
            self.stdout.write(self.style.WARNING(
                f"No se encontraron {PLANS_PATH.name} ni {ZONES_PATH.name} en {DATA_DIR}."
            ))
            return

        sites = self._seed_sites(zones_json, actualizar)
        estados = self._seed_states(zones_json)
        coordinadores = self._seed_coordinators(zones_json)
        self._seed_zones(zones_json, sites, estados, coordinadores, actualizar)
        self._seed_plans(plans_json, actualizar)

        reset_cache()

    # --- Catalogos simples ---------------------------------------------------

    def _seed_sites(self, zones_json, actualizar) -> dict[str, Site]:
        """Crea los sites y les asigna el orden comercial de `CUSTOM_SITE_ORDER`."""
        nombres = {_text(z.get("Site")) for z in zones_json}
        nombres.discard("")
        # El orden comercial que la interfaz espera venia de una lista en el
        # codigo; aqui pasa a ser una columna. Lo que no estaba listado se iba
        # al final, y se sigue yendo.
        creados = {}
        for nombre in sorted(nombres):
            orden = (
                CUSTOM_SITE_ORDER.index(nombre)
                if nombre in CUSTOM_SITE_ORDER
                else len(CUSTOM_SITE_ORDER)
            )
            site, nuevo = Site.objects.get_or_create(nombre=nombre, defaults={"orden": orden})
            if actualizar and not nuevo and site.orden != orden:
                site.orden = orden
                site.save(update_fields=["orden"])
            creados[nombre] = site
        self.stdout.write(f"Sites: {len(creados)}")
        return creados

    def _seed_states(self, zones_json) -> dict[str, Estado]:
        """Crea las entidades federales que nombran las zonas."""
        nombres = {_text(z.get("Estado")) for z in zones_json}
        nombres.discard("")
        creados = {n: Estado.objects.get_or_create(nombre=n)[0] for n in sorted(nombres)}
        self.stdout.write(f"Estados: {len(creados)}")
        return creados

    def _seed_coordinators(self, zones_json) -> dict[str, Coordinador]:
        """Crea los coordinadores, recortando los espacios sobrantes del fichero."""
        # Los nombres del fichero traen espacios sobrantes ("German Cerruti "
        # frente a "German Cerruti"), y los reportes ya los comparaban
        # recortados: recortarlos aqui los funde en un solo coordinador, que es
        # lo que la agrupacion por coordinador venia haciendo de todas formas.
        nombres = {_text(z.get("Coordinador")) for z in zones_json}
        nombres.discard("")
        creados = {n: Coordinador.objects.get_or_create(nombre=n)[0] for n in sorted(nombres)}
        self.stdout.write(f"Coordinadores: {len(creados)}")
        return creados

    # --- Zonas y planes ------------------------------------------------------

    def _seed_zones(self, zones_json, sites, estados, coordinadores, actualizar) -> None:
        """Crea las zonas enlazandolas con site, estado y coordinador."""
        creadas = actualizadas = 0
        for z in zones_json:
            nombre = _text(z.get("name"))
            site = sites.get(_text(z.get("Site")))
            estado = estados.get(_text(z.get("Estado")))
            if not nombre or site is None or estado is None:
                continue

            valores = {
                "site": site,
                "estado": estado,
                "tecnologia": _text(z.get("Type")) or "FTTH",
                "coordinador": coordinadores.get(_text(z.get("Coordinador"))),
            }
            zona, nueva = Zona.objects.get_or_create(nombre=nombre, defaults=valores)
            if nueva:
                creadas += 1
            elif actualizar:
                for campo, valor in valores.items():
                    setattr(zona, campo, valor)
                zona.save()
                actualizadas += 1
        self.stdout.write(f"Zonas: {creadas} creadas, {actualizadas} actualizadas")

    def _seed_plans(self, plans_json, actualizar) -> None:
        """Crea los planes. `Cancelado` se salta: no es un producto contratable."""
        creados = actualizados = 0
        for p in plans_json:
            nombre = _text(p.get("name"))
            # `Cancelado` no entra: no es un producto contratable sino la marca
            # que deja una baja. Vive en `fixtures.recognized_names()`.
            if not nombre or nombre == CANCELLED_PLAN:
                continue

            tarifa = _text(p.get("tarifa"))
            valores = {
                "tecnologia": _text(p.get("type")) or "FTTH",
                "tipo_persona": _text(p.get("people")) or "nat",
                "referencia": _text(p.get("ref")),
                "tiene_tv": _text(p.get("TV")).lower() == "true",
                "datas_mbps": _decimal(p.get("datas")),
                "precio": _decimal(p.get("price")),
            }
            plan, nuevo = Plan.objects.get_or_create(
                nombre=nombre, tarifa=tarifa, defaults=valores
            )
            if nuevo:
                creados += 1
            elif actualizar:
                for campo, valor in valores.items():
                    setattr(plan, campo, valor)
                plan.save()
                actualizados += 1
        self.stdout.write(f"Planes: {creados} creados, {actualizados} actualizados")
