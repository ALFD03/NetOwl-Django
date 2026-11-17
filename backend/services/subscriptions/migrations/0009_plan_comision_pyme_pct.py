"""El % de comision de un plan PYME.

Nulo para todos: es "sin definir", y Comisiones avisa de las ventas PYME de un
plan que todavia no lo tiene en vez de pagarlas a 0.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0008_coordinador_persona'),
    ]

    operations = [
        migrations.AddField(
            model_name='plan',
            name='comision_pyme_pct',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
    ]
