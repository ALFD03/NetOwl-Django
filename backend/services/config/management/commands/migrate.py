"""`migrate` con un cerrojo de Postgres por esquema.

`entrypoint.sh` migra al arrancar y el worker lo salta con `SKIP_MIGRATE=1`,
pero eso depende de que cada compose lo declare, y no todos lo hacen: si dos
contenedores arrancan a la vez, los dos migran el mismo esquema y el segundo
choca con tablas a medio crear. Este comando sustituye al de Django (las apps
del proyecto ganan a `django.core`) y toma antes un `pg_advisory_lock` con la
clave del esquema: el segundo espera a que el primero acabe y entonces no
encuentra nada pendiente. Esquemas distintos no se esperan entre si.

El cerrojo es de sesion y se toma en una conexion propia, no en la que usa la
migracion: asi no queda dentro de ninguna de sus transacciones, y si el
proceso muere Postgres lo suelta solo al cerrarse la conexion.

Con el cerrojo aun tomado, pone al dia las tablas de la analitica declaradas
en `services/*/analytics/tables.py` (`core.tables.sync_all`): crea las que
faltan y ajusta columnas, tipos e indices.
"""

from __future__ import annotations

import time

import psycopg2
from django.conf import settings
from django.core.management.commands.migrate import Command as MigrateDjango

from core.database import DBConnector
from core.tables import sync_all

# Lo maximo que se espera al otro antes de rendirse, en segundos.
MAX_WAIT = 600


class Command(MigrateDjango):
    help = MigrateDjango.help + " Toma antes un cerrojo de Postgres por esquema."

    def handle(self, *args, **options):
        alias = options.get("database") or "default"
        db = settings.DATABASES[alias]
        if db["ENGINE"] != "django.db.backends.postgresql":
            return super().handle(*args, **options)

        key = f"netowl_migrate_{settings.DB_SCHEMA}"
        conn = psycopg2.connect(
            dbname=db["NAME"], user=db["USER"], password=db["PASSWORD"],
            host=db["HOST"], port=db["PORT"] or None,
            application_name="netowl-migrate-lock",
            **{k: v for k, v in (db.get("OPTIONS") or {}).items() if k in ("sslmode", "sslrootcert", "connect_timeout")},
        )
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (key,))
                if not cur.fetchone()[0]:
                    self.stdout.write(f"Otro proceso esta migrando {settings.DB_SCHEMA}; esperando a que termine...")
                    start = time.monotonic()
                    while True:
                        cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (key,))
                        if cur.fetchone()[0]:
                            break
                        if time.monotonic() - start > MAX_WAIT:
                            raise SystemExit(
                                f"Se esperaron {MAX_WAIT} s al cerrojo de migracion de {settings.DB_SCHEMA}."
                            )
                        time.sleep(2)
            result = super().handle(*args, **options)
            if not (options.get("plan") or options.get("check_unapplied")):
                synced = sync_all(DBConnector())
                if options.get("verbosity", 1) >= 1:
                    self.stdout.write(f"Tablas de la analitica al dia: {len(synced)}.")
            return result
        finally:
            conn.close()  # suelta el cerrojo
