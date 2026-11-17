# Las comisiones pasan a pagarse por equipo y rol: las tarifas y tramos globales
# se van (viven en `catalogos.CondicionesEquipo`) y la asignacion supervisor ->
# coordinador de UN tambien (es `MembresiaEquipo.superior`).

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("comisiones", "0011_sin_cumplimiento_general"),
        ("catalogos", "0006_equipos_de_ventas"),
    ]

    operations = [
        migrations.DeleteModel(name="SupervisorUnidad"),
        migrations.RemoveField(model_name="condicionescomision", name="monto_equipo"),
        migrations.RemoveField(model_name="condicionescomision", name="monto_directa"),
        migrations.RemoveField(model_name="condicionescomision", name="monto_equipo_oficina"),
        migrations.RemoveField(model_name="condicionescomision", name="monto_directa_oficina"),
        migrations.RemoveField(model_name="condicionescomision", name="monto_directa_un"),
        migrations.RemoveField(model_name="condicionescomision", name="tramos_asesor"),
        migrations.RemoveField(model_name="condicionescomision", name="tramos_un"),
        migrations.RemoveField(model_name="condicionescomision", name="bonos_meta"),
    ]
