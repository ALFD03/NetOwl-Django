"""Objetivos por sucursal y por nodo (zona - sucursal).

Dos niveles nuevos en `ObjetivoComercial`: `sucursal` (NETCOM, NYC... para
todos sus nodos) y `zona_sucursal` (un nodo concreto, como "Guacara - NYC").
La sucursal no es un catalogo sino el texto del export, asi que va en su propio
campo; el nodo es la clave ajena de su zona mas ese texto. La restriccion que
exige la referencia de cada nivel se rehace para incluirlos.

`nivel` crece a 16 caracteres porque `zona_sucursal` no cabia en 12. No hay
datos que convertir: los objetivos existentes quedan con la sucursal vacia,
que es lo que la restriccion pide para su nivel.
"""

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0005_semaforo_fijo_general_unico'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='objetivocomercial',
            name='objetivo_referencia_segun_nivel',
        ),
        migrations.AddField(
            model_name='objetivocomercial',
            name='sucursal',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AlterField(
            model_name='objetivocomercial',
            name='nivel',
            field=models.CharField(choices=[('general', 'General'), ('sucursal', 'Sucursal'), ('estado', 'Estado'), ('site', 'Site'), ('coordinador', 'Coordinador'), ('zona', 'Zona'), ('zona_sucursal', 'Zona - sucursal')], max_length=16),
        ),
        migrations.AddConstraint(
            model_name='objetivocomercial',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'general'), ('site__isnull', True), ('zona__isnull', True), ('sucursal', '')), models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'sucursal'), ('site__isnull', True), ('zona__isnull', True), models.Q(('sucursal', ''), _negated=True)), models.Q(('coordinador__isnull', True), ('estado__isnull', False), ('nivel', 'estado'), ('site__isnull', True), ('zona__isnull', True), ('sucursal', '')), models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'site'), ('site__isnull', False), ('zona__isnull', True), ('sucursal', '')), models.Q(('coordinador__isnull', False), ('estado__isnull', True), ('nivel', 'coordinador'), ('site__isnull', True), ('zona__isnull', True), ('sucursal', '')), models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'zona'), ('site__isnull', True), ('zona__isnull', False), ('sucursal', '')), models.Q(('coordinador__isnull', True), ('estado__isnull', True), ('nivel', 'zona_sucursal'), ('site__isnull', True), ('zona__isnull', False), models.Q(('sucursal', ''), _negated=True)), _connector='OR'), name='objetivo_referencia_segun_nivel'),
        ),
    ]
