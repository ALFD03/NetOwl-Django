"""Crea las tablas ORM de `imports` en el esquema del entorno si no existen.

`ImportActionLog` y `AnalysisJob` cualifican su `db_table` con DB_SCHEMA, asi
que cada entorno tiene las suyas. Sus migraciones, en cambio, quedan anotadas
en `django_migrations`, que vive en `public` y la comparten todos los entornos
apuntados a esta base de datos: al aplicarlas en el primer esquema se marcan
como aplicadas para todos, y el siguiente entorno se queda sin tablas para
siempre —`migrate` dice que no hay nada pendiente—. El sintoma es un 500 al
lanzar cualquier analisis: `relation "<esquema>.analysis_jobs" does not exist`.

Es el mismo problema que resuelve `preparar_sesiones` con la tabla de sesiones,
y se resuelve igual: fuera de las migraciones, de forma idempotente y en cada
arranque. Lo llaman `entrypoint.sh` y `scripts/dev.sh`.

El DDL no se escribe a mano: lo genera el `schema_editor` a partir del modelo,
de modo que anadir un campo no obliga a tocar este comando.

    python manage.py preparar_imports
"""

from django.core.management.base import BaseCommand
from django.db import connection

from core.config import DB_SCHEMA
from services.imports.models import AnalysisJob, ImportActionLog

MODELOS = (ImportActionLog, AnalysisJob)


class Command(BaseCommand):
    """Crea `import_action_logs` y `analysis_jobs` en el esquema del entorno."""

    help = "Crea las tablas de imports del esquema del entorno si no existen."

    def handle(self, *args, **options):
        """Crea lo que falte, generando el DDL desde los propios modelos."""
        esquema = DB_SCHEMA or "public"

        with connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{esquema}"')

        creadas = []
        for modelo in MODELOS:
            # `db_table` viene cualificado y entrecomillado por el modelo; para
            # preguntarle a information_schema hace falta el nombre pelado.
            tabla = modelo._meta.db_table.split(".")[-1].strip('"')
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = %s AND table_name = %s
                    """,
                    [esquema, tabla],
                )
                if cursor.fetchone():
                    continue

            with connection.schema_editor() as editor:
                editor.create_model(modelo)
            creadas.append(tabla)

        if creadas:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Tablas creadas en el esquema '{esquema}': {', '.join(creadas)}."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Tablas de imports ya listas en '{esquema}'.")
            )
