# Las tarifas del coordinador de oficina, aparte de las del supervisor.

from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    """La oficina cobra 2.5$ por la venta de su equipo y 2.5$ tambien por la propia.

    Hasta aqui usaba las del supervisor (2.5$ y 4$). Los valores por defecto son
    los de la politica, no una copia de los del supervisor: lo que se separa es
    justo lo que era distinto.
    """

    dependencies = [
        ("comisiones", "0009_bonos_meta"),
    ]

    operations = [
        migrations.AddField(
            model_name="condicionescomision",
            name="monto_equipo_oficina",
            field=models.DecimalField(decimal_places=2, default=Decimal("2.5"), max_digits=8),
        ),
        migrations.AddField(
            model_name="condicionescomision",
            name="monto_directa_oficina",
            field=models.DecimalField(decimal_places=2, default=Decimal("2.5"), max_digits=8),
        ),
    ]
