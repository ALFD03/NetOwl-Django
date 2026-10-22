"""Parte `can_manage_users` en un permiso por accion, y anade dos mas.

`can_manage_users` era un solo interruptor para ver, crear, borrar, cambiar
contrasenas y editar matrices y grupos. Se sustituye por:

* `can_view_users`, `can_create_users`, `can_edit_user_permissions`,
  `can_change_passwords`, `can_delete_users`, `can_manage_groups`;
* `can_view_auditoria`, el registro nuevo de `services/auditoria`;
* `can_reopen_comisiones`, separado de `can_manage_comisiones` porque reabrir
  deshace una nomina ya cerrada.

Nadie pierde nada: quien tenia `can_manage_users` recibe los seis de cuentas y
el de auditoria, y quien tenia `can_manage_comisiones` recibe el de reabrir.
Quitar luego lo que sobre es un acto explicito, desde `/auth/users/`. El campo
viejo se borra en la migracion siguiente, una vez copiado.
"""

from django.db import migrations, models

CUENTAS = [
    'can_view_users', 'can_create_users', 'can_edit_user_permissions',
    'can_change_passwords', 'can_delete_users', 'can_manage_groups',
    'can_view_auditoria',
]
NUEVOS = CUENTAS + ['can_reopen_comisiones']


def heredar(apps, schema_editor):
    for modelo in ('Profile', 'PermissionGroup'):
        Modelo = apps.get_model('config', modelo)
        Modelo.objects.filter(can_manage_users=True).update(**{campo: True for campo in CUENTAS})
        Modelo.objects.filter(can_manage_comisiones=True).update(can_reopen_comisiones=True)


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0009_permisos_comisiones'),
    ]

    operations = [
        *[
            migrations.AddField(
                model_name=modelo,
                name=campo,
                field=models.BooleanField(default=False),
            )
            for modelo in ('permissiongroup', 'profile')
            for campo in NUEVOS
        ],
        migrations.RunPython(heredar, migrations.RunPython.noop),
    ]
