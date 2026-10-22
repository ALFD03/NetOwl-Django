# 12 · Operación

## Desarrollo

```bash
cp .env.example .env        # y rellenar VAULT_*, DB_SCHEMA, REDIS_URL
make dev                    # el único comando de arranque
```

`make dev` llama a `scripts/dev.sh`, que levanta en paralelo, con los logs
etiquetados y apagándose juntos con Ctrl-C:

| Proceso | Prefijo | Qué es |
|---|---|---|
| Django | `[django]` | `runserver` en `:8000`, con `VITE_DEV_SERVER=1` |
| Vite | `[vite]` | Assets en `:5173` (puerto estricto) |
| Túnel SSH | `[tunel]` | Solo si hace falta y `REDIS_SSH_HOST` está en `.env` |
| Worker | `[worker]` | Celery, **solo si hay un Redis respondiendo** |

Antes de arrancar nada ejecuta `migrate --noinput`; sin nada pendiente no hace
nada.

### El túnel a Redis

Redis no corre en local: vive en la MV de producción. Abrir el túnel a mano en
otra terminal era un paso suelto que se olvidaba, y entonces los análisis se
quedaban encolados sin explicación.

- Si ya responde algo en `REDIS_URL`, **no abre nada** (o hay un Redis local, o
  el túnel quedó abierto de antes; abrir otro solo daría *address already in
  use*).
- Con `REDIS_SSH_HOST` en `.env`, abre `ssh -N -L <puerto_local>:localhost:<remoto>`
  y lo cierra al salir. **El puerto local sale de `REDIS_URL`**, para que no haya
  dos sitios donde equivocarse; si no se puede leer, el script para con un error
  en vez de construir un `-L :localhost:6379` que `ssh` aceptaría como puerto al
  azar.
- Usa `ExitOnForwardFailure=yes`: evita el peor caso, un `ssh` vivo que no
  reenvía nada con el worker esperando a un Redis que nunca contestará.
- La salida va por sustitución de proceso y no por una tubería, porque en una
  tubería `$!` sería el pid del `sed` y matarlo dejaría el túnel abierto tras el
  Ctrl-C.

Sin `REDIS_SSH_HOST` sigue valiendo abrirlo a mano:

```bash
ssh -N -L 6379:localhost:6379 usuario@mv
```

**Sin Redis se puede desarrollar todo salvo lanzar un análisis**, que se quedaría
encolado. Para levantar el worker suelto: `make worker`.

## Comandos (`make` sin argumentos los lista)

| Comando | Qué hace |
|---|---|
| `make dev` | Lo anterior |
| `make worker` | Solo el worker de Celery, con su log en su terminal |
| `make check` | `manage.py check` + `tsc --noEmit` + `ruff check` + `eslint`. **Es la puerta antes de dar algo por terminado** |
| `make lint` | `ruff check .` + `npm run lint` |
| `make format` | `ruff format .` + `prettier --write web/src` (**reescribe ficheros**) |
| `make build` | `tsc && vite build` → `web/static/dist` |
| `make migrate` | Aplica las migraciones versionadas |
| `make makemigrations` | Genera migraciones. **Revisar el archivo antes de commitear**: en `services/imports` el `db_table` se calcula, no se escribe fijo |
| `make collectstatic` | Recolecta estáticos (lo hace también el entrypoint) |

El Makefile elige `.venv/bin/python` si existe, y si no `python`.

Equivalentes de solo frontend en `package.json`: `dev`, `build`, `preview`,
`lint`, `lint:fix`, `format`, `format:check`.

> **No hay batería de pruebas.** No existen `pytest` ni `vitest`: no hay que
> inventarlos. Lo más cercano a una puerta es `make check`.

## Comandos de gestión propios

| Comando | Qué hace | Cuándo |
|---|---|---|
| `manage.py cargar_catalogos [--actualizar]` | Siembra planes, zonas, sites, estados y coordinadores desde `data/*.json` | Al montar un entorno nuevo, o para la migración inicial |
| `manage.py copiar_desde_public [--esquema X] [--simular]` | Copia al esquema del entorno las tablas que antes se compartían en `public` | **Una vez por entorno**, al desplegar la separación de esquemas |

