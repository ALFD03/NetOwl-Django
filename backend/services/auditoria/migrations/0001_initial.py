"""La tabla del registro de auditoria (`auditoria_registro`). Solo se anade."""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RegistroAuditoria',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fecha', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('username', models.CharField(blank=True, default='', max_length=150)),
                ('ip', models.GenericIPAddressField(blank=True, null=True)),
                ('modulo', models.CharField(max_length=40)),
                ('accion', models.CharField(max_length=80)),
                ('metodo', models.CharField(blank=True, default='', max_length=10)),
                ('ruta', models.CharField(blank=True, default='', max_length=255)),
                ('estado_http', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('resultado', models.CharField(choices=[('ok', 'Correcto'), ('rechazado', 'Rechazado'), ('denegado', 'Denegado'), ('limitado', 'Limitado'), ('error', 'Error')], default='ok', max_length=10)),
                ('objeto', models.CharField(blank=True, default='', max_length=255)),
                ('descripcion', models.TextField(blank=True, default='')),
                ('detalle', models.JSONField(blank=True, null=True)),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'auditoria_registro',
                'ordering': ['-fecha', '-id'],
                'indexes': [models.Index(fields=['modulo', 'fecha'], name='ix_auditoria_modulo_fecha'), models.Index(fields=['usuario', 'fecha'], name='ix_auditoria_usuario_fecha')],
            },
        ),
    ]
