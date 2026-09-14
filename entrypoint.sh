#!/bin/bash
set -e

# Los secretos (SECRET_KEY, credenciales de BD) se leen de Vault al importar
# settings.py, por lo que collectstatic solo puede ejecutarse en runtime.
#
# El contenedor del worker de Celery usa la misma imagen pero no sirve HTTP:
# recolectar estaticos alli solo retrasa su arranque, asi que lo salta con
# SKIP_COLLECTSTATIC=1 (ver docker-compose).
if [ "${SKIP_COLLECTSTATIC:-0}" != "1" ]; then
    python manage.py collectstatic --noinput
fi

# La tabla de sesiones vive en el esquema del entorno y no puede crearla una
# migracion, porque django_migrations es compartida (ver el comando). Es
# idempotente: en un esquema ya preparado no hace nada.
python manage.py preparar_sesiones

# Por lo mismo, las tablas ORM de imports (import_action_logs, analysis_jobs)
# estan cualificadas con DB_SCHEMA y sus migraciones se anotan en la
# django_migrations compartida. Tambien idempotente.
python manage.py preparar_imports

exec "$@"
