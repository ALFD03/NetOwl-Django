"""`can_delete_comisiones`: borrar un informe de comisiones en borrador.

Permiso propio y cerrado para todos: borrar se lleva lo decidido en el periodo
(revisiones, ventas a mano, indicadores) y no se deshace. Se concede a mano.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0018_sin_permiso_escalamiento_soporte'),
    ]

    operations = [
        migrations.AddField(
            model_name='permissiongroup',
            name='can_delete_comisiones',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_delete_comisiones',
            field=models.BooleanField(default=False),
        ),
    ]
