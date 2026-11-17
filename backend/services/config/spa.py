"""Las páginas ya migradas a la SPA: Django solo entrega el HTML de arranque."""

from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_safe
from inertia import location

from .decorators import resolve_landing_url


@require_safe
@ensure_csrf_cookie
def spa_shell(request):
    """`app.html` sin `data-page`: arranca React Router.

    Una visita de Inertia (desde una página vieja) recibe un 409 con
    `X-Inertia-Location` para que el navegador haga una carga completa.
    """
    if request.headers.get("X-Inertia"):
        return location(request.get_full_path())
    return render(request, "app.html", {"page": ""})


def login_page(request):
    """`/auth/login/`: con sesión abierta lleva a la primera página permitida."""
    if request.user.is_authenticated:
        return redirect(resolve_landing_url(request) or "subscriptions:dashboard")
    return spa_shell(request)
