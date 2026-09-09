#!/usr/bin/env python
"""Muestra las sesiones vivas y a que entorno pertenece cada una.

`django_session` solo guarda `session_key`, `session_data` y `expire_date`: no
hay ninguna columna que diga de que entorno es una fila, y ya no hace falta.
Cada entorno tiene su propia tabla dentro de su esquema, porque `search_path`
apunta a DB_SCHEMA (ver DATABASES en netowl_web/settings.py). Antes las
compartian todas en `public`, y por eso entrar en un entorno cerraba la sesion
del otro.

Lo que si se puede ver es el contenido: `session_data` esta firmado y
serializado, y al decodificarlo aparece `_auth_user_id`. Este script lo hace
para todas las sesiones vivas y cruza el id con la tabla de usuarios.

    .venv/bin/python scripts/sesiones.py              # listado
    .venv/bin/python scripts/sesiones.py --guardar    # deja una foto en /tmp
    .venv/bin/python scripts/sesiones.py --comparar   # dice que cambio desde la foto
    .venv/bin/python scripts/sesiones.py --vigilar CLAVE   # sigue una sesion concreta

`--guardar` y `--comparar` existen para responder una pregunta concreta: cuando
entrar en un entorno parece cerrar la sesion del otro, .es que alguien borra la
fila de la base de datos, o es que el navegador dejo de mandar la cookie? Se
hace una foto, se inicia sesion en el otro entorno y se compara: si la fila
sigue viva, la sesion no se cerro en el servidor y el problema esta en el
cliente.

`--comparar` por si solo no basta para acusar a nadie: cada `login()` llama a
`cycle_key()`, que borra la fila anterior de esa misma sesion, asi que dos
inicios de sesion legitimos —uno por entorno— tambien dejan dos filas
desaparecidas. Para eso esta `--vigilar`: se copia el valor de la cookie de
sesion del entorno que se cree afectado (DevTools -> Application -> Cookies) y
se comprueba esa clave en concreto antes y despues de tocar el otro entorno.
Si esa fila desaparece sin que nadie haya entrado ahi, la interferencia existe.

Necesita Vault y base de datos, como cualquier cosa que importe settings.
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import django  # noqa: E402

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "netowl_web.settings")
django.setup()

from django.conf import settings  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.sessions.models import Session  # noqa: E402
from django.utils import timezone  # noqa: E402

FOTO = Path("/tmp/netowl_sesiones.json")


def leer_vivas():
    """Devuelve {session_key: (usuario, caducidad)} de las sesiones no caducadas."""
    User = get_user_model()
    vivas = {}
    for sesion in Session.objects.filter(expire_date__gt=timezone.now()).order_by("expire_date"):
        uid = sesion.get_decoded().get("_auth_user_id")
        if uid:
            usuario = (
                User.objects.filter(pk=uid).values_list("username", flat=True).first()
                or f"(id {uid}, borrado)"
            )
        else:
            usuario = "(anonima)"
        vivas[sesion.session_key] = (usuario, sesion.expire_date.isoformat())
    return vivas


def guardar() -> None:
    vivas = leer_vivas()
    FOTO.write_text(json.dumps(vivas, indent=2))
    print(f"Guardadas {len(vivas)} sesiones vivas en {FOTO}.")
    print("Ahora inicie sesion en el otro entorno y ejecute: scripts/sesiones.py --comparar")


def comparar() -> None:
    if not FOTO.exists():
        sys.exit(f"No hay foto previa en {FOTO}. Ejecute primero --guardar.")
    antes = json.loads(FOTO.read_text())
    ahora = leer_vivas()

    desaparecidas = [k for k in antes if k not in ahora]
    nuevas = [k for k in ahora if k not in antes]

    for key in nuevas:
        print(f"  NUEVA       {key}  {ahora[key][0]}")
    for key in desaparecidas:
        print(f"  DESAPARECIO {key}  {antes[key][0]}")
    if not nuevas and not desaparecidas:
        print("  (sin cambios)")

    print()
    if desaparecidas:
        print(
            "Hay sesiones que ya no estan en la tabla. El cierre ocurre en el\n"
            "SERVIDOR: algo las esta borrando o caducando, no es cosa del navegador."
        )
    else:
        print(
            "Ninguna sesion desaparecio de la tabla. Si aun asi el otro entorno\n"
            "pide login, su sesion sigue viva en la base de datos y lo que falla\n"
            "es el CLIENTE: el navegador no esta mandando su cookie de sesion."
        )


def vigilar(clave: str) -> None:
    """Informa del estado de una sesion concreta, la de la cookie del navegador."""
    User = get_user_model()
    sesion = Session.objects.filter(session_key=clave).first()
    if sesion is None:
        print(f"{clave}\n  -> NO EXISTE: la fila fue borrada de la tabla.")
        return

    uid = sesion.get_decoded().get("_auth_user_id")
    usuario = "(anonima)"
    if uid:
        usuario = (
            User.objects.filter(pk=uid).values_list("username", flat=True).first()
            or f"(id {uid}, borrado)"
        )
    vigente = sesion.expire_date > timezone.now()
    caduca = timezone.localtime(sesion.expire_date).strftime("%Y-%m-%d %H:%M")
    estado = "VIGENTE" if vigente else "CADUCADA"
    print(f"{clave}\n  -> {estado}, usuario {usuario}, caduca {caduca}")


def main() -> None:
    print(f"Entorno            : DB_SCHEMA={os.getenv('DB_SCHEMA', 'public')}")
    print(f"Cookie de sesion   : {settings.SESSION_COOKIE_NAME}")
    print(f"Cookie CSRF        : {settings.CSRF_COOKIE_NAME}")
    print(
        "\nSolo salen las sesiones de este entorno: cada esquema tiene su\n"
        "propia django_session.\n"
    )

    User = get_user_model()
    ahora = timezone.now()
    vivas = Session.objects.filter(expire_date__gt=ahora).order_by("expire_date")

    print(f"{'session_key':<34} {'usuario':<24} {'caduca'}")
    print("-" * 74)
    for sesion in vivas:
        uid = sesion.get_decoded().get("_auth_user_id")
        if uid:
            usuario = (
                User.objects.filter(pk=uid).values_list("username", flat=True).first()
                or f"(id {uid}, borrado)"
            )
        else:
            usuario = "(anonima)"
        caduca = timezone.localtime(sesion.expire_date).strftime("%Y-%m-%d %H:%M")
        print(f"{sesion.session_key:<34} {usuario:<24} {caduca}")

    caducadas = Session.objects.filter(expire_date__lte=ahora).count()
    print("-" * 74)
    print(f"Vivas: {vivas.count()}   Caducadas sin limpiar: {caducadas}")
    if caducadas:
        print("Para borrar las caducadas: python manage.py clearsessions")


if __name__ == "__main__":
    if "--guardar" in sys.argv:
        guardar()
    elif "--comparar" in sys.argv:
        comparar()
    elif "--vigilar" in sys.argv:
        i = sys.argv.index("--vigilar")
        if i + 1 >= len(sys.argv):
            sys.exit("Uso: scripts/sesiones.py --vigilar <session_key>")
        vigilar(sys.argv[i + 1])
    else:
        main()
