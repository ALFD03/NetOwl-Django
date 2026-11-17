"""Los productos ignorados pasan a ser nombres ignorados por area.

El modulo de Catalogos tiene una lista de pendientes por area —productos,
zonas y, en adelante, vendedores— y cada una admite un "ignorar". La tabla
existente sirve para las tres con una columna `area`; las filas que ya hay son
todas productos, que es el valor por defecto. La unicidad pasa del nombre a la
pareja (area, nombre): el mismo texto puede callarse en una lista y no en otra.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0006_objetivos_por_sucursal'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='productoignorado',
            options={'ordering': ['area', 'nombre'], 'verbose_name': 'nombre ignorado', 'verbose_name_plural': 'nombres ignorados'},
        ),
        migrations.AddField(
            model_name='productoignorado',
            name='area',
            field=models.CharField(choices=[('productos', 'Productos'), ('estructura', 'Estructura'), ('ventas', 'Ventas')], default='productos', max_length=16),
        ),
        migrations.AlterField(
            model_name='productoignorado',
            name='nombre',
            field=models.CharField(max_length=200),
        ),
        migrations.AddConstraint(
            model_name='productoignorado',
            constraint=models.UniqueConstraint(fields=('area', 'nombre'), name='catalogo_ignorado_area_nombre'),
        ),
    ]
