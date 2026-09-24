# 02 · Configuración y entornos

## La aplicación no arranca sin Vault

`netowl_web/settings.py` llama a `core.vault.get_config()` **en el momento de
importarse**. Eso afecta a `runserver`, a cualquier comando de gestión, al
worker de Celery y al contenedor. Sin red hacia Vault y sin un AppRole válido,
nada levanta.

Es también la razón de que `entrypoint.sh` ejecute `collectstatic` al arrancar
el contenedor y no al construir la imagen: durante el build no hay red hacia
Vault.

> Al escribir código que no necesita base de datos, no se puede dar por hecho
> que se pueda levantar el servidor para comprobarlo.

## Qué vive en `.env` y qué en Vault

`.env` solo lleva lo necesario para **llegar** a Vault, más dos valores que no
son secretos:

| Variable | Para qué |
|---|---|
| `VAULT_URL` | Dirección del servidor Vault |
| `VAULT_ROLE_ID` / `VAULT_SECRET_ID` | Credenciales AppRole |
| `VAULT_MOUNT_PATH` / `VAULT_PATH` | Dónde está el secreto KV v2 |
| `DB_SCHEMA` | Esquema de Postgres del entorno. **No es secreto y cambia por entorno.** |
| `REDIS_URL` | Dónde escucha la cola. Tampoco es secreto. |
| `REDIS_SSH_HOST` *(dev)* | Host del túnel SSH que `scripts/dev.sh` abre hacia el Redis de la MV |
| `REDIS_SSH_REMOTE_PORT` *(dev, opcional)* | Puerto remoto del túnel (6379 por defecto) |
| `WORKER_CONCURRENCY` *(opcional)* | Análisis simultáneos del worker (2 por defecto) |
| `VITE_DEV_SERVER` *(dev)* | Servir los assets desde Vite en vez del bundle compilado |
| `SKIP_COLLECTSTATIC` *(contenedor worker)* | Salta `collectstatic` en el arranque |

Todo lo demás vive en **un único secreto KV v2** con esta forma (ver
`.env.example`):

```json
{
  "DJANGOCONFIG": {
    "DJANGO_SECRET_KEY": "...",
    "DJANGO_DEBUG": false,
    "DJANGO_SECURE_SSL": true,
    "ALLOWED_HOSTS": ["netowl.example.com"],
    "CSRF_TRUSTED_ORIGINS": ["https://netowl.example.com"]
  },
  "DBCONFIG": {
    "DB_NAME": "...", "DB_USER": "...", "DB_PASSWORD": "...",
    "DB_HOST": "...", "DB_PORT": 5432, "DB_SSLMODE": "require"
  }
}
```

`ALLOWED_HOSTS` va **sin** esquema; `CSRF_TRUSTED_ORIGINS` **con** él
(`https://…`). Ambos aceptan lista o cadena separada por comas: el validador
`split_hosts` de `core/vault.py` normaliza las dos formas.

### Cómo se lee (`core/vault.py`)

- Autenticación AppRole con `hvac`, validación con `pydantic`
  (`VaultDataStructure` → `DjangoModel` + `DBConfigModel`).
- **Reintenta el ciclo completo (login + lectura) hasta 3 veces** con espera
  creciente: en un Vault en HA el token emitido por un nodo puede tardar en
  propagarse y la lectura inmediata lo rechaza con «invalid token». Sin
  reintento fallaba aproximadamente uno de cada ocho arranques.
- Un error de validación **no propaga el mensaje de pydantic**: ese mensaje
  incluye el valor recibido (`input_value`) y acabaría en el log de gunicorn.
  Solo se reportan la ruta del campo y el motivo, y se corta el encadenado con
  `from None`.
- `get_config()` es un singleton por proceso: Vault se lee una sola vez.

## `DB_SCHEMA`: un esquema de Postgres por entorno

Desarrollo y producción apuntan a **la misma base de datos** y se separan por
esquema: `test` en desarrollo, `netowl` en producción. **Cada entorno vive
entero en su esquema y no comparte nada con el otro**: usuarios, perfiles y
permisos, los catálogos, el directorio de soporte, las sesiones,
`django_migrations` y todos los datos calculados.

### Cómo se consigue

- **La conexión solo ve su esquema.** `DATABASES["default"]["OPTIONS"]` pasa
  `-c search_path=<DB_SCHEMA>`, sin `public` detrás, y `DBConnector` hace lo
  mismo. Los modelos del ORM no cualifican su `db_table`: el `search_path` los
  lleva al esquema. Una tabla que falte da `relation does not exist` en vez de
  leerse en silencio de otro sitio.
