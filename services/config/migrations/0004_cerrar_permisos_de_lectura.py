"""Cierra por defecto los permisos de lectura, sin tocar a las cuentas existentes.

Los diecisiete `can_view_*` nacian en True, de modo que cualquier cuenta recien
creada veia de inmediato churn, CRM, soporte, importaciones y el reporte de la
reguladora. Pasan a `default=False`: conceder lectura es ahora un acto
explicito desde `/auth/users/`.

**Esta migracion no escribe ni una fila, y es a proposito.** Cambiar un
`default` solo afecta a las filas que se inserten a partir de ahora; las que ya
existen conservan el valor que tienen. Esto importa mas de lo que parece,
porque esos valores no son todos True: los grupos reales del sistema tienen la
lectura recortada a mano desde la pantalla de administracion (uno con tres
permisos concedidos de diecisiete, otro con siete). Un `RunPython` que los
pusiera todos a True "para conservar el acceso" haria justo lo contrario de lo
que pretende: le abriria a esas cuentas modulos que alguien les cerro
deliberadamente.

Recuerde que `config_profile` y `config_permissiongroup` viven en `public` y
los comparten todos los entornos (ver CLAUDE.md): esto se aplica una sola vez.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0003_permissiongroup_can_manage_catalogos_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_crm',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_crm_analytics',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_crm_results',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_eta',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_import_history',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_imports',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_imports_crm',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_imports_subs',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_imports_support',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_subs_analytics',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_subs_lifetime',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_subs_results',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_subs_sales',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_subscriptions',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_support',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_support_analytics',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='permissiongroup',
            name='can_view_support_results',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_crm',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_crm_analytics',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_crm_results',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_eta',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_import_history',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_imports',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_imports_crm',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_imports_subs',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_imports_support',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_subs_analytics',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_subs_lifetime',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_subs_results',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_subs_sales',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_subscriptions',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_support',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_support_analytics',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='profile',
            name='can_view_support_results',
            field=models.BooleanField(default=False),
        ),
    ]
