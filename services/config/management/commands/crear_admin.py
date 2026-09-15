"""Crea el primer administrador del sistema.

Sustituye a la vista publica `/auth/setup/`. Aquella se guardaba unicamente con
`User.objects.count() == 0`, lo que dejaba dos agujeros: la comprobacion y la
creacion no eran atomicas (dos peticiones simultaneas en un despliegue recien
levantado podian crear dos superusuarios), y el alta se **reabria** si la tabla
de usuarios se quedaba vacia alguna vez, entregando el superusuario a quien
llegase primero por la red.

Crear al primer administrador es una operacion de despliegue, no una pantalla:
va por la misma via que `preparar_sesiones` y `preparar_imports`.

    python manage.py crear_admin --usuario admin
    python manage.py crear_admin --usuario admin --clave '...'   # no interactivo

Recuerde que `auth_user` vive en `public` y la comparten todos los entornos
(ver CLAUDE.md): basta con crear la cuenta una vez.
"""

from getpass import getpass

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from services.config.models import PERMISSION_FIELDS


class Command(BaseCommand):
    """Alta del primer administrador, con la matriz de permisos completa."""

    help = "Crea un administrador (superusuario) con todos los permisos concedidos."

    def add_arguments(self, parser):
        parser.add_argument("--usuario", required=True, help="Nombre de la cuenta.")
        parser.add_argument(
            "--clave",
            help="Contraseña. Si se omite, se pide por teclado sin mostrarla.",
        )

    def handle(self, *args, **options):
        """Valida, crea la cuenta y le concede la matriz entera."""
        usuario = options["usuario"].strip()
        if not usuario:
            raise CommandError("El nombre de usuario no puede estar vacío.")

        if User.objects.filter(username=usuario).exists():
            raise CommandError(f"La cuenta '{usuario}' ya existe.")

        clave = options.get("clave")
        if not clave:
            clave = getpass("Contraseña: ")
            if clave != getpass("Repita la contraseña: "):
                raise CommandError("Las contraseñas no coinciden.")

        # Los mismos validadores que aplican las vistas de administracion
        # (AUTH_PASSWORD_VALIDATORS en netowl_web/settings.py).
        try:
            validate_password(clave, user=User(username=usuario))
        except ValidationError as e:
            raise CommandError(" ".join(e.messages)) from None

        with transaction.atomic():
            cuenta = User.objects.create_superuser(username=usuario, password=clave)
            perfil = cuenta.profile
            perfil.role = "admin"
            perfil.group = None
            for campo in PERMISSION_FIELDS:
                setattr(perfil, campo, True)
            perfil.save()

        self.stdout.write(
            self.style.SUCCESS(f"Administrador '{usuario}' creado con la matriz completa.")
        )
