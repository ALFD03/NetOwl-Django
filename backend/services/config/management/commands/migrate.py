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
"""

from __future__ import annotations

import time

import psycopg2
from django.conf import settings
from django.core.management.commands.migrate import Command as MigrateDjango

# Lo maximo que se espera al otro antes de rendirse, en segundos.
ESPERA_MAXIMA = 600


class Command(MigrateDjango):
    help = MigrateDjango.help + " Toma antes un cerrojo de Postgres por esquema."

    def handle(self, *args, **options):
        alias = options.get("database") or "default"
        db = settings.DATABASES[alias]
        if db["ENGINE"] != "django.db.backends.postgresql":
            return super().handle(*args, **options)

        clave = f"netowl_migrate_{settings.DB_SCHEMA}"
        conexion = psycopg2.connect(
            dbname=db["NAME"], user=db["USER"], password=db["PASSWORD"],
            host=db["HOST"], port=db["PORT"] or None,
            application_name="netowl-migrate-lock",
            **{k: v for k, v in (db.get("OPTIONS") or {}).items() if k in ("sslmode", "sslrootcert", "connect_timeout")},
        )
        conexion.autocommit = True
        try:
            with conexion.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (clave,))
                if not cur.fetchone()[0]:
                    self.stdout.write(f"Otro proceso esta migrando {settings.DB_SCHEMA}; esperando a que termine...")
                    inicio = time.monotonic()
                    while True:
                        cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (clave,))
                        if cur.fetchone()[0]:
                            break
                        if time.monotonic() - inicio > ESPERA_MAXIMA:
                            raise SystemExit(
                                f"Se esperaron {ESPERA_MAXIMA} s al cerrojo de migracion de {settings.DB_SCHEMA}."
                            )
                        time.sleep(2)
            return super().handle(*args, **options)
        finally:
            conexion.close()  # suelta el cerrojo
