"""Quita `can_view_support_escalamiento`.

El escalamiento dejo de ser un bloque aparte: ahora es parte de las cifras de
cada grupo de trabajo (lo que ATC escala cuenta como cerrado por ATC y como
creado en Soporte), y recortarlo a unas cuentas dejaria los totales sin
explicacion. Se borra en una migracion propia, y no editando la 0017, porque la
0017 ya pudo aplicarse: la columna quedaria en la tabla sin modelo, y siendo
NOT NULL sin default haria fallar el alta de cualquier perfil.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0017_permisos_escalamiento_soporte'),
    ]

    operations = [
        migrations.RemoveField(model_name='permissiongroup', name='can_view_support_escalamiento'),
        migrations.RemoveField(model_name='profile', name='can_view_support_escalamiento'),
    ]
