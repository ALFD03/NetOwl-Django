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

Antes de arrancar nada ejecuta `preparar_sesiones` y `preparar_imports`, que son
idempotentes.

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
| `manage.py preparar_sesiones` | Crea `<esquema>.django_session` si falta | En cada arranque (entrypoint y dev.sh) |
| `manage.py preparar_imports` | Crea `import_action_logs` y `analysis_jobs` en el esquema | Igual |
| `manage.py cargar_catalogos [--actualizar]` | Siembra planes, zonas, sites, estados y coordinadores desde `data/*.json` | Al montar un entorno nuevo, o para la migración inicial |

Los dos primeros existen porque `django_migrations` es **compartida** entre
entornos: una migración que creara una tabla por esquema se marcaría como
aplicada al ejecutarse en el primero y el segundo se quedaría sin tabla.

**Síntoma típico de que faltan:** un 500 al lanzar cualquier análisis con
`relation "<esquema>.analysis_jobs" does not exist`, mientras `migrate` insiste
en que no hay nada pendiente.

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
2. `preparar_sesiones`.
3. `preparar_imports`.
4. `exec "$@"`.

`collectstatic` se ejecuta **al arrancar el contenedor y no al construirlo**
porque `settings.py` necesita Vault desde el momento en que se importa, y
durante el build no hay red hacia él.

El despliegue son **cuatro contenedores**: Nginx, la app, el worker y Redis
(Postgres y Vault son servicios externos). La app y el worker usan la misma
imagen y solo cambian el comando.

`deploy/` está en `.gitignore` entero, igual que `nginx.conf` y el `.env`: el
despliegue es específico de cada máquina y vive fuera del repositorio. Lo que
sigue describe el contenido que se espera encontrar allí.

`deploy/docker-compose.yml` está escrito para el **ensayo local** (ver la
sección siguiente). Para la MV son tres cambios, ninguno en el resto del
archivo, y están anotados en su cabecera:

1. Borrar los servicios `vault` y `preparar`, y sus `depends_on`.
2. `VAULT_URL` al Vault corporativo y las credenciales del AppRole real —lo
   natural es sustituir el bloque `environment:` de `web` y `worker` por
   `env_file: - ../.env`, que es donde viven.
3. Montar el certificado de verdad en lugar del volumen `certs`.

`VAULT_URL` no está en el `.env` de producción, así que se inyecta por
`environment:`, que gana a `env_file:` (y `load_dotenv()` no pisa lo que ya está
en el entorno del proceso).

## Ensayo de producción en la máquina local

`make dev` no puede comprobar lo que más falla en un corte a producción: el
proxy delante, la redirección a HTTPS, HSTS y las cookies con `Secure`. Para eso
está `deploy/docker-compose.yml`, que levanta la pila entera —Nginx con TLS,
gunicorn, el worker, Redis y **un HashiCorp Vault propio**— con la configuración
de producción y acceso por `https://localhost`.

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

No hay ningún paso previo: el compose trae sus valores por defecto, genera el
certificado y siembra su Vault. Para entrar también por la IP de la máquina —que
no se puede averiguar desde dentro de un contenedor— hay que declararla:

```bash
ENSAYO_HOSTS=192.168.1.50 docker compose -f deploy/docker-compose.yml up -d --build
```

El servicio `preparar` es quien hace posible el comando único. Corre una vez,
antes que `web` y `nginx` (`depends_on: service_completed_successfully`), con la
imagen de NetOwl porque ya trae `openssl` y `hvac`:

1. Emite el certificado autofirmado, con `localhost`, `127.0.0.1` y
   `ENSAYO_HOSTS` en el SAN.
2. Lee el secreto **real** de Vault con las credenciales del `.env` del
   repositorio y cambia solo tres claves: `SECURE_SSL` a `true`, y
   `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` a esos mismos nombres. `SECRET_KEY`
   y `DBCONFIG` se copian tal cual, que es lo que hace que la prueba valga.
   (Si existe `deploy/ensayo/secreto.json`, se usa ése y no se lee ningún Vault
   externo.)
3. Lo escribe en el Vault local, en el **mismo** mount y la **misma** ruta, con
   un AppRole de solo lectura sobre ese único secreto.

> El secreto de producción escribe las claves con su nombre corto (`SECRET_KEY`,
> `DEBUG`, `SECURE_SSL`) y no con el alias `DJANGO_*` que documenta
> `.env.example`. `core/vault.py` acepta las dos formas (`populate_by_name`),
> pero **no** conviene dejar las dos dentro del mismo secreto: el seeder pisa la
> que ya está en lugar de añadir una segunda.

El `role_id` y el `secret_id` del AppRole son valores fijos que lleva el propio
compose. Es lo que evita el problema del huevo y la gallina —arrancar Vault,
leer las credenciales que emite y solo entonces poder arrancar la aplicación— y
no son un secreto: solo valen contra ese Vault en memoria, que muere con el
contenedor.

Lo único que no reproduce: el Vault del ensayo habla HTTP y guarda los secretos
**en memoria**, así que reiniciar ese contenedor borra el secreto (un `up`
normal lo vuelve a sembrar); y el certificado es autofirmado, de modo que el
navegador avisa la primera vez y `curl` necesita `-k`.

> `VAULT_DEV_ROOT_TOKEN_ID` tiene que ser un identificador de token válido:
> letras, dígitos y guiones. Con un punto dentro, Vault arranca y muere con
> `failed to create root token with ID "...": invalid request`.

Primer arranque en un esquema nuevo:

```bash
docker compose -f deploy/docker-compose.yml exec web python manage.py cargar_catalogos
docker compose -f deploy/docker-compose.yml exec web python manage.py crear_admin --usuario <nombre>
```

Lo que este montaje permite comprobar y `make dev` no:

```bash
curl -kI https://localhost/auth/login/   # Strict-Transport-Security, Set-Cookie con Secure
curl -I  http://localhost/               # 301 a https, sin bucle
```

> **Ojo con `DB_SCHEMA`**: el ensayo habla con la base de datos real, así que el
> esquema decide sobre qué datos escribe —una importación vacía y reescribe sus
> tablas—. Por defecto es `netowl`; para apuntar a otro,
> `DB_SCHEMA=ensayo docker compose -f deploy/docker-compose.yml up -d`.

**Antes del corte de verdad**, lo que hay que cambiar en el Vault corporativo:
`SECURE_SSL` a `true`, `DB_SSLMODE` a `require` (hoy está en `prefer`, y el
seeder lo avisa por consola), y retirar `PERMITIR_HTTP_INSEGURO` del `.env` de
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
| 500 con `relation "<esquema>.<tabla>" does not exist` | Faltan `preparar_sesiones` / `preparar_imports`, o esa tabla de análisis aún no se ha calculado nunca |
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
