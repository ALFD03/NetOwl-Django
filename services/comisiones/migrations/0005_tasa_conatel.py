"""La tasa CONATEL con que se paga cada periodo: el bolivar oficial del dia 1 del mes siguiente."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("comisiones", "0004_cumplimiento_general"),
    ]

    operations = [
        migrations.AddField(
            model_name="comisionperiodo",
            name="tasa_conatel",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name="comisionperiodo",
            name="tasa_conatel_publicada",
            field=models.DateField(blank=True, null=True),
        ),
    ]
