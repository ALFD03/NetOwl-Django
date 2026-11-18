"""Parte `can_manage_catalogos` en un permiso comercial y otro operacional.

El campo existente se renombra a `can_manage_catalogo_comercial` —conserva su
valor tal cual— y el operacional nace copiandolo, de modo que nadie que ya
administrara los catalogos pierde ninguna pestana. Separar a quien debe tener
solo una mitad es un acto explicito posterior, desde `/auth/users/`.
"""

from django.db import migrations, models


def copiar_al_operacional(apps, schema_editor):
    """Da el permiso operacional a quien ya tenia el de catalogos."""
    for modelo in ('Profile', 'PermissionGroup'):
        apps.get_model('config', modelo).objects.filter(
            can_manage_catalogo_comercial=True,
        ).update(can_manage_catalogo_operacional=True)


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0005_permissiongroup_can_manage_support_users_and_more'),
    ]

    operations = [
        migrations.RenameField(
            model_name='permissiongroup',
            old_name='can_manage_catalogos',
            new_name='can_manage_catalogo_comercial',
        ),
        migrations.RenameField(
            model_name='profile',
            old_name='can_manage_catalogos',
            new_name='can_manage_catalogo_comercial',
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='can_manage_catalogo_operacional',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_manage_catalogo_operacional',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(copiar_al_operacional, migrations.RunPython.noop),
    ]
