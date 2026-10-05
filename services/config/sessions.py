"""Backend de sesiones que escribe en la tabla del entorno.

Es el backend de base de datos de Django con un unico cambio: usa
`SesionEntorno` (services/config/models.py) en lugar del modelo `Session` de
`django.contrib.sessions`, cuya tabla es siempre `public.django_session`.

Existe porque, cuando usuarios y permisos se compartian en `public`, la tabla
de sesiones era lo unico propio de cada esquema. Hoy la conexion fija
`search_path` al esquema del entorno y todo vive alli, asi que esta tabla es la
misma que usaria el backend estandar.

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
