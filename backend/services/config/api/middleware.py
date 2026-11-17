"""Autenticación por `Authorization: Bearer <token>` en las rutas `/api/`."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from netowl_web.ratelimit import ip_cliente
from services.audit.log import record
from services.audit.models import AuditLog
from services.config.auth import has_permission
from services.config.models import ApiToken

from .endpoint import error_response

# `last_used_at` se actualiza como mucho una vez por minuto.
TOUCH_INTERVAL = timedelta(minutes=1)


def _resolve(raw: str) -> tuple[ApiToken | None, str]:
    """El token activo de `raw`, o el motivo por el que no vale."""
    token = (
        ApiToken.objects.select_related("user", "user__profile", "user__profile__group")
        .filter(key_hash=ApiToken.hash(raw))
        .first()
    )
    if token is None:
        return None, "Token inválido."
    if not token.is_active:
        return None, "Token revocado o caducado."
    if not token.user.is_active or not has_permission(token.user, "can_use_api"):
        return None, "La cuenta del token no tiene acceso a la API."
    return token, ""


class ApiTokenMiddleware:
    """Si una petición a `/api/` trae token, actúa como su dueño.

    El token sustituye a la sesión: no se exige CSRF (no hay cookie que robar) y
    un token que no vale corta la petición con 401, anotada en auditoría. Va
    después de `AuthenticationMiddleware` y antes de cualquier middleware que
    mire `request.user`.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        header = request.headers.get("Authorization", "")
        if request.path.startswith("/api/") and header.startswith("Bearer "):
            token, reason = _resolve(header.removeprefix("Bearer ").strip())
            if token is None:
                record(
                    request,
                    module="auth",
                    action="token_rechazado",
                    description=reason,
                    outcome=AuditLog.DENIED,
                    status_code=401,
                )
                return error_response(reason, 401)

            request.user = token.user
            request.api_token = token
            request._dont_enforce_csrf_checks = True
            now = timezone.now()
            if token.last_used_at is None or now - token.last_used_at > TOUCH_INTERVAL:
                ApiToken.objects.filter(pk=token.pk).update(last_used_at=now, last_used_ip=ip_cliente(request))
        return self.get_response(request)
