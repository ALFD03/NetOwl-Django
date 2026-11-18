"""Inicio de sesión con límite de intentos fallidos, y la identidad que ve el cliente.

Lo usan la pantalla de entrada y `POST /api/auth/login/`.
"""

from __future__ import annotations

import logging

from django.contrib.auth import authenticate, login
from django_ratelimit.core import get_usage

from netowl_web.ratelimit import ip_cliente, user_login
from services.audit.log import record
from services.audit.models import AuditLog

from .models import PERMISSION_FIELDS
from .units import unit_scope

logger = logging.getLogger(__name__)

# Solo cuentan los intentos fallidos.
LOGIN_LIMITS = (
    # Por cuenta: ataque dirigido a un usuario.
    {"group": "login-usuario", "key": user_login, "rate": "5/5m"},
    # Por IP: una contraseña común contra muchas cuentas.
    {"group": "login-ip", "key": "ip", "rate": "20/5m"},
)

LOCKED_MESSAGE = "Demasiados intentos fallidos. Espere unos minutos antes de reintentar."
BAD_CREDENTIALS_MESSAGE = "Credenciales incorrectas. Por favor intente de nuevo."


def is_locked(request) -> bool:
    """Si alguno de los límites ya está agotado, sin contar este intento."""
    for limit in LOGIN_LIMITS:
        usage = get_usage(request, method="POST", increment=False, **limit)
        if usage is not None and (usage["should_limit"] or usage["count"] >= usage["limit"]):
            return True
    return False


def count_failure(request) -> None:
    for limit in LOGIN_LIMITS:
        get_usage(request, method="POST", increment=True, **limit)


def attempt_login(request, username: str, password: str) -> str | None:
    """Abre la sesión. Devuelve None si entró, o el mensaje de error para el usuario."""
    if is_locked(request):
        logger.warning("Acceso bloqueado por límite: usuario=%r ip=%s", username, ip_cliente(request))
        record(
            request,
            module="auth",
            action="login_bloqueado",
            description="Intento de acceso rechazado por exceso de intentos fallidos.",
            target=f"username={username}"[:255] if username else "",
            outcome=AuditLog.LIMITED,
        )
        return LOCKED_MESSAGE

    user = authenticate(request, username=username, password=password)
    if user is None:
        count_failure(request)
        logger.warning("Credenciales incorrectas: usuario=%r ip=%s", username, ip_cliente(request))
        return BAD_CREDENTIALS_MESSAGE

    logger.info("Acceso correcto: usuario=%r ip=%s", username, ip_cliente(request))
    login(request, user)
    return None


def effective_permissions(user) -> dict[str, bool]:
    """La matriz que rige: todo para superusuarios, la del grupo si tiene uno, la propia si no."""
    if user.is_superuser:
        return dict.fromkeys(PERMISSION_FIELDS, True)
    profile = getattr(user, "profile", None)
    if profile is None:
        return dict.fromkeys(PERMISSION_FIELDS, False)
    return {field: bool(profile.has_permission(field)) for field in PERMISSION_FIELDS}


def has_permission(user, perm: str) -> bool:
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile = getattr(user, "profile", None)
    return bool(profile and profile.has_permission(perm))


def can_act_on(actor, target) -> bool:
    """Si `actor` tiene rango para tocar la cuenta `target`.

    Un superusuario solo lo toca otro superusuario, y nadie toca una cuenta con
    permisos o unidades de negocio que él no tiene: sería hacerse con ellos.
    """
    if actor.is_superuser:
        return True
    if target.is_superuser:
        return False
    own = effective_permissions(actor)
    if not all(own[field] for field, value in effective_permissions(target).items() if value):
        return False
    scope = unit_scope(actor)
    return scope is None or scope.covers(unit_scope(target))
