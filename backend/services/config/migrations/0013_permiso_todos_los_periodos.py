"""Anade `can_view_all_periods`: ver todos los periodos evaluados o solo el ultimo.

Hasta ahora toda cuenta con acceso a una pagina veia el historico entero. Nadie
pierde nada: todas las cuentas y grupos que ya existian reciben el permiso.
Una cuenta nueva nace sin el, como el resto de la matriz.
"""

from django.db import migrations, models


def conceder(apps, schema_editor):
    for modelo in ('Profile', 'PermissionGroup'):
        apps.get_model('config', modelo).objects.update(can_view_all_periods=True)


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0012_permisos_dashboard'),
    ]

    operations = [
        *[
            migrations.AddField(
                model_name=modelo,
                name='can_view_all_periods',
                field=models.BooleanField(default=False),
            )
            for modelo in ('permissiongroup', 'profile')
        ],
        migrations.RunPython(conceder, migrations.RunPython.noop),
    ]
