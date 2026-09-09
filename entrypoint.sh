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

exec "$@"
