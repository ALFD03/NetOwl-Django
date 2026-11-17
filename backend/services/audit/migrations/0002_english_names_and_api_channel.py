"""Nombres en inglés (solo estado: tablas y columnas no cambian) y canal, token y duración."""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("auditoria", "0001_initial"),
        ("config", "0020_api_tokens"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RenameModel("RegistroAuditoria", "AuditLog"),
                migrations.RemoveIndex("auditlog", "ix_auditoria_modulo_fecha"),
                migrations.RemoveIndex("auditlog", "ix_auditoria_usuario_fecha"),
                migrations.RenameField("auditlog", "fecha", "created_at"),
                migrations.RenameField("auditlog", "usuario", "user"),
                migrations.RenameField("auditlog", "modulo", "module"),
                migrations.RenameField("auditlog", "accion", "action"),
                migrations.RenameField("auditlog", "metodo", "method"),
                migrations.RenameField("auditlog", "ruta", "path"),
                migrations.RenameField("auditlog", "estado_http", "status_code"),
                migrations.RenameField("auditlog", "resultado", "outcome"),
                migrations.RenameField("auditlog", "objeto", "target"),
                migrations.RenameField("auditlog", "descripcion", "description"),
                migrations.RenameField("auditlog", "detalle", "detail"),
                migrations.AlterField("auditlog", "created_at", models.DateTimeField(db_column="fecha", db_index=True, default=django.utils.timezone.now)),
                migrations.AlterField("auditlog", "user", models.ForeignKey(blank=True, db_column="usuario_id", null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                migrations.AlterField("auditlog", "module", models.CharField(db_column="modulo", max_length=40)),
                migrations.AlterField("auditlog", "action", models.CharField(db_column="accion", max_length=80)),
                migrations.AlterField("auditlog", "method", models.CharField(blank=True, db_column="metodo", default="", max_length=10)),
                migrations.AlterField("auditlog", "path", models.CharField(blank=True, db_column="ruta", default="", max_length=255)),
                migrations.AlterField("auditlog", "status_code", models.PositiveSmallIntegerField(blank=True, db_column="estado_http", null=True)),
                migrations.AlterField("auditlog", "outcome", models.CharField(choices=[("ok", "Correcto"), ("rechazado", "Rechazado"), ("denegado", "Denegado"), ("limitado", "Limitado"), ("error", "Error")], db_column="resultado", default="ok", max_length=10)),
                migrations.AlterField("auditlog", "target", models.CharField(blank=True, db_column="objeto", default="", max_length=255)),
                migrations.AlterField("auditlog", "description", models.TextField(blank=True, db_column="descripcion", default="")),
                migrations.AlterField("auditlog", "detail", models.JSONField(blank=True, db_column="detalle", null=True)),
                migrations.AlterModelOptions("auditlog", {"ordering": ["-created_at", "-id"]}),
                migrations.AddIndex("auditlog", models.Index(fields=["module", "created_at"], name="ix_auditoria_modulo_fecha")),
                migrations.AddIndex("auditlog", models.Index(fields=["user", "created_at"], name="ix_auditoria_usuario_fecha")),
            ],
        ),
        migrations.AddField(
            model_name="auditlog",
            name="channel",
            field=models.CharField(choices=[("web", "Aplicación"), ("api", "API con token"), ("worker", "Worker")], default="web", max_length=10),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="duration_ms",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="token",
            field=models.ForeignKey(blank=True, db_index=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="config.apitoken"),
        ),
        migrations.AddIndex(
            model_name="auditlog",
            index=models.Index(fields=["token", "created_at"], name="ix_auditoria_token_fecha"),
        ),
    ]
