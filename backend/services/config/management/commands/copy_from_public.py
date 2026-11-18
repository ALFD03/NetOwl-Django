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

    python manage.py copy_from_public --dry-run   # ensaya y deshace
    python manage.py copy_from_public             # esquema de DB_SCHEMA
    python manage.py copy_from_public --schema netowl
"""

import re

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from core.config import DB_SCHEMA

SOURCE = "public"

# Tablas de `public` que no se copian, con el motivo.
EXCLUDED = {
    # Cada esquema ya tiene su propia tabla de sesiones.
    "django_session",
}

# Orden en que se recrean las restricciones: las foraneas al final, cuando ya
# existen las claves primarias y unicas a las que apuntan. 'n' (NOT NULL, desde
# Postgres 18) no aparece: `LIKE` ya las copia.
CONSTRAINT_ORDER = ("p", "u", "x", "c", "f")

IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


def _q(name: str) -> str:
    """Entrecomilla un identificador de Postgres."""
    return connection.ops.quote_name(name)


class Command(BaseCommand):
    """Clona en el esquema del entorno las tablas compartidas de `public`."""

    help = "Copia las tablas de public (usuarios, permisos, catalogos, migraciones) al esquema del entorno."

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            default=DB_SCHEMA,
            help="Esquema destino. Por defecto el de DB_SCHEMA.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Hace toda la copia y la deshace al final: comprueba que funcionaria sin dejar nada.",
        )

    def handle(self, *args, schema, dry_run, **options):
        """Valida el destino y copia todo dentro de una unica transaccion."""
        if not schema or schema == SOURCE:
            raise CommandError("Indique un esquema destino distinto de 'public'.")
        if not IDENTIFIER.match(schema):
            raise CommandError(f"'{schema}' no es un nombre de esquema valido.")

        with transaction.atomic(), connection.cursor() as cur:
            # Con `pg_catalog` como unico search_path, Postgres escribe todas
            # las definiciones que devuelve cualificadas con `public.`, y eso es
            # lo que permite reescribirlas con seguridad hacia el destino.
            cur.execute("SET LOCAL search_path = pg_catalog")

            tables = self._source_tables(cur)
            if not tables:
                raise CommandError("No hay tablas que copiar en 'public'.")

            cur.execute("CREATE SCHEMA IF NOT EXISTS " + _q(schema))
            # pg_class y no information_schema: esta solo lista las tablas sobre
            # las que el usuario tiene privilegios, y un choque no se puede ocultar.
            cur.execute(
                "SELECT relname FROM pg_class "
                "WHERE relnamespace = %s::regnamespace AND relname = ANY(%s)",
                [schema, tables],
            )
            clash = sorted(r[0] for r in cur.fetchall())
            if clash:
                raise CommandError(
                    f"Estas tablas ya existen en '{schema}' y no se sobreescriben: "
                    f"{', '.join(clash)}. ¿Ya se copio este esquema?"
                )

            for table in tables:
                self._create_table(cur, schema, table)
            for table in tables:
                self._copy_rows(cur, schema, table)
            for kind in CONSTRAINT_ORDER:
                for table in tables:
                    self._create_constraints(cur, schema, table, kind)
            for table in tables:
                self._create_indexes(cur, schema, table)
                self._adjust_sequences(cur, schema, table)

            summary = self._verify(cur, schema, tables)

            if dry_run:
                transaction.set_rollback(True)

        for table, rows in summary:
            self.stdout.write(f"  {table:<40} {rows:>7} filas")
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"Simulacion: {len(tables)} tablas copiarian bien a '{schema}'. No se guardo nada."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"{len(tables)} tablas copiadas de 'public' a '{schema}'.")
            )

    def _source_tables(self, cur) -> list[str]:
        """Las tablas de `public` que se copian."""
        cur.execute(
            "SELECT c.relname FROM pg_class c "
            "WHERE c.relnamespace = %s::regnamespace AND c.relkind IN ('r', 'p') "
            "ORDER BY c.relname",
            [SOURCE],
        )
        return [r[0] for r in cur.fetchall() if r[0] not in EXCLUDED]

    def _create_table(self, cur, schema: str, table: str) -> None:
        """Crea la tabla con las columnas, defaults e identidades del origen.

        Las restricciones y los indices se anaden despues, con su nombre
        original. Una columna `serial` sale de `LIKE` apuntando a la secuencia de
        `public`; se le da una propia, o los dos esquemas compartirian contador.
        """
        target = f"{_q(schema)}.{_q(table)}"
        cur.execute(
            f"CREATE TABLE {target} (LIKE {_q(SOURCE)}.{_q(table)} "
            "INCLUDING DEFAULTS INCLUDING IDENTITY INCLUDING GENERATED "
            "INCLUDING STORAGE INCLUDING COMMENTS)"
        )

        cur.execute(
            "SELECT a.attname, pg_get_serial_sequence(%s, a.attname) "
            "FROM pg_attribute a "
            "WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped "
            "AND a.attidentity = ''",
            [f"{_q(SOURCE)}.{_q(table)}"] * 2,
        )
        for column, sequence in cur.fetchall():
            if not sequence:
                continue
            name = sequence.split(".")[-1].strip('"')
            new = f"{_q(schema)}.{_q(name)}"
            cur.execute(f"CREATE SEQUENCE {new} OWNED BY {target}.{_q(column)}")
            cur.execute(
                f"ALTER TABLE {target} ALTER COLUMN {_q(column)} "
                "SET DEFAULT nextval(%s::regclass)",
                [f"{schema}.{name}"],
            )

    def _copy_rows(self, cur, schema: str, table: str) -> None:
        """Copia las filas tal cual, ids incluidos."""
        # `LIKE` conserva el orden de las columnas, asi que `SELECT *` encaja.
        # OVERRIDING SYSTEM VALUE conserva los ids aunque la identidad sea ALWAYS.
        cur.execute(
            f"INSERT INTO {_q(schema)}.{_q(table)} OVERRIDING SYSTEM VALUE "
            f"SELECT * FROM {_q(SOURCE)}.{_q(table)}"
        )

    def _create_constraints(self, cur, schema: str, table: str, kind: str) -> None:
        """Recrea las restricciones de un tipo con su nombre original."""
        cur.execute(
            "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conrelid = %s::regclass AND contype = %s ORDER BY conname",
            [f"{_q(SOURCE)}.{_q(table)}", kind],
        )
        for name, definition in cur.fetchall():
            if kind == "f":
                definition = self._redirect_reference(definition, schema, name)
            cur.execute(
                f"ALTER TABLE {_q(schema)}.{_q(table)} ADD CONSTRAINT {_q(name)} {definition}"
            )

    def _redirect_reference(self, definition: str, schema: str, name: str) -> str:
        """Hace que una clave foranea apunte a la tabla del destino, no a la de `public`."""
        new, changes = re.subn(
            r"REFERENCES public\.", f"REFERENCES {_q(schema)}.", definition
        )
        if changes != 1:
            raise CommandError(
                f"La clave foranea '{name}' no apunta a una tabla de 'public': {definition}"
            )
        return new

    def _create_indexes(self, cur, schema: str, table: str) -> None:
        """Recrea los indices que no respaldan una restriccion (esos ya existen)."""
        cur.execute(
            "SELECT pg_get_indexdef(i.indexrelid) FROM pg_index i "
            "WHERE i.indrelid = %s::regclass "
            "AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid)",
            [f"{_q(SOURCE)}.{_q(table)}"],
        )
        for (definition,) in cur.fetchall():
            new, changes = re.subn(
                r" ON (ONLY )?public\.", lambda m: f" ON {m.group(1) or ''}{_q(schema)}.", definition, count=1
            )
            if changes != 1:
                raise CommandError(f"No se pudo reescribir el indice: {definition}")
            cur.execute(new)

    def _adjust_sequences(self, cur, schema: str, table: str) -> None:
        """Deja cada contador detras del mayor id copiado."""
        target = f"{_q(schema)}.{_q(table)}"
        cur.execute(
            "SELECT a.attname, pg_get_serial_sequence(%s, a.attname) "
            "FROM pg_attribute a "
            "WHERE a.attrelid = %s::regclass AND a.attnum > 0 AND NOT a.attisdropped",
            [target, target],
        )
        for column, sequence in cur.fetchall():
            if not sequence:
                continue
            cur.execute(
                f"SELECT setval(%s, COALESCE(MAX({_q(column)}), 0) + 1, false) FROM {target}",
                [sequence],
            )

    def _verify(self, cur, schema: str, tables: list[str]) -> list[tuple[str, int]]:
        """Compara el numero de filas de cada tabla en origen y destino."""
        summary = []
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {_q(SOURCE)}.{_q(table)}")
            source = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {_q(schema)}.{_q(table)}")
            target = cur.fetchone()[0]
            if source != target:
                raise CommandError(
                    f"'{table}': {source} filas en public y {target} en '{schema}'."
                )
            summary.append((table, target))
        return summary
