"""Los cierres archivados: la copia de un cierre que se guarda al reabrir el periodo."""

from decimal import Decimal

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('comisiones', '0007_adelantos_y_manuales'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ComisionCierreArchivado',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version', models.PositiveIntegerField()),
                ('cerrado_por', models.CharField(blank=True, default='', max_length=150)),
                ('cerrado_en', models.DateTimeField(blank=True, null=True)),
                ('reabierto_por_nombre', models.CharField(blank=True, default='', max_length=150)),
                ('reabierto_en', models.DateTimeField(auto_now_add=True)),
                ('motivo', models.TextField()),
                ('total_neto', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=14)),
                ('pagos', models.PositiveIntegerField(default=0)),
                ('ventas', models.PositiveIntegerField(default=0)),
                ('copia', models.JSONField()),
                ('periodo', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='archivos', to='comisiones.comisionperiodo')),
                ('reabierto_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'cierre archivado',
                'verbose_name_plural': 'cierres archivados',
                'db_table': 'comisiones_cierres_archivados',
                'ordering': ['periodo', '-version'],
                'constraints': [models.UniqueConstraint(fields=('periodo', 'version'), name='uq_cierre_archivado_version')],
            },
        ),
    ]
