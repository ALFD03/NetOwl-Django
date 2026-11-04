"""La lista de unidades de negocio pasa a ser solo del usuario.

`config/0014` la puso en la matriz, compartida por perfiles y grupos, y el
grupo la sincronizaba a sus miembros. Se quita del grupo: que unidades ve cada
uno es de cada persona. El interruptor `can_view_all_business_units` sigue en
la matriz y puede venir del grupo.

No se pierde nada: los miembros de un grupo ya tenian copiada la lista del
grupo en su propio perfil, que es la que se conserva.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0015_permiso_unidades_de_negocio'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='permissiongroup',
            name='unidad_rf',
        ),
        migrations.RemoveField(
            model_name='permissiongroup',
            name='unidades_negocio',
        ),
    ]
