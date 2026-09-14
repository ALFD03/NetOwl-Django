"""Backend de sesiones que escribe en la tabla del entorno.

Es el backend de base de datos de Django con un unico cambio: usa
`SesionEntorno` (services/config/models.py) en lugar del modelo `Session` de
`django.contrib.sessions`, cuya tabla es siempre `public.django_session`.

Existe porque desarrollo y produccion comparten base de datos —el mismo Vault,
distinto DB_SCHEMA—, y compartir tambien la tabla de sesiones hacia que entrar
en un entorno cerrase la sesion del otro. Usuarios y permisos si se comparten,
que es lo que se quiere: lo unico que se separa es la sesion.

Se activa con SESSION_ENGINE en netowl_web/settings.py.
"""

from django.contrib.sessions.backends.db import SessionStore as DBStore


class SessionStore(DBStore):
    """El backend de base de datos de Django, escribiendo en `SesionEntorno`."""

    @classmethod
    def get_model_class(cls):
        """El modelo de sesion del entorno, en vez del de `django.contrib.sessions`."""
        from services.config.models import SesionEntorno

        return SesionEntorno