- **`DB_SCHEMA` es obligatorio y no puede ser `public`.** `settings.py` se niega
  a arrancar sin él: un `.env` incompleto volvería a juntar los entornos sin
  que nadie lo note.
- **`django_migrations` es de cada esquema**, así que `migrate` crea y
  actualiza todo el entorno, incluido uno recién creado. Lo ejecutan
  `entrypoint.sh` (salvo `SKIP_MIGRATE=1`, que lleva el worker) y
  `scripts/dev.sh` en cada arranque.
- **Las cookies llevan el sufijo del entorno** (`netowl_sessionid_<ENV_SUFFIX>`),
  porque los dos entornos comparten host y el navegador no distingue puertos.

Algunos restos son anteriores a esta separación y hoy son redundantes pero
inofensivos: `import_action_logs`/`analysis_jobs` y `SesionEntorno` cualifican
su `db_table` con `DB_SCHEMA` (el mismo esquema al que ya apunta el
`search_path`), y `SESSION_ENGINE` sigue siendo `services.config.sessions`.

### La separación de `public` (septiembre de 2026)

Hasta entonces usuarios, permisos, catálogos, directorio de soporte y
`django_migrations` vivían en `public` y se compartían a propósito. Para pasar
a esquemas aislados, `manage.py copiar_desde_public` clona cada tabla de
`public` (salvo `django_session`) en el esquema del entorno: estructura,
secuencias propias, restricciones e índices con sus nombres originales, y las
filas con sus ids. Es transaccional, no toca `public` y se detiene si alguna
tabla ya existe en el destino. `--simular` hace la copia y la deshace.

Se ejecuta una vez por entorno, con el código nuevo desplegado y **antes** de
que nadie entre, para que ninguna edición hecha en `public` en el intervalo se
quede atrás. Las tablas de `public` quedan como copia de seguridad; nada las lee.

### Migraciones

Cuatro apps tienen modelos y por tanto `migrations/`:

- `services/config/` — usuarios, perfiles, grupos de permisos, `SesionEntorno`.
- `services/imports/` — `ImportActionLog` y `AnalysisJob`.
- `services/subscriptions/` — los catálogos de referencia.
- `services/support/` — el directorio de usuarios de soporte.

**Están versionadas: no se regeneran desde cero.** Las de `imports` se editan a
mano en exactamente un punto: `db_table` incrusta el esquema de Postgres, así
que el literal que escribe `makemigrations` se sustituye por la misma expresión
que usa el modelo:

```python
db_table = f'"{DB_SCHEMA}"."analysis_jobs"' if DB_SCHEMA else 'analysis_jobs'
```

Sin eso, la migración solo funciona en el entorno donde se generó y todos los
demás reportan cambios pendientes para siempre. Por la misma razón
`AnalysisJob.Meta.indexes` nombra su índice explícitamente
(`analysis_jobs_mod_est_idx`).

Se comprueban los dos entornos a la vez con:

```bash
DB_SCHEMA=<otro_esquema> python manage.py makemigrations --check --dry-run
```

Las de `services/subscriptions` y `services/support` no necesitan ninguna
edición: sus `db_table` no llevan esquema y el `search_path` los resuelve.

## Seguridad (`netowl_web/settings.py`)

| Ajuste | Valor | Nota |
|---|---|---|
| `SECURE_SSL_REDIRECT` | `DJANGOCONFIG.DJANGO_SECURE_SSL` | Arrastra a `SESSION_COOKIE_SECURE` y `CSRF_COOKIE_SECURE` |
| `SECURE_HSTS_SECONDS` | 31 536 000 con SSL, 0 sin él | Con subdominios y preload |
| `SECURE_CONTENT_TYPE_NOSNIFF`, `SECURE_BROWSER_XSS_FILTER` | `True` | |
| `X_FRAME_OPTIONS` | `DENY` | Clickjacking |
| `SECURE_REFERRER_POLICY` | `same-origin` | |
| `SESSION_COOKIE_AGE` | 8 horas | |
| `MAX_UPLOAD_SIZE` | 100 MB | También `DATA_UPLOAD_MAX_MEMORY_SIZE` y `FILE_UPLOAD_MAX_MEMORY_SIZE` |
| `INTERNAL_IPS` | `127.0.0.1`, `::1`, `10.3.0.41` | Django compara contra `REMOTE_ADDR`: **solo admite IP**, no nombres de host |

