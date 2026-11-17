# Los sites y las unidades de negocio dicen que equipos de ventas los trabajan.
# La persona de la unidad deja de ser un campo suyo: ahora es la membresia de
# equipo (`catalogos.MembresiaEquipo.unidades`) la que apunta a la unidad.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("catalogos", "0006_equipos_de_ventas"),
        ("subscriptions", "0010_zonas_sin_objetivo"),
    ]

    operations = [
        migrations.RemoveField(model_name="coordinador", name="persona"),
        migrations.AddField(
            model_name="coordinador",
            name="equipos",
            field=models.ManyToManyField(blank=True, related_name="unidades_negocio", to="catalogos.equipoventas"),
        ),
        migrations.AddField(
            model_name="site",
            name="equipos",
            field=models.ManyToManyField(blank=True, related_name="sites", to="catalogos.equipoventas"),
        ),
    ]
