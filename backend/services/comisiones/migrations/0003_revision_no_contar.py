"""La revision de una venta por facturar pasa a ser contarla o no contarla.

Diferir a un periodo posterior desaparece: una venta diferida que seguia sin
factura llegaba al destino sin forma de decidirla. Las decisiones de diferir que
hubiera se convierten en `no_contar`, que es lo que ya eran en su periodo: la
venta quedaba excluida de el.
"""

from django.db import migrations, models


def diferir_a_no_contar(apps, schema_editor):
    apps.get_model("comisiones", "RevisionComision").objects.filter(decision="diferir").update(decision="no_contar")


class Migration(migrations.Migration):
    dependencies = [
        ("comisiones", "0002_supervisor_unidad"),
    ]

    operations = [
        migrations.RunPython(diferir_a_no_contar, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="revisioncomision",
            name="decision",
            field=models.CharField(
                choices=[("contar", "Contar en este periodo"), ("no_contar", "No contar")], max_length=10
            ),
        ),
        migrations.RemoveField(model_name="revisioncomision", name="periodo_destino"),
    ]
