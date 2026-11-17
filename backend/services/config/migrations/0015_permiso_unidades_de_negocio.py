"""Separa Unidades de negocio del Reporte de ventas.

Las dos paginas compartian `can_view_subs_sales`, asi que no se podia dar una
sin la otra. `can_view_subs_sales` se queda con el Reporte de ventas y
`can_view_subs_business_units` abre Unidades de negocio.

Nadie pierde nada: quien tenia el de ventas recibe el nuevo. Quitar luego el
que sobre es un acto explicito, desde `/auth/users/`.
"""

from django.db import migrations, models


def heredar(apps, schema_editor):
    for modelo in ('Profile', 'PermissionGroup'):
        Modelo = apps.get_model('config', modelo)
        Modelo.objects.filter(can_view_subs_sales=True).update(can_view_subs_business_units=True)


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0014_unidades_negocio'),
    ]

    operations = [
        *[
            migrations.AddField(
                model_name=modelo,
                name='can_view_subs_business_units',
                field=models.BooleanField(default=False),
            )
            for modelo in ('permissiongroup', 'profile')
        ],
        migrations.RunPython(heredar, migrations.RunPython.noop),
    ]
