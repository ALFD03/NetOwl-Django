# Las zonas que se apartan del calculo de cumplimiento (las nuevas, sin base).

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0009_plan_comision_pyme_pct'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ZonaSinObjetivo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('desde', models.CharField(blank=True, max_length=7, null=True)),
                ('hasta', models.CharField(blank=True, max_length=7, null=True)),
                ('nota', models.CharField(blank=True, default='', max_length=255)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('zona', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='sin_objetivo', to='subscriptions.zona')),
            ],
            options={
                'verbose_name': 'zona sin objetivo',
                'verbose_name_plural': 'zonas sin objetivo',
                'db_table': 'catalogo_zonas_sin_objetivo',
                'ordering': ['zona__nombre'],
            },
        ),
    ]
