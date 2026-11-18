# Los equipos de ventas se dejan de usar; la coordinadora de oficina pasa a
# colgar de un site y a tener un objetivo de ventas.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Tres cambios del directorio de ventas, en el orden en que dependen.

    - `EquipoVentas` y `NombreEquipo` se borran con sus tablas: el modulo ya no
      agrupa por el `Equipo de ventas` del export. El equipo primero, porque
      apunta al nombre con `PROTECT`.
    - `PersonaVentas.site`: el site del Sales Report de cada coordinadora de
      oficina. Nulo en las que ya estaban, hasta que alguien se lo asigne.
    - `ObjetivoVentasOficina`: cuantas ventas se esperan de una coordinadora
      en el mes; general (sin persona) o individual, con vigencia por mes.
    """

    dependencies = [
        ("catalogos", "0004_estado_fijo_asesor"),
        ("subscriptions", "0009_plan_comision_pyme_pct"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.DeleteModel(name="EquipoVentas"),
        migrations.DeleteModel(name="NombreEquipo"),
        migrations.AddField(
            model_name="personaventas",
            name="site",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="coordinadoras_oficina",
                to="subscriptions.site",
            ),
        ),
        migrations.CreateModel(
            name="ObjetivoVentasOficina",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("desde", models.CharField(blank=True, max_length=7, null=True)),
                ("ventas", models.PositiveIntegerField()),
                ("nota", models.CharField(blank=True, default="", max_length=255)),
                ("actualizado_en", models.DateTimeField(auto_now=True)),
                (
                    "actualizado_por",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "persona",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"cargo": "coord_oficina"},
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="objetivos_ventas",
                        to="catalogos.personaventas",
                    ),
                ),
            ],
            options={
                "verbose_name": "objetivo de ventas de oficina",
                "verbose_name_plural": "objetivos de ventas de oficina",
                "db_table": "catalogo_objetivos_ventas_oficina",
                "ordering": [
                    models.OrderBy(models.F("persona"), nulls_first=True),
                    models.OrderBy(models.F("desde"), nulls_first=True),
                    "id",
                ],
            },
        ),
    ]
