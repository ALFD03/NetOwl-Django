"""Perfiles, permisos y la tabla de sesiones del entorno.

Tres cosas, todas de infraestructura y ninguna de negocio:

* el **catalogo unico de permisos** (`VIEW_PERMISSION_FIELDS` y
  `ACTION_PERMISSION_FIELDS`), que recorren el middleware, la pantalla de
  administracion y los decoradores en vez de repetir los nombres campo a campo;
* `Profile` y `PermissionGroup`, que comparten esa matriz;
* `SesionEntorno`, la tabla de sesiones cualificada por esquema.

Usuarios, perfiles y permisos viven en `public` a proposito: la misma cuenta
tiene que valer en desarrollo y en produccion. Lo unico que se separa por
entorno es la sesion.
"""

from django.contrib.auth.models import User
from django.contrib.sessions.base_session import AbstractBaseSession
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver

from core.config import DB_SCHEMA

# --- CATALOGO UNICO DE PERMISOS ---
# Profile y PermissionGroup comparten exactamente la misma matriz. Declararla
# aqui evita que una lista se quede corta al agregar un permiso nuevo: el
# middleware, la vista de administracion y la sincronizacion de grupos la
# recorren en lugar de repetir los nombres campo por campo.

# Permisos de lectura: por defecto abiertos (True).
VIEW_PERMISSION_FIELDS = [
    'can_view_subscriptions', 'can_view_crm', 'can_view_imports', 'can_view_support',
    'can_view_subs_analytics', 'can_view_subs_results', 'can_view_subs_lifetime',
    'can_view_subs_sales', 'can_view_eta', 'can_view_crm_analytics',
    'can_view_crm_results', 'can_view_support_analytics', 'can_view_support_results',
    # Paginas del modulo de Importaciones (una por pestana).
    'can_view_imports_subs', 'can_view_imports_crm', 'can_view_imports_support',
    'can_view_import_history',
]

# Permisos de accion: por defecto cerrados (False).
ACTION_PERMISSION_FIELDS = [
    'can_import_data', 'can_run_calculations', 'can_run_lifetime',
    'can_manage_eta', 'can_manage_users', 'can_manage_catalogos',
    # Cargas de CSV, una por modulo de origen.
    'can_import_subs', 'can_import_crm', 'can_import_support',
    # Ejecucion de cada motor de analisis por separado.
    'can_run_subs_analysis', 'can_run_crm_analysis', 'can_run_support_analysis',
]

PERMISSION_FIELDS = VIEW_PERMISSION_FIELDS + ACTION_PERMISSION_FIELDS


class PermissionMatrix(models.Model):
    """Campos booleanos compartidos por Profile y PermissionGroup.

    Los permisos globales `can_import_data` y `can_run_calculations` siguen
    existiendo y actuan como comodin: en el modulo de Importaciones cada
    endpoint acepta su permiso granular *o* el global (ver los decoradores en
    `services/imports/views.py`), de modo que las cuentas que ya los tenian no
    pierden acceso.
    """

    # --- Modulos principales (navegacion) ---
    can_view_subscriptions = models.BooleanField(default=True)
    can_view_crm = models.BooleanField(default=True)
    can_view_imports = models.BooleanField(default=True)
    can_view_support = models.BooleanField(default=True)

    # --- Paginas de metricas ---
    can_view_subs_analytics = models.BooleanField(default=True)
    can_view_subs_results = models.BooleanField(default=True)
    can_view_subs_lifetime = models.BooleanField(default=True)
    can_view_subs_sales = models.BooleanField(default=True)
    can_view_eta = models.BooleanField(default=True)

    can_view_crm_analytics = models.BooleanField(default=True)
    can_view_crm_results = models.BooleanField(default=True)

    can_view_support_analytics = models.BooleanField(default=True)
    can_view_support_results = models.BooleanField(default=True)

    # --- Paginas del modulo de Importaciones ---
    can_view_imports_subs = models.BooleanField(default=True)
    can_view_imports_crm = models.BooleanField(default=True)
    can_view_imports_support = models.BooleanField(default=True)
    can_view_import_history = models.BooleanField(default=True)

    # --- Acciones globales ---
    can_import_data = models.BooleanField(default=False)
    can_run_calculations = models.BooleanField(default=False)
    can_run_lifetime = models.BooleanField(default=False)
    can_manage_eta = models.BooleanField(default=False)
    can_manage_users = models.BooleanField(default=False)
    # Catalogos de referencia (planes, zonas, sites, estados, coordinadores).
    can_manage_catalogos = models.BooleanField(default=False)

    # --- Cargas de CSV por modulo ---
    can_import_subs = models.BooleanField(default=False)
    can_import_crm = models.BooleanField(default=False)
    can_import_support = models.BooleanField(default=False)

    # --- Ejecucion de analisis por motor ---
    can_run_subs_analysis = models.BooleanField(default=False)
    can_run_crm_analysis = models.BooleanField(default=False)
    can_run_support_analysis = models.BooleanField(default=False)

    class Meta:
        abstract = True


