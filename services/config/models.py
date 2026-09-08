from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


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
    'can_manage_eta', 'can_manage_users',
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
    ROLE_CHOICES = [
        ('admin', 'Administrador'),
        ('analyst', 'Analista'),
        ('viewer', 'Visualizador (Solo Lectura)'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')

    group = models.ForeignKey(PermissionGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')

    def has_permission(self, perm_name: str) -> bool:
        if self.user.is_superuser:
            return True
        if self.group:
            return getattr(self.group, perm_name, False)
        return getattr(self, perm_name, False)

    def sync_permissions_from_group(self):
        if self.group:
            for field in PERMISSION_FIELDS:
                setattr(self, field, getattr(self.group, field, False))
            self.save()

    def __str__(self):
        group_str = f" [{self.group.name}]" if self.group else ""
        return f"{self.user.username}{group_str} - {self.get_role_display()}"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        is_first = User.objects.count() == 1
        Profile.objects.create(
            user=instance,
            role='admin' if is_first else 'viewer',
            **default_permissions(full_access=is_first),
        )


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if not hasattr(instance, 'profile'):
        is_first = User.objects.count() == 1
        Profile.objects.create(
            user=instance,
            role='admin' if is_first else 'viewer',
            **default_permissions(full_access=is_first),
        )
    instance.profile.save()
