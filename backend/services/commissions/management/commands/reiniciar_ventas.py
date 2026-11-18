"""Vacia el directorio de ventas y todo lo de comisiones, antes de pasar a equipos.

El directorio plano (`PersonaVentas` con un cargo), la asignacion supervisor ->
coordinador de UN, los objetivos de las coordinadoras de oficina, las condiciones
globales y los informes de comisiones (borradores, cierres y archivos) dejan de
tener sentido cuando el directorio se organiza por equipos de ventas. Este
comando los borra para que la migracion que cambia `PersonaVentas` encuentre la
tabla vacia.

Lo que NO toca: sites, unidades de negocio (`catalogo_coordinadores`, solo
se le quita la persona), zonas, estados, planes ni los nombres ignorados.

Los cierres archivados (`comisiones_cierres_archivados`) son nomina ya pagada e
inmutable: el modelo se niega a borrarlos y su FK al periodo es PROTECT. Por eso
se borra con SQL directo y por eso el comando es explicito:

    python manage.py reiniciar_ventas              # ensaya: cuenta, no borra
    python manage.py reiniciar_ventas --ejecutar   # pide escribir el esquema

No usa `TRUNCATE ... CASCADE`: arrastraria `catalogo_coordinadores`, que
referencia al directorio. Cada entorno (esquema) se limpia por separado y todo
ocurre en una transaccion: o se borra todo o no queda nada a medias.

Se ejecuta ANTES de `migrate`.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

DB_SCHEMA = settings.DB_SCHEMA

# En el orden de las claves foraneas: primero lo que referencia, luego lo referenciado.
TABLAS = (
    "comisiones_cierres_archivados",
    "comisiones_pagos",
    "comisiones_ventas",
    "comisiones_periodos",
    "comisiones_revisiones",
    "comisiones_ventas_manuales",
    "comisiones_indicadores",
    "comisiones_supervisor_unidad",
    "comisiones_condiciones",
    "catalogo_objetivos_ventas_oficina",
    "catalogo_personas_ventas",
)

# La unidad de negocio solo pierde a su persona; la fila se queda.
UNITS_TABLE = "catalogo_coordinadores"


def _existing(cur) -> set[str]:
    """Las tablas que existen de verdad en el esquema del entorno."""
    cur.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = %s",
        [DB_SCHEMA],
    )
    return {fila[0] for fila in cur.fetchall()}


def _count(cur, tabla: str) -> int:
    """Filas de `tabla` en el esquema del entorno."""
    cur.execute(f'SELECT COUNT(*) FROM "{DB_SCHEMA}"."{tabla}"')  # noqa: S608 - nombres fijos de este modulo
    return cur.fetchone()[0]


class Command(BaseCommand):
    """Borra el directorio de ventas y los informes de comisiones del entorno."""

    help = "Vacia el directorio de ventas y las comisiones del esquema actual (ensaya salvo --ejecutar)."

    def add_arguments(self, parser):
        """Declara `--ejecutar`, que es lo unico que borra."""
        parser.add_argument(
            "--ejecutar",
            action="store_true",
            help="Borra de verdad, tras pedir que se escriba el nombre del esquema.",
        )

    def handle(self, *args, **opciones):
        """Cuenta lo que hay y, solo con `--ejecutar` y confirmacion, lo borra."""
        with connection.cursor() as cur:
            presentes = _existing(cur)
            tablas = [t for t in TABLAS if t in presentes]
            counts = {t: _count(cur, t) for t in tablas}
            with_person = 0
            if UNITS_TABLE in presentes:
                cur.execute(
                    f'SELECT COUNT(*) FROM "{DB_SCHEMA}"."{UNITS_TABLE}" WHERE persona_id IS NOT NULL'
                )  # noqa: S608
                with_person = cur.fetchone()[0]

        self.stdout.write(f"Esquema: {DB_SCHEMA}")
        for tabla in tablas:
            self.stdout.write(f"  {tabla:<40} {counts[tabla]:>8}")
        self.stdout.write(f"  {UNITS_TABLE + ' (persona_id -> NULL)':<40} {with_person:>8}")

        if not opciones["ejecutar"]:
            self.stdout.write(
                self.style.WARNING("Ensayo: no se ha borrado nada. Usa --ejecutar para borrar.")
            )
            return

        escrito = input(
            f"Esto borra lo anterior de forma irreversible. Escribe el esquema ({DB_SCHEMA}) para confirmar: "
        )
        if escrito.strip() != DB_SCHEMA:
            raise CommandError("El esquema escrito no coincide: no se ha borrado nada.")

        with transaction.atomic(), connection.cursor() as cur:
            if UNITS_TABLE in presentes:
                cur.execute(
                    f'UPDATE "{DB_SCHEMA}"."{UNITS_TABLE}" SET persona_id = NULL WHERE persona_id IS NOT NULL'
                )  # noqa: S608
            for tabla in tablas:
                cur.execute(f'DELETE FROM "{DB_SCHEMA}"."{tabla}"')  # noqa: S608

        self.stdout.write(self.style.SUCCESS("Listo: directorio de ventas y comisiones vaciados."))
