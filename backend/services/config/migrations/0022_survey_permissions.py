"""Permisos de Encuestas: ver, atender, configurar y borrar un mes. Nacen cerrados para todos."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0021_english_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='permissiongroup',
            name='can_answer_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='can_delete_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='can_manage_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='permissiongroup',
            name='can_view_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_answer_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_delete_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_manage_surveys',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='profile',
            name='can_view_surveys',
            field=models.BooleanField(default=False),
        ),
    ]
