"""Quien lleva cada unidad de negocio, del directorio de ventas.

Nulo para los que ya existen: hay que asignarlos a mano, y «Vacante» lo seguira
siendo. Varias unidades pueden apuntar a la misma persona.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalogos', '0001_initial'),
        ('subscriptions', '0007_ignorados_por_area'),
    ]

    operations = [
        migrations.AddField(
            model_name='coordinador',
            name='persona',
            field=models.ForeignKey(blank=True, limit_choices_to={'cargo': 'coord_un'}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='unidades_negocio', to='catalogos.personaventas'),
        ),
    ]
