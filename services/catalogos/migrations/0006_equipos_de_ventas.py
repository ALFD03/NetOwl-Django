# Los equipos de ventas vuelven, esta vez como agrupacion de roles con sus
# propias condiciones de pago. `PersonaVentas` pasa a ser solo la identidad y el
# cargo se muda a la membresia de equipo.

import django.db.models.deletion
import django.db.models.functions.text
from django.conf import settings
from django.db import migrations, models

EQUIPOS = [
    ("verticalizacion", "Verticalización"),
    ("carabobo", "Carabobo"),
    ("nacional", "Nacional"),
    ("aragua", "Aragua"),
    ("la_victoria", "La Victoria"),
]


def exigir_directorio_vacio(apps, schema_editor):
    """Se niega a seguir si el directorio todavia tiene personas.

    Quitar el cargo de `PersonaVentas` dejaria a cada persona sin papel, y las
    comisiones ya calculadas apuntandole. El directorio se vacia antes con
    `manage.py reiniciar_ventas`, que tambien limpia lo que depende de el.
    """
    Persona = apps.get_model("catalogos", "PersonaVentas")
    if Persona.objects.exists():
        raise RuntimeError(
            "El directorio de ventas todavía tiene personas. Antes de migrar, "
            "ejecuta `python manage.py reiniciar_ventas --ejecutar` (ensáyalo sin --ejecutar)."
        )


def sembrar_equipos(apps, schema_editor):
    """Crea los cinco equipos, con el orden en que se presentan."""
    Equipo = apps.get_model("catalogos", "EquipoVentas")
    for orden, (slug, nombre) in enumerate(EQUIPOS, start=1):
        Equipo.objects.get_or_create(slug=slug, defaults={"nombre": nombre, "orden": orden})


class Migration(migrations.Migration):
    dependencies = [
        ("catalogos", "0005_sin_equipos_site_y_objetivo_oficina"),
        ("subscriptions", "0010_zonas_sin_objetivo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(exigir_directorio_vacio, migrations.RunPython.noop),
        # --- PersonaVentas: de cargo + literales a solo identidad ---
        migrations.RemoveConstraint(model_name="personaventas", name="persona_ventas_coord_oficina_con_usuario"),
        migrations.RemoveConstraint(model_name="personaventas", name="persona_ventas_medio_unico"),
        migrations.RemoveField(model_name="personaventas", name="cargo"),
        migrations.RemoveField(model_name="personaventas", name="estado_fijo"),
        migrations.RemoveField(model_name="personaventas", name="site"),
        migrations.AlterField(
            model_name="personaventas",
            name="medio",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddConstraint(
            model_name="personaventas",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("medio"),
                condition=models.Q(("medio", ""), _negated=True),
                name="persona_ventas_medio_unico",
            ),
        ),
        migrations.AlterField(
            model_name="objetivoventasoficina",
            name="persona",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="objetivos_ventas",
                to="catalogos.personaventas",
            ),
        ),
        # --- Equipos, membresias y condiciones ---
        migrations.CreateModel(
            name="EquipoVentas",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=30, unique=True)),
                ("nombre", models.CharField(max_length=60, unique=True)),
                ("orden", models.PositiveSmallIntegerField(default=0)),
            ],
            options={
                "verbose_name": "equipo de ventas",
                "verbose_name_plural": "equipos de ventas",
                "db_table": "catalogo_equipos_ventas",
                "ordering": ["orden", "nombre"],
            },
        ),
        migrations.CreateModel(
            name="MembresiaEquipo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "rol",
                    models.CharField(
                        choices=[
                            ("jefe", "Jefe"),
                            ("jefe_un", "Jefe de unidades de negocio"),
                            ("coord_un", "Coordinador de unidad de negocio"),
                            ("gerente_un", "Gerente de unidad de negocio"),
                            ("gerente_ops", "Gerente de operaciones"),
                            ("coord_oficina", "Coordinadora de oficina"),
                            ("supervisor", "Supervisor de ventas"),
                            ("asesor", "Asesor de ventas"),
                            ("administradora", "Administradora de ventas"),
                            ("telemarketing", "Asesor de telemarketing"),
                        ],
                        max_length=20,
                    ),
                ),
                ("creado_en", models.DateTimeField(auto_now_add=True)),
                ("actualizado_en", models.DateTimeField(auto_now=True)),
                (
                    "equipo",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="membresias",
                        to="catalogos.equipoventas",
                    ),
                ),
                (
                    "persona",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="membresias",
                        to="catalogos.personaventas",
                    ),
                ),
                (
                    "site",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="membresias",
                        to="subscriptions.site",
                    ),
                ),
                (
                    "superior",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="subordinados",
                        to="catalogos.membresiaequipo",
                    ),
                ),
                (
                    "unidades",
                    models.ManyToManyField(blank=True, related_name="membresias", to="subscriptions.coordinador"),
                ),
            ],
            options={
                "verbose_name": "miembro de un equipo de ventas",
                "verbose_name_plural": "miembros de equipos de ventas",
                "db_table": "catalogo_membresias_equipo",
                "ordering": ["equipo__orden", "rol", "persona__nombre", "persona__apellido"],
                "constraints": [
                    models.UniqueConstraint(fields=("persona", "equipo"), name="membresia_persona_equipo_unica"),
                ],
            },
        ),
        migrations.CreateModel(
            name="CondicionesEquipo",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "rol",
                    models.CharField(
                        choices=[
                            ("jefe", "Jefe"),
                            ("jefe_un", "Jefe de unidades de negocio"),
                            ("coord_un", "Coordinador de unidad de negocio"),
                            ("gerente_un", "Gerente de unidad de negocio"),
                            ("gerente_ops", "Gerente de operaciones"),
                            ("coord_oficina", "Coordinadora de oficina"),
                            ("supervisor", "Supervisor de ventas"),
                            ("asesor", "Asesor de ventas"),
                            ("administradora", "Administradora de ventas"),
                            ("telemarketing", "Asesor de telemarketing"),
                        ],
                        max_length=20,
                    ),
                ),
                ("parametros", models.JSONField(default=dict)),
                ("actualizado_en", models.DateTimeField(auto_now=True)),
                (
                    "actualizado_por",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "equipo",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="condiciones",
                        to="catalogos.equipoventas",
                    ),
                ),
            ],
            options={
                "verbose_name": "condiciones de pago de un rol",
                "verbose_name_plural": "condiciones de pago de los roles",
                "db_table": "catalogo_condiciones_equipo",
                "constraints": [
                    models.UniqueConstraint(fields=("equipo", "rol"), name="condiciones_equipo_rol_unica"),
                ],
            },
        ),
        migrations.RunPython(sembrar_equipos, migrations.RunPython.noop),
    ]
