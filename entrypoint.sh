#!/bin/bash
set -e

# Los secretos (SECRET_KEY, credenciales de BD) se leen de Vault al importar
# settings.py, por lo que collectstatic solo puede ejecutarse en runtime.
python manage.py collectstatic --noinput

exec "$@"
