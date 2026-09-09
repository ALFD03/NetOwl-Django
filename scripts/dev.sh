#!/usr/bin/env bash
#
# Levanta el entorno de desarrollo completo con un solo comando.
#
# Son tres procesos: Django sirviendo las paginas en :8000, Vite sirviendo los
# assets en :5173 y el worker de Celery ejecutando los analisis. Antes habia que
# abrir varias terminales y acordarse del orden; aqui van en paralelo, con los
# logs mezclados pero cada linea etiquetada, y Ctrl-C se los lleva a todos.
#
# El worker solo arranca si hay un Redis escuchando: sin el se puede desarrollar
# todo menos lanzar un analisis, y obligar a levantar Redis para tocar una
# pantalla no compensa.
#
# VITE_DEV_SERVER=1 es lo que hace que la plantilla apunte al dev-server en vez
# de al bundle compilado. Es una variable propia y no DEBUG a proposito: no
# hace falta encender DEBUG para desarrollar (ver netowl_web/settings.py).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PYTHON="${PYTHON:-python}"
[[ -x .venv/bin/python ]] && PYTHON="${PYTHON_OVERRIDE:-.venv/bin/python}"

if [[ ! -d node_modules ]]; then
  echo "==> node_modules no existe; ejecutando npm ci"
  npm ci
fi

# La app lee sus secretos de Vault al importar settings.py: sin estas variables
# de arranque no levanta ni el runserver ni ningun comando de gestion.
if [[ ! -f .env ]]; then
  echo "ERROR: falta el archivo .env con las variables VAULT_* y DB_SCHEMA." >&2
  echo "       Copia .env.example y rellenalo. Sin acceso a Vault la app no arranca." >&2
  exit 1
fi

pids=()

apagar() {
  trap - INT TERM EXIT
  echo ""
  echo "==> apagando..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap apagar INT TERM EXIT

# `stdbuf -oL` evita que el prefijo salga a bloques por el buffer de la tuberia.
VITE_DEV_SERVER=1 stdbuf -oL "$PYTHON" manage.py runserver 2>&1 \
  | sed -u 's/^/[django] /' &
pids+=($!)

stdbuf -oL npm run dev 2>&1 \
  | sed -u 's/^/[vite]   /' &
pids+=($!)

# Los analisis (churn, CRM, soporte, ciclo de vida) corren en el worker, no en
# la peticion: sin el, el boton de calcular deja el trabajo encolado y nada mas.
hay_redis() {
  "$PYTHON" -c 'import os, sys, redis; from dotenv import load_dotenv; load_dotenv(); sys.exit(0 if redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0")).ping() else 1)' 2>/dev/null
}

if hay_redis; then
  stdbuf -oL "$PYTHON" -m celery -A netowl_web worker \
    --loglevel=info --concurrency=1 2>&1 \
    | sed -u 's/^/[worker] /' &
  pids+=($!)
  # El nombre de la cola sale de DB_SCHEMA (ver settings.py): asi el worker de
  # desarrollo no puede consumir un analisis encolado por produccion. Se lee del
  # .env con la misma normalizacion, porque aqui no esta en el entorno.
  cola=$("$PYTHON" -c 'import os, re; from dotenv import load_dotenv; load_dotenv(); print("analisis_" + re.sub(r"[^A-Za-z0-9_-]", "_", os.getenv("DB_SCHEMA", "public")))')
  worker_msg="==> Worker  cola $cola (Celery)"
else
  worker_msg="==> Worker  sin arrancar: no hay Redis en REDIS_URL, los analisis quedaran en cola"
fi

echo "==> Django  http://localhost:8000"
echo "==> Vite    http://localhost:5173  (assets)"
echo "$worker_msg"
echo "==> Ctrl-C para pararlos todos"

wait
