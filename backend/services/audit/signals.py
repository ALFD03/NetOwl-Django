"""Entradas, salidas y credenciales incorrectas, desde las señales de Django."""

from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver

from .log import record
from .models import AuditLog


@receiver(user_logged_in)
def log_login(sender, request, user, **kwargs):
    record(request, module="config", action="login", user=user, description="Inicio de sesión.")


@receiver(user_logged_out)
def log_logout(sender, request, user, **kwargs):
    if user is None:
        return
    record(request, module="config", action="logout", user=user, description="Cierre de sesión.")


@receiver(user_login_failed)
def log_login_failed(sender, credentials, request=None, **kwargs):
    # Django ya tapa la contraseña en `credentials`; solo se guarda el nombre.
    username = str(credentials.get("username") or "")[:150]
    record(
        request,
        module="config",
        action="login_fallido",
        description="Credenciales incorrectas.",
        target=f"username={username}" if username else "",
        outcome=AuditLog.DENIED,
    )
