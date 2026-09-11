#!/usr/bin/env bash
#
# Levanta el entorno de desarrollo completo con un solo comando.
#
# Son tres procesos: Django sirviendo las paginas en :8000, Vite sirviendo los
# assets en :5173 y el worker de Celery ejecutando los analisis. Antes habia que
# abrir varias terminales y acordarse del orden; aqui van en paralelo, con los
# logs mezclados pero cada linea etiquetada, y Ctrl-C se los lleva a todos.
#
# El Redis de desarrollo esta en la MV, asi que el script abre tambien el tunel
# SSH que lleva hasta el (si REDIS_SSH_HOST esta en el .env) y lo cierra al
# salir. El worker solo arranca si hay un Redis contestando: sin el se puede
# desarrollar todo menos lanzar un analisis, y obligar a tener el tunel abierto
# para tocar una pantalla no compensa.
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

# La tabla de sesiones es propia de cada esquema y no la crea ninguna migracion
# (django_migrations es compartida; ver services/config/management/commands/).
# Es idempotente, asi que se ejecuta en cada arranque.
"$PYTHON" manage.py preparar_sesiones

# Igual que arriba: las tablas ORM de imports son propias de cada esquema y la
# migracion que las crea queda anotada como aplicada para todos los entornos.
"$PYTHON" manage.py preparar_imports

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

# Lee una variable del .env, que aqui no esta en el entorno del shell.
leer_env() {
  "$PYTHON" -c "import os, sys; from dotenv import load_dotenv; load_dotenv(); print(os.getenv(sys.argv[1]) or sys.argv[2])" "$1" "${2:-}"
}

# En desarrollo el Redis no es local: vive en la MV de produccion y se llega a
# el por un tunel SSH. Abrirlo a mano en otra terminal era un paso suelto que
# se olvidaba, y entonces los analisis se quedaban encolados sin explicacion.
# Si REDIS_SSH_HOST esta en el .env, el tunel lo levanta este script y lo cierra
# con todo lo demas al hacer Ctrl-C.
#
# El puerto local sale de REDIS_URL para que no haya dos sitios donde equivocarse.
REDIS_SSH_HOST="$(leer_env REDIS_SSH_HOST)"

if hay_redis; then
  # Ya responde: o hay un Redis local, o el tunel quedo abierto de antes. En
  # cualquier caso abrir otro solo daria "address already in use".
  tunel_msg="==> Redis   ya responde en REDIS_URL"
elif [[ -n "$REDIS_SSH_HOST" ]]; then
  # El puerto local sale de REDIS_URL, que ya dice a donde se va a conectar la
  # app: tenerlo escrito dos veces es tenerlo mal una de las dos.
  puerto_local="$("$PYTHON" -c 'import os; from urllib.parse import urlparse; from dotenv import load_dotenv; load_dotenv(); print(urlparse(os.getenv("REDIS_URL", "redis://localhost:6379/0")).port or 6379)' 2>/dev/null || true)"
  puerto_remoto="$(leer_env REDIS_SSH_REMOTE_PORT 6379)"

  # Si REDIS_URL no trae puerto legible, parar aqui: seguir con la variable
  # vacia construye un `-L :localhost:6379` que ssh acepta como puerto al azar,
  # y el tunel quedaria escuchando donde nadie lo busca.
  if [[ ! "$puerto_local" =~ ^[0-9]+$ ]]; then
    echo "ERROR: no se pudo leer el puerto de REDIS_URL para abrir el tunel." >&2
    exit 1
  fi

  echo "==> abriendo tunel SSH a $REDIS_SSH_HOST (localhost:$puerto_local -> :$puerto_remoto)"
  # ExitOnForwardFailure evita el peor caso: un ssh vivo que no reenvia nada,
  # con el worker esperando a un Redis que nunca va a contestar.
  #
  # La salida va por sustitucion de proceso y no por una tuberia a proposito: en
  # una tuberia `$!` es el pid del `sed`, y matar el sed dejaria el tunel abierto
  # despues del Ctrl-C. Asi `$!` es el del propio ssh, que es lo que hay que matar.
  stdbuf -oL ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -L "${puerto_local}:localhost:${puerto_remoto}" \
    "$REDIS_SSH_HOST" > >(sed -u 's/^/[tunel]  /') 2>&1 &
  pids+=($!)

  # El tunel tarda en negociar; se le dan unos segundos antes de rendirse.
  for _ in $(seq 1 20); do
    hay_redis && break
    sleep 0.5
  done

  if hay_redis; then
    tunel_msg="==> Redis   por tunel SSH a $REDIS_SSH_HOST"
  else
    tunel_msg="==> Redis   el tunel a $REDIS_SSH_HOST no respondio (revisa la clave SSH o el puerto)"
  fi
else
  tunel_msg="==> Redis   sin conexion: define REDIS_SSH_HOST en .env para abrir el tunel solo"
fi

if hay_redis; then
  stdbuf -oL "$PYTHON" -m celery -A netowl_web worker \
    --loglevel=info 2>&1 \
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
echo "$tunel_msg"
echo "$worker_msg"
echo "==> Ctrl-C para pararlos todos"

wait
