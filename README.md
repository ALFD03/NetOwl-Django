# NetOwl

Panel interno de analitica para un Netcom Plus VE: churn, CRM, soporte y suscripciones.

Calcula tasa de cancelacion, reactivaciones, ARPU, tiempos de vida
(Kaplan-Meier), efectividad y tiempos del CRM, cohortes de tickets de soporte y
el reporte mensual para la reguladora, sobre exports de Odoo cargados como CSV.

## Stack

| Capa | Tecnologia |
|------|-----------|
| Analitica | Python 3.11 — pandas, numpy, psycopg2, lifelines |
| Web | Django 5 + Inertia.js (paginas renderizadas en servidor que hidratan a React) |
| Interfaz | React 18 + TypeScript + Vite + Tailwind + Chart.js |
| Base de datos | PostgreSQL 15+ (SSL, un esquema por entorno) |
| Cola de tareas | Celery sobre Redis (los analisis largos, fuera de la peticion) |
| Secretos | HashiCorp Vault (KV v2, AppRole) |
| Produccion | Gunicorn + Whitenoise en una imagen Docker multi-etapa, usuario no-root |

La misma imagen sirve para dos contenedores: el que atiende HTTP y el worker que ejecuta
los analisis. Solo cambia el comando de arranque.

No hay REST separado ni SPA: cada vista devuelve una respuesta Inertia con sus
props ya calculados, y React la hidrata. Los endpoints `api/` existen solo para
lo que se pide despues de cargar la pagina.

## Estructura

```
core/         Lo transversal, sin dominio: Vault, DBConnector, Periodo,
              TableNames, utilidades de datos y lectura de fixtures.

services/     Un paquete por dominio de negocio. Cada uno tiene su analitica y
              su capa HTTP juntas:
  subscriptions/   analytics/{analyzer,lifetime,...} + views.py + urls.py
  crm/             analytics/{loader,dimensions,analyzer,queries,metrics}
  support/         analytics/{loader,cohorts,metrics,dimensions,analyzer,queries}
  imports/         Carga de CSV, ejecucion de analisis y bitacora de importaciones
  config/          Autenticacion, perfiles, permisos y subida de archivos

web/          src/       React: pages/ -> features/ -> shared/
              templates/ La unica plantilla Django (app.html)
              static/    Imagenes y el bundle compilado (dist/, no versionado)

netowl_web/   settings, urls, wsgi, middleware
data/         Planes.json y Zonas.json (datos de referencia del negocio)
scripts/      dev.sh
```

La dependencia va en un solo sentido: `views.py` importa de `analytics/`, nunca
al reves, y `core/` no importa de ningun servicio. Dentro de cada dominio los
modulos se llaman igual (`loader`, `dimensions`, `analyzer`, `queries`), asi que
moverse entre servicios no obliga a reaprender nombres.

Para el detalle de la parte React, lee **`web/src/README.md`**: es la
documentacion viva de esa capa.

## Configuracion

**La aplicacion no arranca sin Vault.** `netowl_web/settings.py` lee la
configuracion al importarse, asi que esto afecta a `runserver`, a cualquier
comando de gestion y al contenedor.

`.env` solo lleva lo necesario para *llegar* a Vault:

```
VAULT_URL  VAULT_ROLE_ID  VAULT_SECRET_ID  VAULT_MOUNT_PATH  VAULT_PATH  DB_SCHEMA  REDIS_URL
```

Todo lo demas (SECRET_KEY, DEBUG, ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS y las
credenciales de base de datos) vive en un unico secreto KV v2 con la forma
`{DJANGOCONFIG: {...}, DBCONFIG: {...}}`, validado con pydantic en
`core/vault.py`. Ver `.env.example` para la estructura exacta.

`DB_SCHEMA` y `REDIS_URL` no son secretos y por eso viven en `.env`: el primero
selecciona el esquema de Postgres por entorno, el segundo dice donde escucha la
cola de tareas.

