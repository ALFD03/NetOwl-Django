"""Intercambia los valores de los dos permisos de catalogo.

La 0006 los nombro al reves: llamo `comercial` a planes, reguladores e
ignorados, y `operacional` a zonas, sites, estados y coordinadores, cuando en el
negocio es justo lo contrario. El codigo ya asigna cada catalogo a su permiso
correcto; esta migracion intercambia los valores guardados para que **cada
cuenta y cada grupo conserven exactamente las mismas pestanas** que tenian.

Ejemplo: un grupo que tenia `operacional` para mantener zonas y sites pasa a
tener `comercial`, que es como ahora se llama ese acceso.

Intercambiar dos veces deja todo como estaba, asi que la misma funcion sirve
para deshacerla.
"""

from django.db import migrations
from django.db.models import F


def intercambiar(apps, schema_editor):
    """Pone en cada columna el valor que tenia la otra."""
    for modelo in ('Profile', 'PermissionGroup'):
        # Un UPDATE con las dos asignaciones lee los valores de antes de la
        # fila, asi que el intercambio es atomico y no necesita temporal.
        apps.get_model('config', modelo).objects.update(
            can_manage_catalogo_comercial=F('can_manage_catalogo_operacional'),
            can_manage_catalogo_operacional=F('can_manage_catalogo_comercial'),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('config', '0006_partir_permiso_de_catalogos'),
    ]

    operations = [
        migrations.RunPython(intercambiar, intercambiar),
    ]
