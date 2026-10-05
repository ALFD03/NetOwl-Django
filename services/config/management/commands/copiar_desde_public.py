"""Copia al esquema del entorno las tablas que antes compartian todos en `public`.

Hasta ahora desarrollo y produccion apuntaban a la misma base de datos y
compartian a proposito lo que vivia en `public`: `auth_user`, la matriz de
permisos, los catalogos, el directorio de soporte y `django_migrations`. Desde
que cada entorno fija `search_path` a su propio esquema (ver
netowl_web/settings.py) ya no ve `public`, asi que ese contenido tiene que
existir dentro de cada esquema antes de arrancar con el codigo nuevo.

El comando clona cada tabla de `public` en el esquema destino con su estructura
completa —columnas, identidades, secuencias propias, claves primarias, unicas,
CHECK, claves foraneas e indices, con los mismos nombres que en `public`— y
copia sus filas. Conservar los nombres importa: las migraciones futuras que
eliminen o alteren un indice o una restriccion con nombre lo buscan por el.

`django_migrations` se copia como una tabla mas, y es lo que hace que `migrate`
reconozca como aplicadas en el esquema nuevo las migraciones que ya lo estaban.

No toca `public`: solo lee. Todo ocurre en una transaccion, asi que o se copia
todo o no queda nada a medias. Si alguna tabla ya existe en el destino se
detiene sin escribir; no mezcla ni sobreescribe.

`django_session` no se copia: cada esquema ya tiene la suya y las filas de
`public` son sesiones de antes de separar los entornos.

Se ejecuta una vez por entorno, **con el codigo nuevo ya desplegado pero antes
de que nadie entre**, para que ninguna edicion hecha en `public` en el
intervalo se quede atras:

    python manage.py copiar_desde_public --simular   # ensaya y deshace
    python manage.py copiar_desde_public             # esquema de DB_SCHEMA
    python manage.py copiar_desde_public --esquema netowl
"""

import re

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from core.config import DB_SCHEMA

ORIGEN = "public"

# Tablas de `public` que no se copian, con el motivo.
EXCLUIDAS = {
    # Cada esquema ya tiene su propia tabla de sesiones.
    "django_session",
}

# Orden en que se recrean las restricciones: las foraneas al final, cuando ya
# existen las claves primarias y unicas a las que apuntan. 'n' (NOT NULL, desde
# Postgres 18) no aparece: `LIKE` ya las copia.
ORDEN_RESTRICCIONES = ("p", "u", "x", "c", "f")

IDENTIFICADOR = re.compile(r"^[a-z_][a-z0-9_]*$")


def _q(nombre: str) -> str:
    """Entrecomilla un identificador de Postgres."""
    return connection.ops.quote_name(nombre)


