"""Siembra los catalogos desde `data/Planes.json` y `data/Zonas.json`.

Es lo unico que sigue leyendo esos ficheros. Sirve para la migracion inicial y
para levantar un entorno nuevo; a partir de ahi el catalogo se mantiene desde
el modulo de Catalogos (`/catalogos/`).

Es idempotente: lo que ya existe no se toca salvo que se pase `--update`,
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
from services.subscriptions.models import Coordinator, Plan, Site, State, Zone

DATA_DIR = pathlib.Path(__file__).resolve().parents[4] / "data"
PLANS_PATH = DATA_DIR / "Planes.json"
ZONES_PATH = DATA_DIR / "Zonas.json"


def _read(path: pathlib.Path, key: str) -> list[dict]:
    """Lee una lista del JSON de `data/`, o vacia si el fichero no esta."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f).get(key, [])


def _text(value) -> str:
    """El valor como texto recortado, o cadena vacia."""
    return str(value or "").strip()


def _decimal(value) -> float:
    """El valor como numero, o 0.0 si no se puede convertir."""
    try:
        return float(_text(value) or 0)
    except ValueError:
        return 0.0


class Command(BaseCommand):
    """Siembra los catalogos desde los JSON de `data/`."""

    help = "Carga planes, zonas, sites, estados y coordinadores desde los JSON de data/."

    def add_arguments(self, parser):
        """Declara `--update`, que permite pisar lo ya existente."""
        parser.add_argument(
            "--update",
            action="store_true",
            help="Sobrescribe los registros que ya existan con lo que diga el fichero.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        """Siembra en orden: sites, estados, coordinadores, zonas y planes."""
        update = options["update"]

        zones_json = _read(ZONES_PATH, "zonas")
        plans_json = _read(PLANS_PATH, "planes")

        if not zones_json and not plans_json:
            self.stdout.write(self.style.WARNING(
                f"No se encontraron {PLANS_PATH.name} ni {ZONES_PATH.name} en {DATA_DIR}."
            ))
            return

        sites = self._seed_sites(zones_json, update)
        states = self._seed_states(zones_json)
        coordinators = self._seed_coordinators(zones_json)
        self._seed_zones(zones_json, sites, states, coordinators, update)
        self._seed_plans(plans_json, update)

        reset_cache()

    # --- Catalogos simples ---------------------------------------------------

    def _seed_sites(self, zones_json, update) -> dict[str, Site]:
        """Crea los sites y les asigna el orden comercial de `CUSTOM_SITE_ORDER`."""
        names = {_text(z.get("Site")) for z in zones_json}
        names.discard("")
        # El orden comercial que la interfaz espera venia de una lista en el
        # codigo; aqui pasa a ser una columna. Lo que no estaba listado se iba
        # al final, y se sigue yendo.
        created = {}
        for name in sorted(names):
            order = (
                CUSTOM_SITE_ORDER.index(name)
                if name in CUSTOM_SITE_ORDER
                else len(CUSTOM_SITE_ORDER)
            )
            site, new = Site.objects.get_or_create(name=name, defaults={"order": order})
            if update and not new and site.order != order:
                site.order = order
                site.save(update_fields=["order"])
            created[name] = site
        self.stdout.write(f"Sites: {len(created)}")
        return created

    def _seed_states(self, zones_json) -> dict[str, State]:
        """Crea las entidades federales que nombran las zonas."""
        names = {_text(z.get("Estado")) for z in zones_json}
        names.discard("")
        created = {n: State.objects.get_or_create(name=n)[0] for n in sorted(names)}
        self.stdout.write(f"Estados: {len(created)}")
        return created

    def _seed_coordinators(self, zones_json) -> dict[str, Coordinator]:
        """Crea los coordinadores, recortando los espacios sobrantes del fichero."""
        # Los nombres del fichero traen espacios sobrantes ("German Cerruti "
        # frente a "German Cerruti"), y los reportes ya los comparaban
        # recortados: recortarlos aqui los funde en un solo coordinador, que es
        # lo que la agrupacion por coordinador venia haciendo de todas formas.
        names = {_text(z.get("Coordinador")) for z in zones_json}
        names.discard("")
        created = {n: Coordinator.objects.get_or_create(name=n)[0] for n in sorted(names)}
        self.stdout.write(f"Coordinadores: {len(created)}")
        return created

    # --- Zonas y planes ------------------------------------------------------

    def _seed_zones(self, zones_json, sites, states, coordinators, update) -> None:
        """Crea las zonas enlazandolas con site, estado y coordinador."""
        created = updated = 0
        for z in zones_json:
            name = _text(z.get("name"))
            site = sites.get(_text(z.get("Site")))
            state = states.get(_text(z.get("Estado")))
            if not name or site is None or state is None:
                continue

            values = {
                "site": site,
                "state": state,
                "technology": _text(z.get("Type")) or "FTTH",
                "coordinator": coordinators.get(_text(z.get("Coordinador"))),
            }
            zone, new = Zone.objects.get_or_create(name=name, defaults=values)
            if new:
                created += 1
            elif update:
                for field, value in values.items():
                    setattr(zone, field, value)
                zone.save()
                updated += 1
        self.stdout.write(f"Zonas: {created} creadas, {updated} actualizadas")

    def _seed_plans(self, plans_json, update) -> None:
        """Crea los planes. `Cancelado` se salta: no es un producto contratable."""
        created = updated = 0
        for p in plans_json:
            name = _text(p.get("name"))
            # `Cancelado` no entra: no es un producto contratable sino la marca
            # que deja una baja. Vive en `fixtures.recognized_names()`.
            if not name or name == CANCELLED_PLAN:
                continue

            tariff = _text(p.get("tarifa"))
            values = {
                "technology": _text(p.get("type")) or "FTTH",
                "person_type": _text(p.get("people")) or "nat",
                "reference": _text(p.get("ref")),
                "has_tv": _text(p.get("TV")).lower() == "true",
                "data_mbps": _decimal(p.get("datas")),
                "price": _decimal(p.get("price")),
            }
            plan, new = Plan.objects.get_or_create(
                name=name, tariff=tariff, defaults=values
            )
            if new:
                created += 1
            elif update:
                for field, value in values.items():
                    setattr(plan, field, value)
                plan.save()
                updated += 1
        self.stdout.write(f"Planes: {created} creados, {updated} actualizados")
