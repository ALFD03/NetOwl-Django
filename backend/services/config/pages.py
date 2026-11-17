"""Las páginas: Django exige sesión y permisos y entrega el HTML de la SPA.

Los datos los pide cada página a `/api/`, que vuelve a comprobar permisos.
"""

from __future__ import annotations

from urllib.parse import urlencode

from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponseForbidden
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.html import escape
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_safe

from .auth import has_permission

# Páginas de inicio por prioridad: (ruta, permisos que exige). Quien no puede
# abrir una página va a la primera de estas que sí pueda.
LANDING_ROUTES = [
    ("subscriptions:dashboard", ("can_view_subscriptions", "can_view_subs_dashboard")),
    ("crm:dashboard", ("can_view_crm", "can_view_crm_dashboard")),
    ("support:dashboard", ("can_view_support", "can_view_support_dashboard")),
    ("subscriptions:analytics", ("can_view_subs_analytics",)),
    ("subscriptions:results", ("can_view_subs_results",)),
    ("subscriptions:lifetime", ("can_view_subs_lifetime",)),
    ("subscriptions:sales_report", ("can_view_subs_sales",)),
    ("subscriptions:business_units", ("can_view_subs_business_units",)),
    ("subscriptions:eta_report", ("can_view_eta",)),
    ("crm:analytics", ("can_view_crm_analytics",)),
    ("crm:results", ("can_view_crm_results",)),
    ("support:analytics", ("can_view_support_analytics",)),
    ("support:results", ("can_view_support_results",)),
    ("imports:subscriptions", ("can_view_imports", "can_view_imports_subs")),
    ("imports:crm", ("can_view_imports", "can_view_imports_crm")),
    ("imports:support", ("can_view_imports", "can_view_imports_support")),
    ("imports:history", ("can_view_imports", "can_view_import_history")),
    ("catalogos:notificaciones", ("can_manage_catalogo_operacional",)),
    ("catalogos:notificaciones", ("can_manage_catalogo_comercial",)),
    ("catalogos:notificaciones", ("can_manage_catalogo_ventas",)),
    ("support:usuarios", ("can_manage_support_users",)),
    ("comisiones:informe", ("can_view_comisiones",)),
    ("comisiones:condiciones", ("can_manage_comisiones",)),
    ("config:user_management", ("can_view_users",)),
    ("auditoria:registro", ("can_view_auditoria",)),
]


def _allowed(user, required) -> bool:
    return all(has_permission(user, perm) for perm in required)


def resolve_landing_url(request) -> str | None:
    """Primera página que la cuenta puede abrir (nunca la que se acaba de denegar)."""
    if request.user.is_superuser:
        return reverse("subscriptions:dashboard")
    for route, required in LANDING_ROUTES:
        if _allowed(request.user, required):
            url = reverse(route)
            if url != request.path:
                return url
    return None


def login_redirect(request):
    query = urlencode({"next": request.get_full_path()}) if request.path != "/" else ""
    return redirect(reverse("config:login") + (f"?{query}" if query else ""))


def deny(request, message: str):
    """A la primera página permitida o, si no hay ninguna, un 403 sin bucles."""
    landing = resolve_landing_url(request)
    if landing:
        return redirect(landing)
    return HttpResponseForbidden(
        f"<h1>Acceso denegado</h1><p>{escape(message)}</p>"
        "<p>Tu cuenta no tiene ningún módulo asignado. Contacta al administrador.</p>"
    )


@require_safe
@ensure_csrf_cookie
def spa_shell(request):
    """`app.html`: el arranque de la SPA. También entrega la cookie CSRF."""
    return render(request, "app.html")


def page(*perms: str, require_all: bool = True):
    """Vista de una página de la SPA. Por defecto exige **todos** los permisos.

    `require_all=False` abre la página con cualquiera de ellos.
    """
    if not perms:
        raise ImproperlyConfigured("Una página exige al menos un permiso.")
    combine = all if require_all else any

    def view(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return login_redirect(request)
        if not combine(has_permission(request.user, perm) for perm in perms):
            joiner = " y " if require_all else " o "
            return deny(request, f"Se requiere: {joiner.join(perms)}.")
        return spa_shell(request)

    return view


def module_root(pages: list[tuple[str, tuple[str, ...]]]):
    """La raíz de un módulo (`/crm/`…): redirige a su primera página permitida."""

    def view(request):
        if not request.user.is_authenticated:
            return login_redirect(request)
        for route, required in pages:
            if _allowed(request.user, required):
                return redirect(route)
        return deny(request, "No tienes ninguna página de este módulo asignada.")

    return view


def root(request):
    """`/`: a la primera página permitida."""
    if not request.user.is_authenticated:
        return redirect("config:login")
    return redirect(resolve_landing_url(request) or "subscriptions:dashboard")


def login_page(request):
    """`/auth/login/`: con sesión abierta lleva a la primera página permitida."""
    if request.user.is_authenticated:
        return redirect(resolve_landing_url(request) or "subscriptions:dashboard")
    return spa_shell(request)
