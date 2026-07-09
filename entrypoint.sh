#!/bin/bash
set -e

if [ -z "$DJANGO_SECRET_KEY" ]; then
    DJANGO_SECRET_KEY=$(python -c 'import secrets; print(secrets.token_urlsafe(50))')
    export DJANGO_SECRET_KEY
fi

exec "$@"
