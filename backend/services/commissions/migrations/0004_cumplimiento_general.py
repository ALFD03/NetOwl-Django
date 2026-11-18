"""El % de cumplimiento general del periodo, para todos los supervisores y coordinadores de oficina."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("comisiones", "0003_revision_no_contar"),
    ]

    operations = [
        migrations.AddField(
            model_name="comisionperiodo",
            name="cumplimiento_general_pct",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True),
        ),
    ]
