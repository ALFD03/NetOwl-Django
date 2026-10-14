"""El directorio de ventas: las personas que cobran comisiones.

Una tabla para los cuatro cargos (asesor, supervisor, coordinador de oficina
y de unidad de negocio), porque los tres literales del export —`Medio`,
`Medio/Supervisor` y `Vendedor`— se cruzan contra las mismas personas. Sin
cualificar el `db_table`: el `search_path` ya lo pone en el esquema del
entorno.
"""

import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='PersonaVentas',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=80)),
                ('apellido', models.CharField(max_length=80)),
                ('cargo', models.CharField(choices=[('asesor', 'Asesor de ventas'), ('supervisor', 'Supervisor de ventas'), ('coord_oficina', 'Coordinador de oficina'), ('coord_un', 'Coordinador de unidad de negocio')], max_length=16)),
                ('medio', models.CharField(max_length=160)),
                ('usuario_odoo', models.CharField(blank=True, default='', max_length=200)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'persona de ventas',
                'verbose_name_plural': 'personas de ventas',
                'db_table': 'catalogo_personas_ventas',
                'ordering': ['nombre', 'apellido'],
                'constraints': [models.UniqueConstraint(django.db.models.functions.text.Lower('medio'), name='persona_ventas_medio_unico'), models.UniqueConstraint(django.db.models.functions.text.Lower('usuario_odoo'), condition=models.Q(('usuario_odoo', ''), _negated=True), name='persona_ventas_usuario_unico'), models.CheckConstraint(condition=models.Q(models.Q(('cargo', 'coord_oficina'), _negated=True), models.Q(('usuario_odoo', ''), _negated=True), _connector='OR'), name='persona_ventas_coord_oficina_con_usuario')],
            },
        ),
    ]
