"""El catalogo de planes reguladores y el vinculo desde el plan comercial.

Escrita a mano y no con `makemigrations`: los settings leen Vault en tiempo de
importacion, asi que el comando no arranca sin red contra Vault. El contenido
es el que `makemigrations` habria generado — comprobarlo con
`python manage.py makemigrations --check --dry-run` cuando haya Vault delante.

Las tablas de catalogo viven en `public`, sin cualificar con `DB_SCHEMA`, asi
que aqui no hay nada que retocar a mano (a diferencia de las de
`services/imports`).
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0002_alter_plan_tecnologia_alter_zona_tecnologia"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlanRegulador",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("nombre", models.CharField(max_length=200, unique=True)),
                (
                    "tecnologia",
                    models.CharField(
                        choices=[("FTTH", "FTTH (fibra)"), ("RF", "RF (radiofrecuencia)")],
                        default="FTTH",
                        max_length=10,
                    ),
                ),
                (
                    "tipo_persona",
                    models.CharField(
                        choices=[("nat", "Persona natural"), ("PYME", "Persona juridica / PYME")],
                        default="nat",
                        max_length=10,
                    ),
                ),
                ("datas_mbps", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("precio", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("tiene_tv", models.BooleanField(default=False)),
                ("es_transporte", models.BooleanField(default=False)),
                ("notas", models.CharField(blank=True, default="", max_length=255)),
                ("creado_en", models.DateTimeField(auto_now_add=True)),
                ("actualizado_en", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "plan regulador",
                "verbose_name_plural": "planes reguladores",
                "db_table": "catalogo_planes_reguladores",
                "ordering": ["nombre"],
            },
        ),
        migrations.AddField(
            model_name="plan",
            name="plan_regulador",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="planes",
                to="subscriptions.planregulador",
            ),
        ),
    ]
