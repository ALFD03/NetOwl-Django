"""La revision pasa a decidirse con las facturas: las decisiones anteriores se reinician.

Hasta ahora se revisaban las ventas «por facturar» sin saber si su primera
mensualidad se habia pagado. Con el export de facturas la revision cambia de
contenido (contradicciones entre la suscripcion y su factura, mensualidades
canceladas), y una decision tomada sin ese dato ya no responde a la misma
pregunta. Se borran las de los periodos sin cerrar; las de un periodo cerrado
no se tocan, porque lo que se pago quedo congelado en el.
"""

from django.db import migrations


def reiniciar_revisiones(apps, schema_editor):
    cerrados = apps.get_model("comisiones", "ComisionPeriodo").objects.filter(estado="cerrado").values_list(
        "periodo", flat=True
    )
    apps.get_model("comisiones", "RevisionComision").objects.exclude(periodo_origen__in=list(cerrados)).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("comisiones", "0005_tasa_conatel"),
    ]

    operations = [
        migrations.RunPython(reiniciar_revisiones, migrations.RunPython.noop),
    ]