Middlewares propios (`netowl_web/middleware.py`):

- `RateLimitMiddleware` — convierte la excepción `Ratelimited` en un JSON 429 con
  mensaje legible en vez de una página de error.
- `InertiaShareMiddleware` — comparte con React `auth.user` y su matriz de
  permisos, recorriendo `PERMISSION_FIELDS`. **Añadir un permiso al catálogo de
  `services/config/models.py` lo publica automáticamente en el frontend.**

## Assets: `VITE_DEV_SERVER` no cuelga de `DEBUG`

`USE_VITE_DEV_SERVER` decide si `web/templates/app.html` carga los módulos desde
`http://localhost:5173` o el bundle de `web/static/dist`.

Antes esa decisión colgaba de `{% if debug %}`, que Django solo pone a `True`
cuando `DEBUG` está activo **y además** `REMOTE_ADDR` figura en `INTERNAL_IPS`:
abrir el `runserver` desde otra máquina de la red servía la plantilla apuntando
a un bundle que en desarrollo no existe. Tampoco cuelga de `DEBUG` directamente:
servir los assets desde Vite es una decisión de flujo de trabajo, no de
seguridad, y atarla a `DEBUG` obligaría a encenderlo para poder desarrollar.

`vite.config.ts` usa `strictPort: true` sobre el 5173 porque la plantilla
apunta a ese puerto de forma fija: arrancar en otro serviría 404 silenciosos.

## Celery y Redis

| Ajuste | Valor | Por qué |
|---|---|---|
| `CELERY_BROKER_URL` | `REDIS_URL` | |
| `CELERY_TASK_IGNORE_RESULT` | `True` | El estado vive en `AnalysisJob`; un backend de resultados solo lo duplicaría |
| `CELERY_TASK_DEFAULT_QUEUE` | `analisis_<ENV_SUFFIX>` | Un worker solo consume lo que encoló una app con su mismo `DB_SCHEMA`. **El worker se arranca sin `--queues`**: toma este valor |
| `CELERY_TASK_ACKS_LATE` | `True` | El mensaje se confirma al terminar: si el worker se reinicia a mitad, la tarea se reencola |
| `CELERY_WORKER_PREFETCH_MULTIPLIER` | `1` | Sin esto un worker se reserva tareas que no puede empezar y quedan invisibles |
| `CELERY_TASK_SOFT_TIME_LIMIT` / `TIME_LIMIT` | 55 min / 60 min | El límite blando lanza `SoftTimeLimitExceeded`, que la tarea captura para dejar el job en error en vez de morir en silencio |
| `visibility_timeout` | 2 h | **Mayor que el límite duro**, o Redis reentregaría el mensaje y la tarea correría dos veces |
| `CELERY_WORKER_CONCURRENCY` | `WORKER_CONCURRENCY`, 2 | Subirlo tiene coste invisible: cada análisis carga el histórico completo de logs y abre sus conexiones contra un Postgres con `max_connections=100` |
| `ANALYSIS_JOB_STALE_SECONDS` | 15 min | Tras ese silencio un job «en curso» se da por muerto y deja de bloquear |
| `ANALYSIS_LOCK_TIMEOUT` | 2 h | Caducidad del cerrojo de módulo. Mayor que el límite duro de la tarea |

> No se debe reintroducir `--concurrency` en la línea de comandos del worker:
> anularía silenciosamente `CELERY_WORKER_CONCURRENCY`.

**Un mismo Redis sirve a los dos entornos sin mezclarlos**, por partida doble:
cada entorno usa su propio índice (`…/0` producción, `…/1` desarrollo) y el
nombre de la cola lleva el sufijo de `DB_SCHEMA`. Un `.env` mal copiado no puede
hacer que desarrollo recoja un análisis de producción.

## Registro (logging)

Tres manejadores, todos con rotación de 10 MB × 5 ficheros:

| Logger | Fichero | Nota |
|---|---|---|
| `django.request` | `logs/requests.log` | |
| `services`, `core` | `logs/app.log` + consola | Los `logger.exception(...)` del código propio, que si no acabarían en el logger raíz —sin manejador— y gunicorn descartaría en silencio |

> Los dos nombres no son decorativos: los veinte módulos que crean un logger lo
> hacen con `logging.getLogger(__name__)`, así que el nombre resultante empieza
> por `services.` o por `core.` y cae bajo uno de los dos. Un logger con
> cualquier otro nombre no captaría nada.
