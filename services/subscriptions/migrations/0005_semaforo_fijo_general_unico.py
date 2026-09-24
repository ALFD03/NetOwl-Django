"""El semaforo con umbrales fijos y el objetivo general como una sola fila.

Escrita a mano: `makemigrations` pregunta en interactivo si los campos del
semaforo se renombraron, y ademas hay que convertir sus valores.

**Semaforo.** Los umbrales de crecimiento y churn eran distancias al objetivo
(`crec_verde_margen = 2`: verde desde dos puntos por debajo del objetivo). Se
leian mal y el mismo porcentaje se pintaba distinto segun la zona, asi que pasan
a ser valores directos (`crec_verde = 4`: verde desde el 4%). La conversion usa
el objetivo general con el que se estaban leyendo, de modo que los colores que
se ven hoy no cambian: con 6% / 3%, unos margenes de 0 y 4 en crecimiento pasan
a verde desde 6 y amarillo desde 2.

**General.** Deja de tener tramos con fecha: es el valor por defecto de la
empresa, y lo que cambia en un mes concreto va en `ObjetivoMes`. Si hubiera
tramos generales con fecha, sus valores se pliegan en el general de base (el
mas reciente gana) y los tramos se borran; cuando se escribio esta migracion no
habia ninguno.
"""

from django.db import migrations, models


def _general(apps):
    """El objetivo general de base y sus dos valores (6% / 3% si falta)."""
    ObjetivoComercial = apps.get_model("subscriptions", "ObjetivoComercial")
    base = ObjetivoComercial.objects.filter(nivel="general", desde__isnull=True).first()
    crecimiento = base.crecimiento_pct if base and base.crecimiento_pct is not None else 6
    churn = base.churn_pct if base and base.churn_pct is not None else 3
    return base, crecimiento, churn


def margenes_a_umbrales(apps, schema_editor):
    """Convierte las distancias al objetivo en los umbrales que ya se veian."""
    SemaforoObjetivos = apps.get_model("subscriptions", "SemaforoObjetivos")
    _, crecimiento, churn = _general(apps)
    for fila in SemaforoObjetivos.objects.all():
        # Los campos ya se llaman `crec_verde`, etc., pero aun guardan margenes.
        fila.crec_verde = crecimiento - fila.crec_verde
        fila.crec_amarillo = crecimiento - fila.crec_amarillo
        fila.churn_verde = churn + fila.churn_verde
        fila.churn_amarillo = churn + fila.churn_amarillo
        fila.save()


def umbrales_a_margenes(apps, schema_editor):
    """La conversion inversa, para poder deshacer la migracion."""
    SemaforoObjetivos = apps.get_model("subscriptions", "SemaforoObjetivos")
    _, crecimiento, churn = _general(apps)
    for fila in SemaforoObjetivos.objects.all():
        fila.crec_verde = crecimiento - fila.crec_verde
        fila.crec_amarillo = crecimiento - fila.crec_amarillo
        fila.churn_verde = fila.churn_verde - churn
        fila.churn_amarillo = fila.churn_amarillo - churn
        fila.save()


def un_solo_general(apps, schema_editor):
    """Pliega los tramos generales con fecha en el general de base."""
    ObjetivoComercial = apps.get_model("subscriptions", "ObjetivoComercial")
    con_fecha = list(
        ObjetivoComercial.objects.filter(nivel="general", desde__isnull=False).order_by("desde")
    )
    if not con_fecha:
        return
    base, _, _ = _general(apps)
    if base is not None:
        for tramo in con_fecha:
            if tramo.crecimiento_pct is not None:
                base.crecimiento_pct = tramo.crecimiento_pct
            if tramo.churn_pct is not None:
                base.churn_pct = tramo.churn_pct
        base.save()
    ObjetivoComercial.objects.filter(pk__in=[tramo.pk for tramo in con_fecha]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("subscriptions", "0004_objetivos_comerciales"),
    ]

    operations = [
        migrations.RenameField("semaforoobjetivos", "crec_verde_margen", "crec_verde"),
        migrations.RenameField("semaforoobjetivos", "crec_amarillo_margen", "crec_amarillo"),
        migrations.RenameField("semaforoobjetivos", "churn_verde_margen", "churn_verde"),
        migrations.RenameField("semaforoobjetivos", "churn_amarillo_margen", "churn_amarillo"),
        migrations.RunPython(margenes_a_umbrales, umbrales_a_margenes),
        migrations.AlterField(
            model_name="semaforoobjetivos",
            name="crec_verde",
            field=models.DecimalField(decimal_places=2, default=4, max_digits=6),
        ),
        migrations.AlterField(
            model_name="semaforoobjetivos",
            name="crec_amarillo",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AlterField(
            model_name="semaforoobjetivos",
            name="churn_verde",
            field=models.DecimalField(decimal_places=2, default=3, max_digits=6),
        ),
        migrations.AlterField(
            model_name="semaforoobjetivos",
            name="churn_amarillo",
            field=models.DecimalField(decimal_places=2, default=4, max_digits=6),
        ),
        migrations.RunPython(un_solo_general, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="objetivocomercial",
            constraint=models.CheckConstraint(
                condition=~models.Q(nivel="general") | models.Q(desde__isnull=True),
                name="objetivo_general_sin_fecha",
            ),
        ),
    ]
