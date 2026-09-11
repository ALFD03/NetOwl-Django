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
esquema. De ahí salen varias decisiones que conviene no deshacer.

### Qué se cualifica con el esquema y qué no

| Tabla / grupo | Esquema | Por qué |
|---|---|---|
| Todo lo calculado por la analítica (`analyzer_*`, `crm_*`, `support_*`, `subscriptions*`, `lifetime_*`) | `DB_SCHEMA` | Son datos computados: cada entorno tiene los suyos. |
| `import_action_logs`, `analysis_jobs` (`services/imports/models.py`) | `DB_SCHEMA` | Ídem: bitácora y trabajos del entorno. |
| `django_session` (`SesionEntorno`) | `DB_SCHEMA` | Compartirla cerraba la sesión del otro entorno. |
| `auth_user`, `config_profile`, la matriz de permisos | `public` (compartido) | **La misma cuenta debe valer en los dos entornos.** |
| `catalogo_*` — planes, zonas, sites, estados, coordinadores, ignorados | `public` (compartido) | El catálogo comercial es uno por empresa; uno por entorno solo produce divergencias silenciosas. |
| `django_migrations` | `public` (compartido) | No se elige: es de Django. Es la causa de los dos comandos `preparar_*`. |

La regla en una frase: **se cualifica por esquema el dato calculado, no el
vocabulario del negocio ni la identidad de los usuarios.**

### Sesiones aisladas (y por qué las cookies no bastaban)

Renombrar las cookies por entorno (`SESSION_COOKIE_NAME = netowl_sessionid_<ENV_SUFFIX>`)
solo importa cuando dos entornos comparten host: evita que un login pise la
cookie del otro. **No resolvía el problema real**, que estaba en las filas: con
una única `public.django_session`, iniciar sesión en un entorno borraba la fila
del otro y cerraba su sesión.

La solución son tres piezas:

1. `SesionEntorno` (`services/config/models.py`) — modelo `managed = False` cuya
   `db_table` lleva el esquema dentro. Declara `expire_date` con
   `db_index=False` porque el nombre que Django autogeneraría es un hash del
   nombre de la tabla y cambiaría por entorno, dejando
   `makemigrations --check` reportando cambios pendientes para siempre.
2. `services/config/sessions.py` — el backend de base de datos de Django con un
   único cambio: usa ese modelo. Se activa con
   `SESSION_ENGINE = "services.config.sessions"`.
3. `manage.py preparar_sesiones` — crea la tabla, idempotente
   (`CREATE TABLE IF NOT EXISTS`). **No puede ser una migración**: como
   `django_migrations` es compartida, se marcaría como aplicada al ejecutarla en
   el primer entorno y el segundo se quedaría sin tabla, fallando en el primer
   login. `config/migrations/0002` existe solo para que
   `makemigrations --check` quede limpio; no crea nada.

`manage.py preparar_imports` hace lo mismo con `import_action_logs` y
`analysis_jobs`, y por el mismo motivo. Su DDL no está escrito a mano: lo genera
el `schema_editor` desde el modelo, así que añadir un campo no obliga a tocar el
comando. Ambos se ejecutan en cada arranque (`entrypoint.sh` y `scripts/dev.sh`).

`scripts/sesiones.py` se menciona en `CLAUDE.md` como utilidad para listar las
sesiones vivas del entorno; **ese fichero no existe en el árbol actual** (ver
[13](13-discrepancias-y-hallazgos.md)).

### Migraciones

Tres apps tienen modelos y por tanto `migrations/`:

- `services/config/` — usuarios, perfiles, grupos de permisos, `SesionEntorno`.
- `services/imports/` — `ImportActionLog` y `AnalysisJob`.
- `services/subscriptions/` — los catálogos de referencia.

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

Las de `services/subscriptions` no necesitan ninguna edición: sus tablas viven
en `public` deliberadamente.

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
| `frontend`, `backend` | `logs/app.log` + consola | Existen porque los `logger.exception(...)` del código propio no tenían manejador: acababan en el logger raíz, que gunicorn descarta en silencio |

> Los módulos usan `logging.getLogger(__name__)`, cuyos nombres empiezan por
> `services.` o `core.`, no por `frontend`/`backend`. En la práctica esos
> registros llegan al logger raíz; ver [13](13-discrepancias-y-hallazgos.md).
