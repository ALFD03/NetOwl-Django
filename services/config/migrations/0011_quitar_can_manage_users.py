"""Borra `can_manage_users`, ya repartido en 0010 entre los seis de cuentas."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0010_partir_administracion_de_cuentas'),
    ]

    operations = [
        migrations.RemoveField(model_name='permissiongroup', name='can_manage_users'),
        migrations.RemoveField(model_name='profile', name='can_manage_users'),
    ]
