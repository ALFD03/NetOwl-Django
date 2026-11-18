# Una persona puede estar escrita de mas de una forma en Odoo (con y sin tilde, por
# ejemplo): `AliasPersona` guarda los otros nombres de cada columna.

import django.db.models.deletion
import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("catalogos", "0007_coordinadora_con_varios_sites")]

    operations = [
        migrations.CreateModel(
            name="AliasPersona",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "columna",
                    models.CharField(
                        choices=[("medio", "Medio"), ("supervisor", "Oportunidad/Administrador"), ("usuario", "Vendedor")],
                        max_length=10,
                    ),
                ),
                ("literal", models.CharField(max_length=200)),
                (
                    "persona",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="alias", to="catalogos.personaventas"
                    ),
                ),
            ],
            options={
                "verbose_name": "otro nombre de una persona de ventas",
                "verbose_name_plural": "otros nombres de personas de ventas",
                "db_table": "catalogo_alias_persona",
                "ordering": ["columna", "literal"],
            },
        ),
        migrations.AddConstraint(
            model_name="aliaspersona",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("literal"), models.F("columna"), name="alias_persona_literal_unico"
            ),
        ),
    ]
