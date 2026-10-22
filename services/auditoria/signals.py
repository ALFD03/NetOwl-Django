"""Entradas, salidas y credenciales incorrectas, desde las senales de Django.

Se anotan aqui y no en el middleware porque solo `authenticate` sabe si las
credenciales eran buenas, y porque el cuerpo del login lleva la contrasena.
"""

from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver

from .models import RegistroAuditoria
from .registro import registrar


@receiver(user_logged_in)
def anotar_entrada(sender, request, user, **kwargs):
    registrar(request, modulo="config", accion="login", usuario=user, descripcion="Inicio de sesión.")


@receiver(user_logged_out)
def anotar_salida(sender, request, user, **kwargs):
    if user is None:
        return
    registrar(request, modulo="config", accion="logout", usuario=user, descripcion="Cierre de sesión.")


@receiver(user_login_failed)
def anotar_fallo(sender, credentials, request=None, **kwargs):
    # `credentials` llega ya con la contrasena tapada por Django; solo se
    # guarda el nombre intentado.
    nombre = str(credentials.get("username") or "")[:150]
    registrar(
        request,
        modulo="config",
        accion="login_fallido",
        descripcion="Credenciales incorrectas.",
        objeto=f"username={nombre}" if nombre else "",
        resultado=RegistroAuditoria.DENEGADO,
    )
