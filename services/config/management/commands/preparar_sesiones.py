"""Crea la tabla de sesiones del entorno si no existe.

La tabla de sesiones esta cualificada con DB_SCHEMA (ver `SesionEntorno` en
services/config/models.py), asi que cada entorno tiene la suya. No se puede
crear con una migracion: `django_migrations` vive en `public` y la comparten
todos los entornos apuntados a esta base de datos, de modo que la migracion se
marcaria como aplicada al ejecutarla en el primero y el segundo se quedaria sin
tabla, fallando en el primer intento de login.

El comando es idempotente —`CREATE TABLE IF NOT EXISTS`— y esta pensado para
ejecutarse en cada arranque, antes de servir peticiones. Lo llaman
`entrypoint.sh` y `scripts/dev.sh`.

    python manage.py preparar_sesiones
"""

from django.core.management.base import BaseCommand
from django.db import connection

from core.config import DB_SCHEMA
from services.config.models import SesionEntorno


class Command(BaseCommand):
    """Crea la tabla de sesiones del esquema actual si todavia no existe."""

    help = "Crea la tabla de sesiones del esquema del entorno si no existe."

    def handle(self, *args, **options):
        """Crea el esquema y la tabla, con la misma forma que `django.contrib.sessions`."""
        esquema = DB_SCHEMA or "public"
        # `db_table` ya viene cualificado y entrecomillado por el modelo, asi
        # que sirve tal cual dentro del DDL.
        tabla = SesionEntorno._meta.db_table

        with connection.cursor() as cursor:
            cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{esquema}"')
            # Misma forma que la tabla que crea django.contrib.sessions: si
            # algun dia se vuelve a la tabla compartida, los datos encajan.
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {tabla} (
                    session_key  varchar(40)  NOT NULL PRIMARY KEY,
                    session_data text         NOT NULL,
                    expire_date  timestamptz  NOT NULL
                )
                """
            )
            # El barrido de sesiones caducadas filtra por expire_date.
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS "
                f'"django_session_expire_date_idx" ON {tabla} (expire_date)'
            )

        self.stdout.write(
            self.style.SUCCESS(f"Tabla de sesiones lista en el esquema '{esquema}'.")
        )
