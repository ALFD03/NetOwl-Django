"""Permisos de API (`can_use_api`, `can_manage_api_tokens`) y la tabla de tokens."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0019_permiso_borrar_comisiones'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='permissiongroup',
            name='can_manage_api_tokens',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='can_use_api',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_manage_api_tokens',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_use_api',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='ApiToken',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80)),
                ('prefix', models.CharField(max_length=12, unique=True)),
                ('key_hash', models.CharField(max_length=64, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('last_used_at', models.DateTimeField(blank=True, null=True)),
                ('last_used_ip', models.GenericIPAddressField(blank=True, null=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='api_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'config_api_token',
                'ordering': ['-created_at'],
            },
        ),
    ]
