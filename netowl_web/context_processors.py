"""Context processors propios del proyecto netowl_web."""

from django.conf import settings


def csrf_cookie_name(request):
    """Expone el nombre de la cookie CSRF a las plantillas.

    El nombre cambia por entorno (ver CSRF_COOKIE_NAME en settings.py), asi
    que el cliente React no puede tenerlo hardcodeado: lo lee del meta tag
    `csrf-cookie-name` que se inyecta en app.html.
    """
    return {"csrf_cookie_name": settings.CSRF_COOKIE_NAME}


def vite_dev_server(request):
    """Indica si la plantilla debe cargar el dev-server de Vite.

    Antes esta decision colgaba de `{% if debug %}`, que Django solo pone a
    True cuando DEBUG esta activo *y* ademas REMOTE_ADDR figura en
    INTERNAL_IPS. Eso hacia que el modo de carga de los assets dependiera de
    la IP del cliente: abrir el runserver desde otra maquina de la red servia
    la plantilla apuntando a un bundle compilado que en desarrollo no existe.

    Tampoco se cuelga de DEBUG directamente. Servir los assets desde Vite es
    una decision de flujo de trabajo, no de seguridad, y atarla a DEBUG
    obligaria a encender DEBUG para poder desarrollar. Se controla con
    VITE_DEV_SERVER (lo exporta scripts/dev.sh) y, si no esta definida, cae
    en DEBUG por compatibilidad.
    """
    return {"vite_dev_server": settings.USE_VITE_DEV_SERVER}
