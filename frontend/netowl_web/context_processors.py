"""Context processors propios del proyecto netowl_web."""

from django.conf import settings


def csrf_cookie_name(request):
    """Expone el nombre de la cookie CSRF a las plantillas.

    El nombre cambia por entorno (ver CSRF_COOKIE_NAME en settings.py), asi
    que el cliente React no puede tenerlo hardcodeado: lo lee del meta tag
    `csrf-cookie-name` que se inyecta en app.html.
    """
    return {"csrf_cookie_name": settings.CSRF_COOKIE_NAME}
