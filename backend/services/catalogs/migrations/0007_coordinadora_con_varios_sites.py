# Una coordinadora de oficina puede llevar mas de un site: `MembresiaEquipo.site`
# (FK) pasa a `sites` (M2M). Lo que ya estaba asignado se conserva.

from django.db import migrations, models


def site_a_sites(apps, schema_editor):
    """Copia el site de cada membresia a la nueva relacion."""
    Membresia = apps.get_model("catalogos", "MembresiaEquipo")
    for m in Membresia.objects.exclude(site__isnull=True):
        m.sites.add(m.site_id)


def sites_a_site(apps, schema_editor):
    """Marcha atras: se queda con el primer site de cada membresia."""
    Membresia = apps.get_model("catalogos", "MembresiaEquipo")
    for m in Membresia.objects.all():
        primero = m.sites.order_by("orden", "nombre").first()
        if primero is not None:
            m.site_id = primero.pk
            m.save(update_fields=["site"])


class Migration(migrations.Migration):
    dependencies = [
        ("catalogos", "0006_equipos_de_ventas"),
        ("subscriptions", "0011_equipos_en_sites_y_unidades"),
    ]

    operations = [
        migrations.AddField(
            model_name="membresiaequipo",
            name="sites",
            field=models.ManyToManyField(blank=True, related_name="membresias_m2m", to="subscriptions.site"),
        ),
        migrations.RunPython(site_a_sites, sites_a_site),
        migrations.RemoveField(model_name="membresiaequipo", name="site"),
        migrations.AlterField(
            model_name="membresiaequipo",
            name="sites",
            field=models.ManyToManyField(blank=True, related_name="membresias", to="subscriptions.site"),
        ),
    ]
