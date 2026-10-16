"""El modulo de Comisiones: configuracion de pago, periodos y lo congelado al cerrar.

Sin cualificar los `db_table`: el `search_path` ya los pone en el esquema del
entorno. Las condiciones no se siembran aqui: `CondicionesComision.actual()`
crea la fila unica con la politica por defecto la primera vez que se lee.
"""

from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

import services.comisiones.models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('catalogos', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ComisionPeriodo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('periodo', models.CharField(max_length=7, unique=True)),
                ('inicio', models.DateField()),
                ('inicio_promo', models.DateField()),
                ('estado', models.CharField(choices=[('borrador', 'Borrador'), ('cerrado', 'Cerrado')], default='borrador', max_length=10)),
                ('condiciones', models.JSONField(blank=True, null=True)),
                ('resumen', models.JSONField(blank=True, null=True)),
                ('creado_en', models.DateTimeField(auto_now_add=True)),
                ('cerrado_en', models.DateTimeField(blank=True, null=True)),
                ('cerrado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('creado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'periodo de comisiones',
                'verbose_name_plural': 'periodos de comisiones',
                'db_table': 'comisiones_periodos',
                'ordering': ['-periodo'],
            },
        ),
        migrations.CreateModel(
            name='ComisionPago',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=170)),
                ('cargo', models.CharField(max_length=16)),
                ('neto', models.DecimalField(decimal_places=2, max_digits=12)),
                ('datos', models.JSONField()),
                ('persona', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='catalogos.personaventas')),
                ('periodo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pagos', to='comisiones.comisionperiodo')),
            ],
            options={
                'verbose_name': 'pago de un periodo cerrado',
                'verbose_name_plural': 'pagos de periodos cerrados',
                'db_table': 'comisiones_pagos',
                'ordering': ['cargo', 'nombre'],
            },
        ),
        migrations.CreateModel(
            name='ComisionVenta',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('orden', models.CharField(db_index=True, max_length=80)),
                ('clasificacion', models.CharField(max_length=12)),
                ('datos', models.JSONField()),
                ('periodo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ventas', to='comisiones.comisionperiodo')),
            ],
            options={
                'verbose_name': 'venta de un periodo cerrado',
                'verbose_name_plural': 'ventas de periodos cerrados',
                'db_table': 'comisiones_ventas',
            },
        ),
        migrations.CreateModel(
            name='CondicionesComision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monto_equipo', models.DecimalField(decimal_places=2, default=Decimal('2.5'), max_digits=8)),
                ('monto_directa', models.DecimalField(decimal_places=2, default=Decimal('4'), max_digits=8)),
                ('monto_directa_un', models.DecimalField(decimal_places=2, default=Decimal('4'), max_digits=8)),
                ('tramos_asesor', models.JSONField(default=services.comisiones.models._tramos_asesor)),
                ('tramos_un', models.JSONField(default=services.comisiones.models._tramos_un)),
                ('dia_promocional', models.PositiveSmallIntegerField(default=25)),
                ('dias_espera', models.PositiveSmallIntegerField(default=15)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'condiciones de comision',
                'verbose_name_plural': 'condiciones de comision',
                'db_table': 'comisiones_condiciones',
            },
        ),
        migrations.CreateModel(
            name='PosicionJerarquia',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('persona', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='posicion', to='catalogos.personaventas')),
                ('superior', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subordinados', to='catalogos.personaventas')),
            ],
            options={
                'verbose_name': 'posicion en la jerarquia',
                'verbose_name_plural': 'jerarquia de ventas',
                'db_table': 'comisiones_jerarquia',
            },
        ),
        migrations.CreateModel(
            name='IndicadorComision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('periodo', models.CharField(max_length=7)),
                ('cumplimiento_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('crecimiento_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('persona', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='indicadores_comision', to='catalogos.personaventas')),
            ],
            options={
                'verbose_name': 'indicador de comision',
                'verbose_name_plural': 'indicadores de comision',
                'db_table': 'comisiones_indicadores',
                'constraints': [models.UniqueConstraint(fields=('periodo', 'persona'), name='comision_indicador_unico')],
            },
        ),
        migrations.CreateModel(
            name='RevisionComision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('orden', models.CharField(max_length=80)),
                ('periodo_origen', models.CharField(max_length=7)),
                ('decision', models.CharField(choices=[('contar', 'Contar en este periodo'), ('diferir', 'Diferir a otro periodo')], max_length=10)),
                ('periodo_destino', models.CharField(blank=True, default='', max_length=7)),
                ('nota', models.CharField(blank=True, default='', max_length=255)),
                ('decidido_en', models.DateTimeField(auto_now=True)),
                ('decidido_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'revision de venta',
                'verbose_name_plural': 'revisiones de ventas',
                'db_table': 'comisiones_revisiones',
                'constraints': [models.UniqueConstraint(fields=('orden', 'periodo_origen'), name='comision_revision_unica')],
            },
        ),
    ]
