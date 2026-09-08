#!/usr/bin/env bash
#
# Levanta el entorno de desarrollo completo con un solo comando.
#
# Son dos procesos: Django sirviendo las paginas en :8000 y Vite sirviendo los
# assets en :5173. Antes habia que abrir dos terminales y acordarse del orden;
# aqui van en paralelo, con los logs mezclados pero cada linea etiquetada, y
# Ctrl-C se lleva a los dos por delante.
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

echo "==> Django  http://localhost:8000"
echo "==> Vite    http://localhost:5173  (assets)"
echo "==> Ctrl-C para parar los dos"

wait
