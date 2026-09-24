"""El estado `cancelled` de `AnalysisJob`.

**No toca la tabla.** Django no genera un CHECK en Postgres para `choices`, asi
que anadir un valor a la lista es solo estado del proyecto: existe para que
`makemigrations --check` quede limpio, igual que `config/migrations/0002`.

Eso es lo que hace segura esta migracion en un despliegue donde
`django_migrations` vive en `public` y la comparten todos los entornos: un
entorno que nunca llegue a aplicarla funciona igual, porque no hay DDL que
aplicar. Ese es tambien el motivo de cancelar escribiendo en `status` en vez de
anadir una columna -esa si habria hecho falta crearla esquema por esquema-.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('imports', '0002_analysisjob'),
    ]

    operations = [
        migrations.AlterField(
            model_name='analysisjob',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'En cola'),
                    ('running', 'En ejecucion'),
                    ('success', 'Completado'),
                    ('error', 'Error'),
                    ('cancelled', 'Cancelado'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
    ]
