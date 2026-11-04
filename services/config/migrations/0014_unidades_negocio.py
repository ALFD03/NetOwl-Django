"""Unidades de negocio por cuenta: todas, o una lista del catalogo mas RF.

`can_view_all_business_units` es el interruptor; sin el, la cuenta ve solo las
unidades de `unidades_negocio` (una relacion con `Coordinador`, porque las
unidades cambian) y el bloque RF si `unidad_rf`.

Nadie pierde nada: todas las cuentas y grupos que ya existian reciben el
interruptor. Una cuenta nueva nace sin el y sin unidades.
"""

from django.db import migrations, models


def conceder(apps, schema_editor):
    for modelo in ('Profile', 'PermissionGroup'):
        apps.get_model('config', modelo).objects.update(can_view_all_business_units=True)


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0013_permiso_todos_los_periodos'),
        ('subscriptions', '0009_plan_comision_pyme_pct'),
    ]

    operations = [
        migrations.AddField(
            model_name='permissiongroup',
            name='can_view_all_business_units',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='unidad_rf',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='unidades_negocio',
            field=models.ManyToManyField(blank=True, related_name='+', to='subscriptions.coordinador'),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_view_all_business_units',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='unidad_rf',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='unidades_negocio',
            field=models.ManyToManyField(blank=True, related_name='+', to='subscriptions.coordinador'),
        ),
        migrations.RunPython(conceder, migrations.RunPython.noop),
    ]