def default_permissions(full_access: bool = False) -> dict:
    """Matriz inicial de una cuenta: lectura abierta y acciones segun el rol."""
    return {
        **{field: True for field in VIEW_PERMISSION_FIELDS},
        **{field: full_access for field in ACTION_PERMISSION_FIELDS},
    }


class PermissionGroup(PermissionMatrix):
    """Modelo para crear plantillas de grupos de permisos reutilizables."""
    name = models.CharField(max_length=60, unique=True)
    description = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Profile(PermissionMatrix):
    """La ficha de permisos de una cuenta.

    `role` es solo descriptivo: quien decide el acceso es la matriz. Si el perfil
    pertenece a un grupo, **toda comprobacion se delega en el grupo**; los campos
    propios se conservan sincronizados para poder desvincularlo despues sin
    perder la configuracion.
    """

    ROLE_CHOICES = [
        ('admin', 'Administrador'),
        ('analyst', 'Analista'),
        ('viewer', 'Visualizador (Solo Lectura)'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')

    group = models.ForeignKey(PermissionGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')

    def has_permission(self, perm_name: str) -> bool:
        """Si esta cuenta tiene el permiso indicado.

        Los superusuarios de Django pasan siempre; un perfil con grupo pregunta al
        grupo y no a sus propios campos.
        """
        if self.user.is_superuser:
            return True
        if self.group:
            return getattr(self.group, perm_name, False)
        return getattr(self, perm_name, False)

    def sync_permissions_from_group(self):
        """Copia al perfil la matriz de su grupo. Sin grupo no hace nada."""
        if self.group:
            for field in PERMISSION_FIELDS:
                setattr(self, field, getattr(self.group, field, False))
            self.save()

    def __str__(self):
        group_str = f" [{self.group.name}]" if self.group else ""
        return f"{self.user.username}{group_str} - {self.get_role_display()}"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Crea el perfil al dar de alta un usuario.

    **El primero del sistema queda como administrador con la matriz completa**;
    el resto nacen como visualizadores, con la lectura abierta y las acciones
    cerradas.
    """
    if created:
        is_first = User.objects.count() == 1
        Profile.objects.create(
            user=instance,
            role='admin' if is_first else 'viewer',
            **default_permissions(full_access=is_first),
        )


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Garantiza el perfil y lo guarda junto al usuario.

    Cubre las cuentas creadas antes de que existiera el perfil o por una via que
    no disparo `create_user_profile`.
    """
    if not hasattr(instance, 'profile'):
        is_first = User.objects.count() == 1
        Profile.objects.create(
            user=instance,
            role='admin' if is_first else 'viewer',
            **default_permissions(full_access=is_first),
        )
    instance.profile.save()


# --- Sesiones aisladas por entorno ---
# Usuarios, perfiles y permisos son compartidos a proposito: la misma cuenta
# tiene que servir en desarrollo y en produccion. Las sesiones no: las dos
# aplicaciones apuntan a la misma base de datos, y con una unica
# `public.django_session` entrar en un entorno cerraba la sesion del otro.
#
# Por eso la tabla de sesiones —y solo ella— se cualifica con DB_SCHEMA, igual
# que hace services/imports/models.py con las suyas.
#
# `managed = False` es deliberado. La tabla es distinta en cada esquema, pero
# `django_migrations` vive en `public` y la comparten todos los entornos: una
# migracion que la creara se registraria como aplicada al ejecutarla en el
# primer entorno y el segundo se quedaria sin tabla, fallando en el primer
# login. La crea `manage.py preparar_sesiones`, que es idempotente y se ejecuta
# en cada arranque (ver entrypoint.sh y scripts/dev.sh).
class SesionEntorno(AbstractBaseSession):
    # AbstractBaseSession marca expire_date con db_index, y el nombre que Django
    # autogenera es un hash del nombre de la tabla: seria distinto en cada
    # esquema y `makemigrations --check` reportaria cambios pendientes para
    # siempre. Mismo motivo por el que AnalysisJob nombra su indice a mano.
    """La tabla de sesiones del esquema del entorno.

    `managed = False` es deliberado: la crea `manage.py preparar_sesiones` y no
    una migracion, porque `django_migrations` vive en `public` y la comparten
    todos los entornos (el detalle esta en ese comando).
    """

    expire_date = models.DateTimeField(db_index=False)

    class Meta:
        managed = False
        db_table = f'"{DB_SCHEMA}"."django_session"' if DB_SCHEMA else 'django_session'
        verbose_name = 'sesion'
        verbose_name_plural = 'sesiones'

    @classmethod
    def get_session_store_class(cls):
        """El backend de sesiones que escribe en esta tabla."""
        from services.config.sessions import SessionStore

        return SessionStore
