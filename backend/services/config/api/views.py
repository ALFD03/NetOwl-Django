"""`/api/auth/`: sesión, identidad y tokens de API."""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import logout
from django.contrib.auth.models import User
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from pydantic import BaseModel, Field

from services.config.auth import attempt_login, can_act_on, effective_permissions, has_permission
from services.config.decorators import resolve_landing_url
from services.config.models import ApiToken

from .endpoint import ApiError, endpoint


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=256)


class TokenQuery(BaseModel):
    user_id: int | None = None


class TokenCreateBody(BaseModel):
    user_id: int
    name: str = Field(min_length=1, max_length=80)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


def _iso(value) -> str | None:
    return timezone.localtime(value).isoformat() if value else None


def me_payload(request) -> dict:
    """La cuenta que hace la petición, con su matriz efectiva y su página de inicio."""
    user = request.user
    profile = getattr(user, "profile", None)
    token = getattr(request, "api_token", None)
    return {
        "id": user.id,
        "username": user.username,
        "is_superuser": user.is_superuser,
        "role": profile.role if profile else None,
        "group": profile.group.name if profile and profile.group else None,
        "permissions": effective_permissions(user),
        "landing": resolve_landing_url(request),
        "auth": "token" if token else "session",
        "token": {"prefix": token.prefix, "name": token.name, "expires_at": _iso(token.expires_at)} if token else None,
    }


def token_payload(token: ApiToken) -> dict:
    return {
        "id": token.id,
        "name": token.name,
        "prefix": token.prefix,
        "user": {"id": token.user_id, "username": token.user.username},
        "created_by": token.created_by.username if token.created_by else None,
        "created_at": _iso(token.created_at),
        "expires_at": _iso(token.expires_at),
        "revoked_at": _iso(token.revoked_at),
        "last_used_at": _iso(token.last_used_at),
        "last_used_ip": token.last_used_ip,
        "active": token.is_active,
    }


@endpoint(methods=["POST"], login=False, session_only=True, body=LoginBody)
def login(request, body: LoginBody):
    """Abre la sesión del navegador. Los intentos fallidos se limitan por cuenta y por IP."""
    if not request.user.is_authenticated:
        error = attempt_login(request, body.username.strip(), body.password)
        if error:
            raise ApiError(error, 401)
    return me_payload(request)


@endpoint(methods=["POST"], session_only=True)
def logout_view(request):
    logout(request)


@ensure_csrf_cookie
@endpoint()
def me(request):
    """La cuenta actual. Entrega además la cookie CSRF, también a un anónimo (401)."""
    return me_payload(request)


@endpoint(methods=["GET", "POST"], perms=["can_manage_api_tokens"], session_only=True, rate="30/m", query=TokenQuery)
def tokens(request, query: TokenQuery):
    """GET: lista de tokens (opcionalmente de una cuenta). POST: crea uno."""
    if request.method == "POST":
        return _create_token(request, TokenCreateBody.model_validate_json(request.body or b"{}"))
    qs = ApiToken.objects.select_related("user", "created_by")
    if query.user_id is not None:
        qs = qs.filter(user_id=query.user_id)
    return {"tokens": [token_payload(t) for t in qs]}


def _create_token(request, body: TokenCreateBody):
    owner = User.objects.filter(pk=body.user_id).first()
    if owner is None or not owner.is_active:
        raise ApiError("La cuenta no existe o está desactivada.", 404)
    if not has_permission(owner, "can_use_api"):
        raise ApiError("La cuenta no tiene el permiso para usar la API (can_use_api).")
    if not can_act_on(request.user, owner):
        raise ApiError("No puedes crear un token para una cuenta con permisos que tú no tienes.", 403)

    expires_at = timezone.now() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    token, raw = ApiToken.issue(user=owner, created_by=request.user, name=body.name.strip(), expires_at=expires_at)
    # El valor en claro solo viaja en esta respuesta.
    return {**token_payload(token), "token": raw}, 201


@endpoint(methods=["POST"], perms=["can_manage_api_tokens"], session_only=True, rate="30/m")
def revoke_token(request, token_id: int):
    token = ApiToken.objects.select_related("user", "created_by").get(pk=token_id)
    if token.revoked_at is None:
        token.revoked_at = timezone.now()
        token.save(update_fields=["revoked_at"])
    return token_payload(token)
