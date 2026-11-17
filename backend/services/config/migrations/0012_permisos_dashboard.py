"""Separa el dashboard de cada modulo del permiso de entrar en el.

Hasta ahora `can_view_subscriptions`, `can_view_crm` y `can_view_support`
abrian tambien el dashboard del modulo, que no tenia permiso propio, asi que no
se podia dar a alguien una sola pagina del modulo sin ensenarle la portada.

Nadie pierde nada: quien entraba en el modulo recibe su dashboard. Quitarlo
luego es un acto explicito, desde `/auth/users/`.
"""

from django.db import migrations, models

DASHBOARDS = {
    'can_view_subs_dashboard': 'can_view_subscriptions',
    'can_view_crm_dashboard': 'can_view_crm',
    'can_view_support_dashboard': 'can_view_support',
}


def heredar(apps, schema_editor):
    for modelo in ('Profile', 'PermissionGroup'):
        Modelo = apps.get_model('config', modelo)
        for dashboard, modulo in DASHBOARDS.items():
            Modelo.objects.filter(**{modulo: True}).update(**{dashboard: True})


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0011_quitar_can_manage_users'),
    ]

    operations = [
        *[
            migrations.AddField(
                model_name=modelo,
                name=campo,
                field=models.BooleanField(default=False),
            )
            for modelo in ('permissiongroup', 'profile')
            for campo in DASHBOARDS
        ],
        migrations.RunPython(heredar, migrations.RunPython.noop),
    ]