class Command(BaseCommand):
    """Clona en el esquema del entorno las tablas compartidas de `public`."""

    help = "Copia las tablas de public (usuarios, permisos, catalogos, migraciones) al esquema del entorno."

    def add_arguments(self, parser):
        parser.add_argument(
            "--esquema",
            default=DB_SCHEMA,
            help="Esquema destino. Por defecto el de DB_SCHEMA.",
        )
        parser.add_argument(
            "--simular",
            action="store_true",
            help="Hace toda la copia y la deshace al final: comprueba que funcionaria sin dejar nada.",
        )

    def handle(self, *args, esquema, simular, **options):
        """Valida el destino y copia todo dentro de una unica transaccion."""
        if not esquema or esquema == ORIGEN:
            raise CommandError("Indique un esquema destino distinto de 'public'.")
        if not IDENTIFICADOR.match(esquema):
            raise CommandError(f"'{esquema}' no es un nombre de esquema valido.")

        with transaction.atomic(), connection.cursor() as cur:
            # Con `pg_catalog` como unico search_path, Postgres escribe todas
            # las definiciones que devuelve cualificadas con `public.`, y eso es
            # lo que permite reescribirlas con seguridad hacia el destino.
            cur.execute("SET LOCAL search_path = pg_catalog")

            tablas = self._tablas_origen(cur)
            if not tablas:
                raise CommandError("No hay tablas que copiar en 'public'.")

            cur.execute("CREATE SCHEMA IF NOT EXISTS " + _q(esquema))
            # pg_class y no information_schema: esta solo lista las tablas sobre
            # las que el usuario tiene privilegios, y un choque no se puede ocultar.
            cur.execute(
                "SELECT relname FROM pg_class "
                "WHERE relnamespace = %s::regnamespace AND relname = ANY(%s)",
                [esquema, tablas],
            )
            chocan = sorted(r[0] for r in cur.fetchall())
            if chocan:
                raise CommandError(
                    f"Estas tablas ya existen en '{esquema}' y no se sobreescriben: "
                    f"{', '.join(chocan)}. ¿Ya se copio este esquema?"
                )

            for tabla in tablas:
                self._crear_tabla(cur, esquema, tabla)
            for tabla in tablas:
                self._copiar_filas(cur, esquema, tabla)
            for tipo in ORDEN_RESTRICCIONES:
                for tabla in tablas:
                    self._crear_restricciones(cur, esquema, tabla, tipo)
            for tabla in tablas:
                self._crear_indices(cur, esquema, tabla)
                self._ajustar_secuencias(cur, esquema, tabla)

            resumen = self._verificar(cur, esquema, tablas)

            if simular:
                transaction.set_rollback(True)

        for tabla, filas in resumen:
            self.stdout.write(f"  {tabla:<40} {filas:>7} filas")
        if simular:
            self.stdout.write(
                self.style.WARNING(
                    f"Simulacion: {len(tablas)} tablas copiarian bien a '{esquema}'. No se guardo nada."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"{len(tablas)} tablas copiadas de 'public' a '{esquema}'.")
            )

    def _tablas_origen(self, cur) -> list[str]:
        """Las tablas de `public` que se copian."""
        cur.execute(
            "SELECT c.relname FROM pg_class c "
            "WHERE c.relnamespace = %s::regnamespace AND c.relkind IN ('r', 'p') "
            "ORDER BY c.relname",
            [ORIGEN],
        )
        return [r[0] for r in cur.fetchall() if r[0] not in EXCLUIDAS]

    def _crear_tabla(self, cur, esquema: str, tabla: str) -> None:
        """Crea la tabla con las columnas, defaults e identidades del origen.

        Las restricciones y los indices se anaden despues, con su nombre
        original. Una columna `serial` sale de `LIKE` apuntando a la secuencia de
        `public`; se le da una propia, o los dos esquemas compartirian contador.
        """
        destino = f"{_q(esquema)}.{_q(tabla)}"
        cur.execute(
            f"CREATE TABLE {destino} (LIKE {_q(ORIGEN)}.{_q(tabla)} "
            "INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED "
            "INCLUDING STORAGE INCLUDING COMMENTS)"
        )

        cur.execute(
            "SELECT a.attname, pg_get_serial_sequence(%s, a.attname) "
            "FROM pg_attribute a "
            "WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped "
            "AND a.attidentity = ''",
            [f"{_q(ORIGEN)}.{_q(tabla)}"] * 2,
        )
        for columna, secuencia in cur.fetchall():
            if not secuencia:
                continue
            nombre = secuencia.split(".")[-1].strip('"')
            nueva = f"{_q(esquema)}.{_q(nombre)}"
            cur.execute(f"CREATE SEQUENCE {nueva} OWNED BY {destino}.{_q(columna)}")
            cur.execute(
                f"ALTER TABLE {destino} ALTER COLUMN {_q(columna)} "
                "SET DEFAULT nextval(%s::regclass)",
                [f"{esquema}.{nombre}"],
            )

    def _copiar_filas(self, cur, esquema: str, tabla: str) -> None:
        """Copia las filas tal cual, ids incluidos."""
        # `LIKE` conserva el orden de las columnas, asi que `SELECT *` encaja.
        # OVERRIDING SYSTEM VALUE conserva los ids aunque la identidad sea ALWAYS.
        cur.execute(
            f"INSERT INTO {_q(esquema)}.{_q(tabla)} OVERRIDING SYSTEM VALUE "
            f"SELECT * FROM {_q(ORIGEN)}.{_q(tabla)}"
        )

    def _crear_restricciones(self, cur, esquema: str, tabla: str, tipo: str) -> None:
        """Recrea las restricciones de un tipo con su nombre original."""
        cur.execute(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conrelid = %s::regclass AND contype = %s ORDER BY conname",
            [f"{_q(ORIGEN)}.{_q(tabla)}", tipo],
        )
        for nombre, definicion in cur.fetchall():
            if tipo == "f":
                definicion = self._redirigir_referencia(definicion, esquema, nombre)
            cur.execute(
                f"ALTER TABLE {_q(esquema)}.{_q(tabla)} ADD CONSTRAINT {_q(nombre)} {definicion}"
            )

    def _redirigir_referencia(self, definicion: str, esquema: str, nombre: str) -> str:
        """Hace que una clave foranea apunte a la tabla del destino, no a la de `public`."""
        nueva, cambios = re.subn(
            r"REFERENCES public\.", f"REFERENCES {_q(esquema)}.", definicion
        )
        if cambios != 1:
            raise CommandError(
                f"La clave foranea '{nombre}' no apunta a una tabla de 'public': {definicion}"
            )
        return nueva

    def _crear_indices(self, cur, esquema: str, tabla: str) -> None:
        """Recrea los indices que no respaldan una restriccion (esos ya existen)."""
        cur.execute(
            "SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i "
            "WHERE i.indrelid = %s::regclass "
            "AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)",
            [f"{_q(ORIGEN)}.{_q(tabla)}"],
        )
        for (definicion,) in cur.fetchall():
            nueva, cambios = re.subn(
                r" ON (ONLY )?public\.", lambda m: f" ON {m.group(1) or ''}{_q(esquema)}.", definicion, count=1
            )
            if cambios != 1:
                raise CommandError(f"No se pudo reescribir el indice: {definicion}")
            cur.execute(nueva)

    def _ajustar_secuencias(self, cur, esquema: str, tabla: str) -> None:
        """Deja cada contador detras del mayor id copiado."""
        destino = f"{_q(esquema)}.{_q(tabla)}"
        cur.execute(
            "SELECT a.attname, pg_get_serial_sequence(%s, a.attname) "
            "FROM pg_attribute a "
            "WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped",
            [destino, destino],
        )
        for columna, secuencia in cur.fetchall():
            if not secuencia:
                continue
            cur.execute(
                f"SELECT setval(%s, COALESCE(MAX({_q(columna)}), 0) + 1, false) FROM {destino}",
                [secuencia],
            )

    def _verificar(self, cur, esquema: str, tablas: list[str]) -> list[tuple[str, int]]:
        """Compara el numero de filas de cada tabla en origen y destino."""
        resumen = []
        for tabla in tablas:
            cur.execute(f"SELECT COUNT(*) FROM {_q(ORIGEN)}.{_q(tabla)}")
            origen = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {_q(esquema)}.{_q(tabla)}")
            destino = cur.fetchone()[0]
            if origen != destino:
                raise CommandError(
                    f"'{tabla}': {origen} filas en public y {destino} en '{esquema}'."
                )
            resumen.append((tabla, destino))
        return resumen
