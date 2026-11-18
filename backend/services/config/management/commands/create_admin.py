"""Crea el primer administrador del sistema.

Sustituye a la vista publica `/auth/setup/`. Aquella se guardaba unicamente con
`User.objects.count() == 0`, lo que dejaba dos agujeros: la comprobacion y la
creacion no eran atomicas (dos peticiones simultaneas en un despliegue recien
levantado podian crear dos superusuarios), y el alta se **reabria** si la tabla
de usuarios se quedaba vacia alguna vez, entregando el superusuario a quien
llegase primero por la red.

Crear al primer administrador es una operacion de despliegue, no una pantalla:
va por la misma via que `migrate`.

    python manage.py create_admin --username admin
    python manage.py create_admin --username admin --password '...'   # no interactivo

`auth_user` vive en el esquema del entorno (DB_SCHEMA): cada entorno tiene
sus propias cuentas y hay que crear el administrador en cada uno.
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
        parser.add_argument("--username", required=True, help="Nombre de la cuenta.")
        parser.add_argument(
            "--password",
            help="Contraseña. Si se omite, se pide por teclado sin mostrarla.",
        )

    def handle(self, *args, **options):
        """Valida, crea la cuenta y le concede la matriz entera."""
        user = options["username"].strip()
        if not user:
            raise CommandError("El nombre de usuario no puede estar vacío.")

        if User.objects.filter(username=user).exists():
            raise CommandError(f"La cuenta '{user}' ya existe.")

        key = options.get("password")
        if not key:
            key = getpass("Contraseña: ")
            if key != getpass("Repita la contraseña: "):
                raise CommandError("Las contraseñas no coinciden.")

        # Los mismos validadores que aplican las vistas de administracion
        # (AUTH_PASSWORD_VALIDATORS en netowl_web/settings.py).
        try:
            validate_password(key, user=User(username=user))
        except ValidationError as e:
            raise CommandError(" ".join(e.messages)) from None

        with transaction.atomic():
            account = User.objects.create_superuser(username=user, password=key)
            profile = account.profile
            profile.role = "admin"
            profile.group = None
            for field in PERMISSION_FIELDS:
                setattr(profile, field, True)
            profile.save()

        self.stdout.write(
            self.style.SUCCESS(f"Administrador '{user}' creado con la matriz completa.")
        )