Los dos entornos pueden compartir un mismo Redis sin mezclarse, igual que
comparten servidor de base de datos. La separacion es doble y automatica: cada
entorno usa su propio indice de Redis (`.../0` produccion, `.../1` desarrollo) y
el nombre de la cola lleva el sufijo de `DB_SCHEMA`. Un worker solo consume lo
que encolo una app apuntando a su mismo esquema, asi que un `.env` mal copiado
no puede hacer que desarrollo recoja un analisis de produccion. Las cookies de sesion y CSRF llevan ese esquema como
sufijo, para que iniciar sesion en un entorno no cierre la del otro cuando
comparten host.

## Desarrollo

```bash
cp .env.example .env    # y rellenar las variables VAULT_*
make dev                # Django en :8000, Vite en :5173 y el worker, juntos
```

`make dev` llama a `scripts/dev.sh`, que levanta los procesos en paralelo con los
logs etiquetados y los apaga juntos con Ctrl-C. El worker de Celery solo arranca
si hay un Redis respondiendo en `REDIS_URL`: sin el se puede desarrollar todo
salvo lanzar un analisis, que se quedaria encolado. Para levantarlo suelto,
`make worker`. Exporta
`VITE_DEV_SERVER=1`, que es lo que hace que la plantilla cargue los assets del
dev-server en vez del bundle compilado.

Esa variable es independiente de `DEBUG` a proposito: servir los assets desde
Vite es una decision de flujo de trabajo, no de seguridad, y atarla a `DEBUG`
obligaria a encenderlo solo para poder trabajar.

Otros comandos (`make` a secas los lista):

```bash
make check    # manage.py check + tsc --noEmit + lint, sin escribir nada
make lint     # ruff + eslint
make format   # ruff format + prettier (reescribe archivos)
make build    # bundle de produccion en web/static/dist
make migrate  # aplica las migraciones versionadas
```

Las migraciones **si** estan versionadas, y no deben regenerarse desde cero.
Solo `services/config` y `services/imports` tienen modelos. Las de `imports`
llevan una edicion a mano: el nombre de la tabla incluye el esquema de Postgres,
que cambia por entorno, asi que se calcula en la propia migracion en vez de
quedar fijado al entorno donde se genero.

El primer usuario que se cree queda como administrador con todos los permisos.

Herramientas de desarrollo: `pip install -r requirements-dev.txt`.

## Produccion

La imagen se construye en tres etapas: el bundle con Node, las dependencias de
Python, y un runtime que copia ambas cosas y corre como usuario no-root.

```bash
docker build -t netowl .

# El contenedor que atiende HTTP
docker run --env-file .env -p 8000:8000 netowl

# El worker: misma imagen, otro comando. SKIP_COLLECTSTATIC porque no sirve estaticos.
docker run --env-file .env -e SKIP_COLLECTSTATIC=1 netowl \
  celery -A netowl_web worker --concurrency=1 --max-tasks-per-child=1
```

`collectstatic` se ejecuta en el arranque del contenedor y no al construirlo,
porque `settings.py` necesita Vault desde el momento en que se importa y durante
el build no hay red hacia el.

`docker-compose.yml` y `nginx.conf` son especificos de cada despliegue y estan
en `.gitignore`, junto con `deploy/`: no viven en el repositorio.

El despliegue son cuatro contenedores: Postgres, Redis, la app y el worker. Los
dos ultimos usan la misma imagen y solo cambian el comando de arranque.

## Notas

- No hay bateria de pruebas todavia. Las comprobaciones disponibles son
  `make check`.
- Los analisis largos no corren dentro de la peticion: se encolan en Redis y los
  ejecuta el worker. La vista responde al instante con el id del trabajo, y la
  interfaz sondea su fila (`AnalysisJob`) para ir mostrando el log y el progreso
  mientras se calcula. Al terminar, el desenlace queda en el historial de
  importaciones, como antes.
- Un aviso flotante sigue la cola desde cualquier pantalla: que se esta
  calculando, por donde va y cuantos esperan turno. No aparece si no hay nada.
- El analisis mensual recorre el historico de logs una sola vez para los 31
  dias del mes, no una vez por dia. El detalle esta en `EstadoAcumulado`
  (`analytics/analyzer/metrics_calc.py`), junto a la version de referencia
  contra la que se comprueba.
- Los comentarios, docstrings, mensajes de commit y textos de interfaz estan en
  espanol.
