"""Permiso propio para el grupo Ventas del modulo de Catalogos.

Coordinadores y objetivos colgaban del permiso comercial. Con el modulo de
Catalogos pasan a un grupo propio —Ventas, junto al directorio de vendedores—
y a un permiso propio. Nace copiando el comercial, de modo que nadie que ya
editara coordinadores u objetivos pierde la pestana; separar a quien solo deba
llevar una de las dos cosas es un acto explicito posterior, desde `/auth/users/`.
"""

from django.db import migrations, models


def copiar_del_comercial(apps, schema_editor):
    """Da el permiso de ventas a quien ya tenia el comercial."""
    for modelo in ('Profile', 'PermissionGroup'):
        apps.get_model('config', modelo).objects.filter(
            can_manage_catalogo_comercial=True,
        ).update(can_manage_catalogo_ventas=True)


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0007_intercambiar_permisos_de_catalogo'),
    ]

    operations = [
        migrations.AddField(
            model_name='permissiongroup',
            name='can_manage_catalogo_ventas',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_manage_catalogo_ventas',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(copiar_del_comercial, migrations.RunPython.noop),
    ]
