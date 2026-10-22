"""Revisa lo que el codigo no puede arreglar y conviene saber del entorno.

Solo lee: no cambia nada, ni en la base de datos ni en Redis. Lo que reporta
se corrige en la maquina (Postgres, Redis, Vault), no aqui:

- si la conexion a Postgres va cifrada (`pg_stat_ssl`);
- si el rol de la aplicacion es superusuario o puede crear roles o bases;
- a que otros esquemas de la misma base puede entrar ese rol: desarrollo y
  produccion comparten base y se separan solo por esquema, asi que un rol
  que ve los dos deja que un error en desarrollo alcance produccion;
- si Redis acepta ordenes sin contrasena y si va por TLS;
- `DEBUG` y las cookies seguras.

`--estricto` termina con codigo 1 si hay algun aviso, para usarlo en un
despliegue.
"""

from __future__ import annotations

from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection

ESQUEMAS_DEL_SISTEMA = ("pg_catalog", "information_schema", "pg_toast")


class Command(BaseCommand):
    help = "Revisa el cifrado de la base, los privilegios del rol, Redis y DEBUG. Solo lee."

    def add_arguments(self, parser):
        parser.add_argument("--estricto", action="store_true", help="Codigo de salida 1 si hay avisos.")

    def handle(self, *args, **options):
        self.avisos = 0
        self._base_de_datos()
        self._redis()
        self._django()
        if self.avisos:
            self.stdout.write(self.style.WARNING(f"\n{self.avisos} aviso(s)."))
            if options["estricto"]:
                raise SystemExit(1)
        else:
            self.stdout.write(self.style.SUCCESS("\nSin avisos."))

    def _ok(self, texto):
        self.stdout.write(self.style.SUCCESS(f"  OK     {texto}"))

    def _aviso(self, texto):
        self.avisos += 1
        self.stdout.write(self.style.WARNING(f"  AVISO  {texto}"))

    def _base_de_datos(self):
        self.stdout.write("Postgres")
        with connection.cursor() as cur:
            cur.execute("SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()")
            fila = cur.fetchone()
            if fila and fila[0]:
                self._ok(f"conexion cifrada ({fila[1]})")
            else:
                self._aviso("la conexion NO va cifrada: las credenciales y los datos viajan en claro. "
                            "Se activa con ssl=on en el servidor y sslmode=require en DBCONFIG.")

            cur.execute("SELECT current_user, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user")
            usuario, superusuario, crea_roles, crea_bases = cur.fetchone()
            if superusuario:
                self._aviso(f"el rol {usuario} es SUPERUSUARIO de Postgres: puede leer y borrar todo el servidor.")
            else:
                self._ok(f"el rol {usuario} no es superusuario")
            if crea_roles or crea_bases:
                self._aviso(f"el rol {usuario} puede crear {'roles' if crea_roles else ''}"
                            f"{' y ' if crea_roles and crea_bases else ''}{'bases' if crea_bases else ''}.")

            cur.execute(
                """
                SELECT nspname FROM pg_namespace
                WHERE nspname NOT IN %s AND nspname NOT LIKE 'pg_temp%%' AND nspname NOT LIKE 'pg_toast%%'
                  AND nspname <> %s AND nspname <> 'public'
                  AND has_schema_privilege(current_user, nspname, 'USAGE')
                ORDER BY nspname
                """,
                (ESQUEMAS_DEL_SISTEMA, settings.DB_SCHEMA),
            )
            otros = [f[0] for f in cur.fetchall()]
            if otros:
                self._aviso(f"el rol entra tambien en otros esquemas: {', '.join(otros)}. "
                            "Un rol por entorno, con permisos solo sobre su esquema, impide que "
                            "desarrollo toque produccion.")
            else:
                self._ok(f"el rol solo entra en su esquema ({settings.DB_SCHEMA})")

    def _redis(self):
        self.stdout.write("Redis")
        url = urlparse(settings.REDIS_URL)
        if url.scheme == "rediss":
            self._ok("conexion por TLS")
        else:
            self._aviso("Redis va sin TLS (redis://).")
        try:
            import redis
        except ImportError:
            self._aviso("no se pudo importar el cliente de Redis.")
            return
        sin_credenciales = url._replace(netloc=f"{url.hostname}:{url.port or 6379}").geturl()
        try:
            redis.Redis.from_url(sin_credenciales, socket_connect_timeout=3).ping()
        except redis.AuthenticationError:
            self._ok("Redis exige contrasena")
        except redis.ResponseError as e:
            if "NOAUTH" in str(e):
                self._ok("Redis exige contrasena")
            else:
                self._aviso(f"respuesta inesperada de Redis: {e}")
        except redis.ConnectionError:
            self._aviso(f"no se pudo conectar a Redis en {url.hostname}:{url.port or 6379} (¿tunel cerrado?).")
        else:
            self._aviso("Redis acepta ordenes SIN contrasena: cualquiera que llegue al puerto puede leer la "
                        "cola, los cerrojos y los contadores de intentos. Se activa con requirepass y "
                        "la contrasena en REDIS_URL.")
            if url.password is None:
                self._aviso("REDIS_URL no lleva contrasena.")

    def _django(self):
        self.stdout.write("Django")
        if settings.DEBUG:
            self._aviso("DEBUG esta activo: un error muestra el codigo y la configuracion a quien lo provoque.")
        else:
            self._ok("DEBUG desactivado")
        for nombre in ("SESSION_COOKIE_SECURE", "CSRF_COOKIE_SECURE"):
            if getattr(settings, nombre, False):
                self._ok(f"{nombre} activo")
            else:
                self._aviso(f"{nombre} desactivado: la cookie viaja tambien por HTTP sin cifrar.")
