"""Los dos permisos del modulo de Comisiones.

`can_view_comisiones` abre el informe; `can_manage_comisiones` calcula,
revisa, cierra y configura la jerarquia y las condiciones de pago. Nacen
cerrados, como todos: el modulo es nuevo y nadie tenia acceso que conservar.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0008_permiso_catalogo_ventas'),
    ]

    operations = [
        migrations.AddField(
            model_name='permissiongroup',
            name='can_manage_comisiones',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='can_view_comisiones',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_manage_comisiones',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_view_comisiones',
            field=models.BooleanField(default=False),
        ),
    ]
