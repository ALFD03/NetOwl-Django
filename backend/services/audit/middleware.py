"""Middleware que anota en auditoría las escrituras y todo uso de la API con token."""

from __future__ import annotations

import json
import logging
import time

from .log import outcome_for, record, summarize_target

logger = logging.getLogger(__name__)

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# Las anotan las señales de autenticación, que saben si las credenciales valían.
EXCLUDED = frozenset({("auth", "login"), ("auth", "logout")})

# Lecturas que sí se anotan: las que sacan datos de clientes en bloque.
AUDITED_READS = frozenset({
    ("subscriptions", "lifetime_detail"),
    ("subscriptions", "churn_detail"),
    ("commissions", "sales"),
    ("commissions", "archive_detail"),
    ("surveys", "respondents"),
})

# Por encima de este tamaño la respuesta es un listado, no un mensaje.
MAX_RESPONSE = 64 * 1024


def _payload(request):
    """Lo que envió el cliente, en una forma que se pueda guardar."""
    if request.method == "GET":
        return {key: values if len(values) > 1 else values[0] for key, values in request.GET.lists()}
    content_type = request.content_type or ""
    if content_type == "application/json":
        try:
            return json.loads(request.body or b"null")
        except Exception:
            return None
    if content_type.startswith("multipart/") or content_type == "application/x-www-form-urlencoded":
        # Los archivos, por nombre y tamaño: nunca su contenido.
        data = {key: request.POST.get(key) for key in request.POST}
        files = [
            {"campo": field, "nombre": f.name, "bytes": f.size}
            for field in request.FILES
            for f in request.FILES.getlist(field)
        ]
        if files:
            data["archivos"] = files
        return data
    return None


def _message(response) -> str:
    """El mensaje de una respuesta JSON de error o confirmación."""
    if "application/json" not in response.get("Content-Type", ""):
        return ""
    content = getattr(response, "content", b"")
    if not content or len(content) > MAX_RESPONSE:
        return ""
    try:
        data = json.loads(content)
    except ValueError:
        return ""
    if not isinstance(data, dict):
        return ""
    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or "")
    return str(data.get("message") or "")


def route_key(request) -> tuple[str, str] | None:
    """`(módulo, acción)` de la ruta resuelta. En `/api/` el módulo es el namespace interno."""
    match = getattr(request, "resolver_match", None)
    if match is None or not match.url_name:
        return None
    namespaces = match.namespaces
    module = namespaces[-1] if namespaces else (match.app_names[0] if match.app_names else "")
    return module or "general", match.url_name


class AuditMiddleware:
    """Anota en `AuditLog` las escrituras, las lecturas sensibles y **toda** petición con token.

    Va después de la autenticación (sesión y token) y antes del limitador, para
    ver también los 429. Nunca rompe la petición.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.monotonic()
        response = self.get_response(request)
        try:
            self._record(request, response, int((time.monotonic() - started) * 1000))
        except Exception:
            logger.exception("Fallo al anotar la petición en auditoría")
        return response

    def _record(self, request, response, duration_ms: int) -> None:
        via_token = getattr(request, "api_token", None) is not None
        key = route_key(request)
        if key is None:
            if not via_token:
                return
            key = ("api", "unknown")
        if key in EXCLUDED and not via_token:
            return
        if not via_token and request.method not in WRITE_METHODS and key not in AUDITED_READS:
            return

        payload = _payload(request)
        match = getattr(request, "resolver_match", None)
        record(
            request,
            module=key[0],
            action=key[1],
            description=_message(response),
            target=summarize_target(payload),
            detail={"peticion": payload, "parametros": (match.kwargs if match else None) or None},
            outcome=outcome_for(response.status_code),
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
