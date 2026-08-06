# frontend/config/models.py
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class PermissionGroup(models.Model):
    """Modelo para crear plantillas de grupos de permisos reutilizables."""
    name = models.CharField(max_length=60, unique=True)
    description = models.CharField(max_length=255, blank=True, default="")

    # --- MATRIZ DE PERMISOS DEL GRUPO ---
    can_view_subscriptions = models.BooleanField(default=True)
    can_view_crm = models.BooleanField(default=True)
    can_view_imports = models.BooleanField(default=True) # <-- NUEVO

    can_view_subs_analytics = models.BooleanField(default=True)
    can_view_subs_results = models.BooleanField(default=True)
    can_view_subs_lifetime = models.BooleanField(default=True)
    can_view_subs_sales = models.BooleanField(default=True)
    can_view_eta = models.BooleanField(default=True)

    can_view_crm_analytics = models.BooleanField(default=True)
    can_view_crm_results = models.BooleanField(default=True)

    can_import_data = models.BooleanField(default=False)
    can_run_calculations = models.BooleanField(default=False)
    can_run_lifetime = models.BooleanField(default=False)
    can_manage_eta = models.BooleanField(default=False)
    can_manage_users = models.BooleanField(default=False)
    
    can_view_support = models.BooleanField(default=True)
    can_view_support_analytics = models.BooleanField(default=True)
    can_view_support_results = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Profile(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Administrador'),
        ('analyst', 'Analista'),
        ('viewer', 'Visualizador (Solo Lectura)'),
    ]
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')
    
    group = models.ForeignKey(PermissionGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='members')

    # --- PERMISOS INDIVIDUALES DE LA CUENTA ---
    can_view_subscriptions = models.BooleanField(default=True)
    can_view_crm = models.BooleanField(default=True)
    can_view_imports = models.BooleanField(default=True) # <-- NUEVO

    can_view_subs_analytics = models.BooleanField(default=True)
    can_view_subs_results = models.BooleanField(default=True)
    can_view_subs_lifetime = models.BooleanField(default=True)
    can_view_subs_sales = models.BooleanField(default=True)
    can_view_eta = models.BooleanField(default=True)

    can_view_crm_analytics = models.BooleanField(default=True)
    can_view_crm_results = models.BooleanField(default=True)

    can_import_data = models.BooleanField(default=False)
    can_run_calculations = models.BooleanField(default=False)
    can_run_lifetime = models.BooleanField(default=False)
    can_manage_eta = models.BooleanField(default=False)
    can_manage_users = models.BooleanField(default=False)
    
    can_view_support = models.BooleanField(default=True)
    can_view_support_analytics = models.BooleanField(default=True)
    can_view_support_results = models.BooleanField(default=True)

    def has_permission(self, perm_name: str) -> bool:
        if self.user.is_superuser:
            return True
        if self.group:
            return getattr(self.group, perm_name, False)
        return getattr(self, perm_name, False)

    def sync_permissions_from_group(self):
        if self.group:
            for field in [
                'can_view_subscriptions', 'can_view_crm', 'can_view_imports', 'can_view_support',
                'can_view_subs_analytics', 'can_view_subs_results', 'can_view_subs_lifetime',
                'can_view_subs_sales', 'can_view_eta', 'can_view_crm_analytics',
                'can_view_crm_results', 'can_view_support_analytics', 'can_view_support_results',
                'can_import_data', 'can_run_calculations', 'can_run_lifetime',
                'can_manage_eta', 'can_manage_users'
            ]:
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
            can_view_subscriptions=True,
            can_view_crm=True,
            can_view_imports=True,
            can_view_subs_analytics=True,
            can_view_subs_results=True,
            can_view_subs_lifetime=True,
            can_view_subs_sales=True,
            can_view_eta=True,
            can_view_crm_analytics=True,
            can_view_crm_results=True,
            can_import_data=is_first,
            can_run_calculations=is_first,
            can_run_lifetime=is_first,
            can_manage_eta=is_first,
            can_manage_users=is_first
        )

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if not hasattr(instance, 'profile'):
        is_first = User.objects.count() == 1
        Profile.objects.create(
            user=instance,
            role='admin' if is_first else 'viewer',
            can_view_subscriptions=True,
            can_view_crm=True,
            can_view_imports=True,
            can_view_subs_analytics=True,
            can_view_subs_results=True,
            can_view_subs_lifetime=True,
            can_view_subs_sales=True,
            can_view_eta=True,
            can_view_crm_analytics=True,
            can_view_crm_results=True,
            can_import_data=is_first,
            can_run_calculations=is_first,
            can_run_lifetime=is_first,
            can_manage_eta=is_first,
            can_manage_users=is_first
        )
    instance.profile.save()