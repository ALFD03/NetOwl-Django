"""Escritura en el registro de auditoría.

`record()` es la única puerta de escritura y nunca propaga: si falla, la acción
auditada ya ocurrió; el fallo va al log de la aplicación.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from django.db import transaction

from netowl_web.ratelimit import client_ip

from .models import AuditLog

logger = logging.getLogger(__name__)

# Claves cuyo valor nunca se guarda.
_SENSITIVE = re.compile(r"pass|clave|contrasen|secret|token|csrf|authorization", re.IGNORECASE)
HIDDEN = "***"

MAX_TEXT = 500
MAX_ITEMS = 200
MAX_DEPTH = 6

# Claves que se resumen en `target` si vienen en el payload, en este orden.
TARGET_KEYS = (
    "periodo", "period", "user_id", "username", "group_id", "name", "tipo", "id",
    "orden", "persona_id", "supervisor_ids", "module", "nombre",
)


def sanitize(value: Any, depth: int = 0) -> Any:
    """Copia de `value` apta para guardar: sin secretos y con tamaño acotado."""
    if depth > MAX_DEPTH:
        return "…"
    if isinstance(value, dict):
        clean = {}
        for i, (key, item) in enumerate(value.items()):
            if i >= MAX_ITEMS:
                clean["…"] = f"{len(value) - MAX_ITEMS} claves más"
                break
            key = str(key)
            clean[key] = HIDDEN if _SENSITIVE.search(key) else sanitize(item, depth + 1)
        return clean
    if isinstance(value, (list, tuple)):
        items = [sanitize(item, depth + 1) for item in value[:MAX_ITEMS]]
        if len(value) > MAX_ITEMS:
            items.append(f"… {len(value) - MAX_ITEMS} elementos más")
        return items
    if isinstance(value, str):
        return value if len(value) <= MAX_TEXT else value[:MAX_TEXT] + "…"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return sanitize(str(value), depth)


def summarize_target(data: Any) -> str:
    """`clave=valor` de las claves que identifican sobre qué se actuó."""
    if not isinstance(data, dict):
        return ""
    parts = []
    for key in TARGET_KEYS:
        if key in data and data[key] not in (None, "", []):
            value = data[key]
            if isinstance(value, list):
                value = ",".join(str(v) for v in value[:10]) + ("…" if len(value) > 10 else "")
            parts.append(f"{key}={value}")
    return " · ".join(parts)[:255]


def outcome_for(status_code: int | None) -> str:
    """El desenlace según el código HTTP."""
    if status_code is None or status_code < 400:
        return AuditLog.OK
    if status_code in (401, 403):
        return AuditLog.DENIED
    if status_code == 429:
        return AuditLog.LIMITED
    if status_code < 500:
        return AuditLog.REJECTED
    return AuditLog.ERROR


def record(
    request=None,
    *,
    module: str,
    action: str,
    user=None,
    description: str = "",
    target: str = "",
    detail: Any = None,
    outcome: str = AuditLog.OK,
    status_code: int | None = None,
    duration_ms: int | None = None,
) -> AuditLog | None:
    """Anota una acción. Devuelve el registro, o None si no se pudo guardar.

    Con `request`, usuario, IP, método, ruta, canal y token salen de ella. Sin
    ella (el worker) hay que pasar `user`, o None para acciones del sistema.
    """
    if user is None and request is not None:
        user = getattr(request, "user", None)
    authenticated = user is not None and getattr(user, "is_authenticated", False)
    token = getattr(request, "api_token", None) if request is not None else None
    if request is None:
        channel = AuditLog.WORKER
    else:
        channel = AuditLog.API if token is not None else AuditLog.WEB
    try:
        # Savepoint: si el INSERT falla dentro de una transacción ajena, solo se
        # deshace el registro.
        with transaction.atomic():
            return AuditLog.objects.create(
                user=user if authenticated else None,
                username=(user.username if authenticated else "")[:150],
                ip=client_ip(request) if request is not None else None,
                module=module[:40],
                action=action[:80],
                method=(getattr(request, "method", None) or "")[:10],
                path=(getattr(request, "path", None) or "")[:255],
                status_code=status_code,
                outcome=outcome,
                target=target[:255],
                description=description,
                detail=sanitize(detail) if detail is not None else None,
                channel=channel,
                token=token,
                duration_ms=duration_ms,
            )
    except Exception:
        logger.exception("No se pudo anotar en auditoría %s.%s", module, action)
