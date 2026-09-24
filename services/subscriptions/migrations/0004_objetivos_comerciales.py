"""Los objetivos comerciales: tramos por nivel, excepciones por mes y semaforo.

Siembra lo que la aplicacion tenia escrito a mano: el objetivo general de 6% de
crecimiento y 3% de churn, desde siempre, y los umbrales de color con los que
se pintaban los reportes. Con esto nada cambia en pantalla hasta que alguien
edite un objetivo.

Las tablas viven en `public`, sin cualificar con `DB_SCHEMA`, como el resto del
catalogo: aqui no hay nada que retocar a mano por entorno.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def sembrar(apps, schema_editor):
    """El objetivo general de siempre y el semaforo por defecto, si faltan."""
    ObjetivoComercial = apps.get_model("subscriptions", "ObjetivoComercial")
    SemaforoObjetivos = apps.get_model("subscriptions", "SemaforoObjetivos")
    if not ObjetivoComercial.objects.filter(nivel="general", desde__isnull=True).exists():
        ObjetivoComercial.objects.create(nivel="general", desde=None, crecimiento_pct=6, churn_pct=3)
    SemaforoObjetivos.objects.get_or_create(pk=1)


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0003_planregulador_plan_plan_regulador'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SemaforoObjetivos',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cumpl_verde', models.DecimalField(decimal_places=2, default=100, max_digits=6)),
                ('cumpl_amarillo', models.DecimalField(decimal_places=2, default=60, max_digits=6)),
                ('crec_verde_margen', models.DecimalField(decimal_places=2, default=2, max_digits=6)),
                ('crec_amarillo_margen', models.DecimalField(decimal_places=2, default=6, max_digits=6)),
                ('churn_verde_margen', models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ('churn_amarillo_margen', models.DecimalField(decimal_places=2, default=1, max_digits=6)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'semaforo de objetivos',
                'verbose_name_plural': 'semaforo de objetivos',
                'db_table': 'catalogo_objetivos_semaforo',
            },
        ),
        migrations.CreateModel(
            name='ObjetivoComercial',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nivel', models.CharField(choices=[('general', 'General'), ('estado', 'Estado'), ('site', 'Site'), ('coordinador', 'Coordinador'), ('zona', 'Zona')], max_length=12)),
                ('desde', models.CharField(blank=True, max_length=7, null=True)),
                ('crecimiento_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('churn_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('nota', models.CharField(blank=True, default='', max_length=255)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('coordinador', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='objetivos', to='subscriptions.coordinador')),
                ('estado', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='objetivos', to='subscriptions.estado')),
                ('site', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='objetivos', to='subscriptions.site')),
                ('zona', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='objetivos', to='subscriptions.zona')),
            ],
            options={
                'verbose_name': 'objetivo comercial',
                'verbose_name_plural': 'objetivos comerciales',
                'db_table': 'catalogo_objetivos',
                'ordering': ['nivel', models.OrderBy(models.F('desde'), nulls_first=True), 'id'],
                'constraints': [models.CheckConstraint(condition=models.Q(models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'general'), ('site__isnull', True), ('zona__isnull', True)), models.Q(('coordinador__isnull', True), ('estado__isnull', False), ('nivel', 'estado'), ('site__isnull', True), ('zona__isnull', True)), models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'site'), ('site__isnull', False), ('zona__isnull', True)), models.Q(('coordinador__isnull', False), ('estado__isnull', True), ('nivel', 'coordinador'), ('site__isnull', True), ('zona__isnull', True)), models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'zona'), ('site__isnull', True), ('zona__isnull', False)), _connector='OR'), name='objetivo_referencia_segun_nivel'), models.CheckConstraint(condition=models.Q(('crecimiento_pct__isnull', False), ('churn_pct__isnull', False), _connector='OR'), name='objetivo_con_algun_valor')],
            },
        ),
        migrations.CreateModel(
            name='ObjetivoMes',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('periodo', models.CharField(max_length=7, unique=True)),
                ('crecimiento_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('churn_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('nota', models.CharField(blank=True, default='', max_length=255)),
                ('actualizado_en', models.DateTimeField(auto_now=True)),
                ('actualizado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'objetivo de un mes',
                'verbose_name_plural': 'objetivos de meses',
                'db_table': 'catalogo_objetivos_mes',
                'ordering': ['-periodo'],
                'constraints': [models.CheckConstraint(condition=models.Q(('crecimiento_pct__isnull', False), ('churn_pct__isnull', False), _connector='OR'), name='objetivo_mes_con_algun_valor')],
            },
        ),
        migrations.RunPython(sembrar, migrations.RunPython.noop),
    ]
