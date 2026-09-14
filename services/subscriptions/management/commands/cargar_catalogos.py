"""Siembra los catalogos desde `data/Planes.json` y `data/Zonas.json`.

Es lo unico que sigue leyendo esos ficheros. Sirve para la migracion inicial y
para levantar un entorno nuevo; a partir de ahi el catalogo se mantiene desde
`/subscriptions/config/`.

Es idempotente: lo que ya existe no se toca salvo que se pase `--actualizar`,
para no pisar con el fichero una correccion hecha desde la web.
"""

from __future__ import annotations

import json
import pathlib

from django.core.management.base import BaseCommand
from django.db import transaction

from core.config import PLAN_CANCELADO
from core.fixtures import reset_cache
from services.subscriptions.analytics.config import CUSTOM_SITE_ORDER
from services.subscriptions.models import Coordinador, Estado, Plan, Site, Zona

DATA_DIR = pathlib.Path(__file__).resolve().parents[4] / "data"
PLANES_PATH = DATA_DIR / "Planes.json"
ZONAS_PATH = DATA_DIR / "Zonas.json"


def _leer(path: pathlib.Path, clave: str) -> list[dict]:
    """Lee una lista del JSON de `data/`, o vacia si el fichero no esta."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f).get(clave, [])


def _texto(valor) -> str:
    """El valor como texto recortado, o cadena vacia."""
    return str(valor or "").strip()


def _decimal(valor) -> float:
    """El valor como numero, o 0.0 si no se puede convertir."""
    try:
        return float(_texto(valor) or 0)
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

        zonas_json = _leer(ZONAS_PATH, "zonas")
        planes_json = _leer(PLANES_PATH, "planes")

        if not zonas_json and not planes_json:
            self.stdout.write(self.style.WARNING(
                f"No se encontraron {PLANES_PATH.name} ni {ZONAS_PATH.name} en {DATA_DIR}."
            ))
            return

        sites = self._sembrar_sites(zonas_json, actualizar)
        estados = self._sembrar_estados(zonas_json)
        coordinadores = self._sembrar_coordinadores(zonas_json)
        self._sembrar_zonas(zonas_json, sites, estados, coordinadores, actualizar)
        self._sembrar_planes(planes_json, actualizar)

        reset_cache()

    # --- Catalogos simples ---------------------------------------------------

    def _sembrar_sites(self, zonas_json, actualizar) -> dict[str, Site]:
        """Crea los sites y les asigna el orden comercial de `CUSTOM_SITE_ORDER`."""
        nombres = {_texto(z.get("Site")) for z in zonas_json}
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

    def _sembrar_estados(self, zonas_json) -> dict[str, Estado]:
        """Crea las entidades federales que nombran las zonas."""
        nombres = {_texto(z.get("Estado")) for z in zonas_json}
        nombres.discard("")
        creados = {n: Estado.objects.get_or_create(nombre=n)[0] for n in sorted(nombres)}
        self.stdout.write(f"Estados: {len(creados)}")
        return creados

    def _sembrar_coordinadores(self, zonas_json) -> dict[str, Coordinador]:
        """Crea los coordinadores, recortando los espacios sobrantes del fichero."""
        # Los nombres del fichero traen espacios sobrantes ("German Cerruti "
        # frente a "German Cerruti"), y los reportes ya los comparaban
        # recortados: recortarlos aqui los funde en un solo coordinador, que es
        # lo que la agrupacion por coordinador venia haciendo de todas formas.
        nombres = {_texto(z.get("Coordinador")) for z in zonas_json}
        nombres.discard("")
        creados = {n: Coordinador.objects.get_or_create(nombre=n)[0] for n in sorted(nombres)}
        self.stdout.write(f"Coordinadores: {len(creados)}")
        return creados

    # --- Zonas y planes ------------------------------------------------------

    def _sembrar_zonas(self, zonas_json, sites, estados, coordinadores, actualizar) -> None:
        """Crea las zonas enlazandolas con site, estado y coordinador."""
        creadas = actualizadas = 0
        for z in zonas_json:
            nombre = _texto(z.get("name"))
            site = sites.get(_texto(z.get("Site")))
            estado = estados.get(_texto(z.get("Estado")))
            if not nombre or site is None or estado is None:
                continue

            valores = {
                "site": site,
                "estado": estado,
                "tecnologia": _texto(z.get("Type")) or "FTTH",
                "coordinador": coordinadores.get(_texto(z.get("Coordinador"))),
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

    def _sembrar_planes(self, planes_json, actualizar) -> None:
        """Crea los planes. `Cancelado` se salta: no es un producto contratable."""
        creados = actualizados = 0
        for p in planes_json:
            nombre = _texto(p.get("name"))
            # `Cancelado` no entra: no es un producto contratable sino la marca
            # que deja una baja. Vive en `fixtures.nombres_reconocidos()`.
            if not nombre or nombre == PLAN_CANCELADO:
                continue

            tarifa = _texto(p.get("tarifa"))
            valores = {
                "tecnologia": _texto(p.get("type")) or "FTTH",
                "tipo_persona": _texto(p.get("people")) or "nat",
                "referencia": _texto(p.get("ref")),
                "tiene_tv": _texto(p.get("TV")).lower() == "true",
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