Cada esquema tiene su propia `django_migrations`, así que `migrate` basta para
dejar completo un entorno nuevo. `copiar_desde_public` solo sirve para la
transición desde `public`; ver [02 · Configuración](02-configuracion.md#la-separación-de-public-septiembre-de-2026).

## Producción

La imagen se construye en tres etapas: el bundle con Node, las dependencias de
Python, y un runtime que copia ambas cosas y corre como **usuario no-root**
(`app`, uid 1001).

```bash
docker build -t netowl .

# El contenedor que atiende HTTP
docker run --env-file .env -p 8000:8000 netowl

# El worker: la MISMA imagen, otro comando
docker run --env-file .env -e SKIP_COLLECTSTATIC=1 netowl \
  celery -A netowl_web worker
```

`CMD` por defecto:

```
gunicorn netowl_web.wsgi:application --bind 0.0.0.0:8000 --workers 5 \
  --timeout 60 --forwarded-allow-ips "*" \
  --max-requests 1000 --max-requests-jitter 100 --access-logfile -
```

Las tres opciones que no son obvias:

- **`--forwarded-allow-ips "*"`**: sin ella gunicorn solo acepta las cabeceras
  `X-Forwarded-*` si vienen de `127.0.0.1`, y Nginx no es `127.0.0.1` en la red
  del compose. Al descartarlas, `SECURE_PROXY_SSL_HEADER` deja de ver el
  `https`, `SECURE_SSL_REDIRECT` redirige, Nginx vuelve a entrar por HTTP y el
  navegador da vueltas. El `"*"` es correcto **solo porque el contenedor no se
  publica**: el único que le habla es el proxy.
- **`--timeout 60`**: los 300s de antes eran para los análisis síncronos, que ya
  corren en Celery.
- **`--max-requests`**: recicla los workers cada tantas peticiones; pandas y
  numpy retienen memoria entre análisis y el proceso solo crecía.

`entrypoint.sh`, en orden:

1. `collectstatic` (salvo `SKIP_COLLECTSTATIC=1`, que es lo que usa el worker:
   no sirve estáticos y recolectarlos solo retrasa su arranque).
2. `migrate --noinput` (salvo `SKIP_MIGRATE=1`, que lleva el worker: dos
   contenedores migrando a la vez chocarían).
3. `exec "$@"`.

`collectstatic` se ejecuta **al arrancar el contenedor y no al construirlo**
porque `settings.py` necesita Vault desde el momento en que se importa, y
durante el build no hay red hacia él.

El despliegue es el `docker-compose.yml` de la raíz: **cuatro contenedores**,
Postgres (`db`), Redis, la app (`netowl`, gunicorn) y el worker de Celery. La app
y el worker usan la misma imagen y solo cambian el comando; el worker lleva
`SKIP_COLLECTSTATIC=1`. Vault es un servicio externo, y el proxy con TLS que
tenga delante la máquina no forma parte del compose.

```bash
docker compose up -d --build
docker compose exec netowl python manage.py cargar_catalogos            # primer arranque de un esquema
docker compose exec netowl python manage.py crear_admin --usuario <nombre>
docker compose exec netowl python manage.py verificar_entorno           # TLS de la BD, rol, Redis, DEBUG
```

`migrate` toma un cerrojo de Postgres por esquema (ver
`services/config/management/commands/migrate.py`), así que si la app y el worker
arrancan a la vez y los dos migran, el segundo espera al primero en lugar de
chocar.

**Antes del corte de verdad**, lo que hay que cambiar en el Vault corporativo:
`SECURE_SSL` a `true`, `DB_SSLMODE` a `require` (hoy está en `prefer`; `verificar_entorno`
lo avisa), y retirar `PERMITIR_HTTP_INSEGURO` del `.env` de
la máquina (ver `.env.example`).

> Si se arranca el worker desde la línea de comandos, **no se debe pasar
> `--queues`**: el nombre de la cola sale de `CELERY_TASK_DEFAULT_QUEUE`, que ya
> incorpora el sufijo del entorno. Pasarlo a mano sería una segunda copia de la
> verdad. Y `--concurrency` en la línea de comandos **anula silenciosamente**
> `CELERY_WORKER_CONCURRENCY`.

## Registros

| Fichero | Qué lleva |
|---|---|
| `logs/requests.log` | `django.request` |
| `logs/app.log` | Los loggers `services` y `core` —todo el código propio—, también a consola |

Rotación de 10 MB × 5 ficheros, `delay=True` (el fichero no se crea hasta el
primer mensaje). El log de un análisis concreto no está aquí sino en la columna
`log` de su `AnalysisJob`, y su desenlace en `import_action_logs`.

## Diagnóstico

| Síntoma | Causa probable |
|---|---|
| Nada arranca, ni `manage.py check` | Sin red hacia Vault, o `VAULT_*` incompletas. El error lo dice: *«Faltan variables de entorno para conectar con Vault»* |
| *«Los secretos leídos de Vault no tienen la estructura esperada»* | Falta una clave del JSON. El mensaje da el campo y el motivo, **nunca el valor** |
| El análisis se queda en «En cola» para siempre | No hay worker, o no hay Redis. Comprobar el túnel y `make worker` |
| El análisis pide turno y no avanza | Otro del mismo módulo tiene el cerrojo. Se reintenta cada 20 s |
| 409 al lanzar un análisis | Ya hay uno abierto del **mismo módulo y periodo**. La interfaz se engancha a él |
| 500 con `relation "<tabla>" does not exist` | Faltan migraciones en el esquema (`migrate`), no se ejecutó `copiar_desde_public` al separar el entorno, o esa tabla de análisis aún no se ha calculado nunca |
| La página carga vacía o rota tras un cambio | ¿Se renombró un fichero de `pages/`? Rompe la vista en tiempo de ejecución sin error de compilación |
| Los assets dan 404 en desarrollo | Vite no está en el 5173 (puerto estricto), o falta `VITE_DEV_SERVER=1` |
| 403 al hacer POST | Token CSRF viejo. El cliente lee la cookie antes que el meta precisamente por esto; comprobar que el meta `csrf-cookie-name` coincide con el entorno |
| Los tickets de soporte salen todos como «Sin Especificar» en una dimensión | Odoo nombró esa columna de otra forma. El error de carga lista las cabeceras encontradas; añadir el alias en `SUPPORT_CSV_COLUMN_ALIASES` |
| La importación de suscripciones devuelve 409 | Hay productos sin catalogar. **No se escribió nada**: registrarlos o ignorarlos y volver a subir |
| El análisis de churn falla nada más empezar | `productos_fuera_de_catalogo()` encontró productos ya importados que hoy no están en el catálogo |
| Una edición del catálogo no se ve en el worker | La instantánea cachea 60 s; las escrituras llaman a `reset_cache()` y cada análisis también, así que solo debería pasar en mitad de una ejecución ya iniciada |

## Convención de idioma

Comentarios, docstrings, mensajes de commit y textos de interfaz, **en
español**. Hay que seguirlo al editar ficheros existentes.
