"""El decorador `@endpoint`: todo lo común de una vista de la API.

Una vista decorada solo lee sus datos y los devuelve. El decorador se encarga de:

* método HTTP (405),
* autenticación por sesión o por token (401) y permisos (403),
* límite de peticiones por token, usuario o IP (429),
* validar `query` (GET) y `body` (JSON o formulario) con pydantic (400),
* convertir el resultado en JSON (NaN de pandas incluidos) y cualquier error
  en una respuesta uniforme: `{"error": {"message": ..., "details": ...}}`,
* con `keys`, traducir las claves al inglés (ver `keys.py`).

La vista puede devolver un dict/list (200), `(datos, status)`, `None` (204) o
cualquier `HttpResponse` (se devuelve tal cual).
"""

from __future__ import annotations

import json
import logging
import types
import typing
from collections.abc import Callable, Iterable
from functools import wraps
from typing import Any

from django.core.exceptions import ObjectDoesNotExist, PermissionDenied
from django.http import Http404, HttpResponse, JsonResponse
from django_ratelimit.core import is_ratelimited
from pydantic import BaseModel, ValidationError

from core.utils import clean_json_nullable, clean_json_props
from netowl_web.ratelimit import client_ip
from services.config.auth import has_permission

from .keys import KeyMap

logger = logging.getLogger(__name__)

INTERNAL_ERROR = "Error interno del servidor. Consulte el registro de la aplicación."


class ApiError(Exception):
    """Error esperado: su mensaje llega al cliente con el status indicado."""

    def __init__(self, message: str, status: int = 400, details: Any = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.details = details


def error_response(message: str, status: int, details: Any = None) -> JsonResponse:
    error: dict[str, Any] = {"message": message}
    if details is not None:
        error["details"] = details
    return JsonResponse({"error": error}, status=status)


def _rate_key(group: str, request) -> str:
    token = getattr(request, "api_token", None)
    if token is not None:
        return f"token:{token.pk}"
    if request.user.is_authenticated:
        return f"user:{request.user.pk}"
    return f"ip:{client_ip(request)}"


def _is_list_field(model: type[BaseModel], name: str) -> bool:
    field = model.model_fields.get(name)
    if field is None:
        return False
    annotation = field.annotation
    if typing.get_origin(annotation) in (typing.Union, types.UnionType):
        annotation = next((a for a in typing.get_args(annotation) if a is not type(None)), annotation)
    return typing.get_origin(annotation) in (list, tuple, set)


def _query_data(request, model: type[BaseModel]) -> dict:
    return {
        key: request.GET.getlist(key) if _is_list_field(model, key) else request.GET.get(key)
        for key in request.GET
    }


def json_body(request) -> dict:
    """El cuerpo JSON como dict, para las vistas que leen campos sueltos. 400 si no lo es."""
    data = _body_data(request)
    if not isinstance(data, dict):
        raise ApiError("El cuerpo debe ser un objeto JSON.")
    return data


def _body_data(request) -> Any:
    if request.content_type == "application/json":
        try:
            return json.loads(request.body or b"{}")
        except (ValueError, UnicodeDecodeError) as exc:
            raise ApiError("El cuerpo no es un JSON válido.") from exc
    return request.POST.dict()


def _validation_details(exc: ValidationError) -> list[dict]:
    return [
        {"field": ".".join(str(p) for p in err["loc"]), "message": err["msg"]}
        for err in exc.errors(include_url=False)
    ]


def _to_response(result: Any, nullable: bool, keys: KeyMap | None = None) -> HttpResponse:
    if isinstance(result, HttpResponse):
        return result
    status = 200
    if isinstance(result, tuple):
        result, status = result
    if result is None:
        return HttpResponse(status=204)
    if isinstance(result, BaseModel):
        result = result.model_dump(mode="json")
    if keys is not None:
        result = keys.out(result)
    clean = clean_json_nullable if nullable else clean_json_props
    return JsonResponse(clean(result), status=status, safe=False, json_dumps_params={"ensure_ascii": False})


BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


def _per_method(value, method: str):
    """`value` tal cual, o su entrada para `method` si es un dict por método."""
    return value.get(method) if isinstance(value, dict) else value


def endpoint(
    *,
    methods: Iterable[str] = ("GET",),
    perms: Iterable[str] | dict[str, Iterable[str]] = (),
    require_all: bool = False,
    login: bool = True,
    session_only: bool = False,
    rate: str | dict[str, str] | None = None,
    query: type[BaseModel] | None = None,
    body: type[BaseModel] | None = None,
    nullable: bool = False,
    keys: KeyMap | None = None,
) -> Callable:
    """Declara una vista de la API.

    - `perms`: basta uno, o todos con `require_all=True`. Un dict los da por método.
    - `login=False`: vista pública (solo el login).
    - `session_only`: rechaza tokens (gestión de tokens, cierre de sesión).
    - `rate`: "2/m", "60/m"…, contado por token, usuario o IP; un dict, por método.
    - `query` / `body`: modelos pydantic; la vista los recibe como `query=` y `body=`.
      `body` solo se lee en POST, PUT y PATCH.
    - `nullable`: NaN → null en vez de 0 (ver `core.utils.clean_json_nullable`).
    - `keys`: traduce al inglés las claves de la respuesta (ver `keys.py`).
    """
    allowed = tuple(m.upper() for m in methods)

    def decorator(view: Callable) -> Callable:
        group = f"api:{view.__module__}.{view.__name__}"

        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if request.method not in allowed:
                response = error_response("Método no permitido.", 405)
                response["Allow"] = ", ".join(allowed)
                return response

            if login and not request.user.is_authenticated:
                return error_response("Autenticación requerida.", 401)
            if session_only and getattr(request, "api_token", None) is not None:
                return error_response("Esta operación no admite token de API.", 403)
            needed = tuple(_per_method(perms, request.method) or ())
            if needed:
                combine = all if require_all else any
                if not combine(has_permission(request.user, p) for p in needed):
                    joiner = " y " if require_all else " o "
                    return error_response(f"Acceso denegado. Se requiere: {joiner.join(needed)}.", 403)

            limit = _per_method(rate, request.method)
            if limit and is_ratelimited(
                request, group=f"{group}:{request.method}", key=_rate_key, rate=limit, increment=True
            ):
                return error_response("Demasiadas peticiones. Espera un momento antes de reintentar.", 429)

            try:
                if query is not None:
                    kwargs["query"] = query.model_validate(_query_data(request, query))
                if body is not None and request.method in BODY_METHODS:
                    kwargs["body"] = body.model_validate(_body_data(request))
                return _to_response(view(request, *args, **kwargs), nullable, keys)
            except ValidationError as exc:
                return error_response("Parámetros inválidos.", 400, _validation_details(exc))
            except ApiError as exc:
                return error_response(exc.message, exc.status, exc.details)
            except PermissionDenied as exc:
                return error_response(str(exc) or "Acceso denegado.", 403)
            except (Http404, ObjectDoesNotExist):
                return error_response("No encontrado.", 404)
            except Exception:
                logger.exception("Error en %s %s", request.method, request.path)
                return error_response(INTERNAL_ERROR, 500)

        return wrapped

    return decorator


def csrf_failure(request, reason: str = ""):
    """`CSRF_FAILURE_VIEW`: JSON en `/api/`, la página de Django en el resto."""
    if request.path.startswith("/api/"):
        return error_response("Token CSRF inválido o ausente.", 403)
    from django.views.csrf import csrf_failure as default_failure

    return default_failure(request, reason=reason)
