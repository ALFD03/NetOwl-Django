# 01 · Arquitectura

## Qué es NetOwl

Panel analítico interno de un ISP (Netcom Plus VE). Calcula, sobre exports de
Odoo cargados como CSV:

- **Suscripciones / churn** — base activa, altas, bajas netas y brutas,
  reactivaciones, cortes por impago, ARPU, clientes en plan gratuito, y el
  desglose de todo ello por seis dimensiones, tanto al cierre del mes como día a
  día.
- **Lifetime** — cuánto duraron activas las suscripciones que se dieron de baja
  en cada mes, desde su instalación: todas y solo las instaladas desde 2026.
- **CRM** — efectividad del embudo comercial por etapa, riesgo de devolución a
  la etapa 8 y tiempos de permanencia.
- **Soporte** — cohortes mensuales de tickets, tiempos de asignación y cierre,
  tasas de resolución/cancelación/rezago e incidencia por zona.
- **Reporte ETA** — las matrices que se declaran a la reguladora.

## Las cuatro capas

```
┌──────────────────────────────────────────────────────────────────┐
│  web/src                React + TypeScript (Inertia)             │
│  pages/ → features/ → shared/     (la dependencia va en un solo  │
│                                    sentido, ver web/src/README)  │
└───────────────▲──────────────────────────────────────────────────┘
                │ props Inertia (render) + fetch JSON (endpoints api/)
┌───────────────┴──────────────────────────────────────────────────┐
│  services/<dominio>/views*.py + urls.py        Capa HTTP          │
│  Vistas finas: parsear petición → llamar a analytics → responder  │
└───────────────▲──────────────────────────────────────────────────┘
                │ (los views importan de analytics, nunca al revés)
┌───────────────┴──────────────────────────────────────────────────┐
│  services/<dominio>/analytics/                 Capa analítica     │
│  pandas + SQL. loader → dimensions → analyzer → queries           │
└───────────────▲──────────────────────────────────────────────────┘
                │
┌───────────────┴──────────────────────────────────────────────────┐
│  core/          Vault · DBConnector · Periodo · TableNames        │
│                 utilidades de datos · catálogos (fixtures)        │
└──────────────────────────────────────────────────────────────────┘
```

Reglas que se mantienen en todo el repositorio:

1. **`core/` no importa de `services/`.** La dependencia va siempre en el otro
   sentido.
2. **`views.py` importa de `analytics/`, nunca al revés.** La lógica de negocio
   no vive en las vistas.
3. **El backend nunca importa del frontend.**
4. **Las apps no se importan entre sí salvo por sus puertas declaradas**: lo
   compartido entre apps vive en `services/config/` (decoradores, subida de
   CSV, permisos) o en `core/`. La excepción deliberada es
   `services/imports/views.py`, que importa los importadores de los tres
   dominios porque es el dueño único de la pantalla de importación.

### Estructura de cada dominio

```
services/<dominio>/
├── analytics/
│   ├── config.py       Constantes del dominio: cabeceras del CSV, vocabularios
│   ├── loader.py       CSV o base de datos → DataFrame
│   ├── dimensions.py   Desgloses por dimensión
│   ├── analyzer.py     Calcula y persiste vía DBConnector.save_historico
│   └── queries.py      Lo que leen las vistas de los resultados ya calculados
├── views.py            Capa HTTP
└── urls.py
```

Los nombres son deliberados: moverse de `crm` a `support` no obliga a reaprender
la disposición. `subscriptions` es el único que crece por encima de ese esquema
(ver [06](06-servicio-subscriptions.md)).

## Dos capas de acceso a datos, separadas a propósito

| | `DBConnector` (`core/database.py`) | ORM de Django |
|---|---|---|
| **Quién lo usa** | Todo `services/*/analytics/` | Solo `services/config/models.py`, `services/imports/models.py` y `services/subscriptions/models.py` |
| **Qué guarda** | Datos calculados y tablas cargadas del CSV | Usuarios, permisos, bitácora, trabajos de análisis, catálogos |
| **Esquema** | Tablas creadas y alteradas al vuelo, **todas las columnas `text`** | Migraciones versionadas |
| **Carga masiva** | `COPY` por encima de 1000 filas, `execute_values` por debajo | — |
| **Esquema Postgres** | Cualificado con `DB_SCHEMA` | Depende del modelo (ver [02](02-configuracion.md)) |

No es accidental: la analítica escribe tablas cuya forma cambia con cada métrica
nueva, y modelarlas con el ORM obligaría a una migración por columna.

## Ciclo de vida de una petición de lectura

1. El navegador pide `/subscriptions/analytics/`.
2. `netowl_web/urls.py` delega en `services/subscriptions/urls.py`.
3. El decorador `@permission_required('can_view_subs_analytics')` comprueba el
   perfil; si falla, redirige a la primera página que el usuario sí pueda abrir
   (`LANDING_ROUTES`) o devuelve 403 JSON si la petición era de datos.
4. La vista llama a `analytics.queries.get_analytics_data(...)`, que lee las
   tablas ya calculadas con `DBConnector`.
5. Los props pasan por `clean_json_props` (o `clean_json_nullable`) para que
   `JSON.parse` no se atragante con `NaN`/`Infinity`.
6. `render_inertia(request, "Subscriptions/Analytics", props)` devuelve HTML con
   los props embebidos; `InertiaShareMiddleware` añade el usuario y su matriz de
   permisos.
7. `web/src/app/main.tsx` resuelve la cadena `"Subscriptions/Analytics"` contra
   `import.meta.glob('../pages/**/*.tsx')` y monta React.

> **Contrato frágil:** el nombre que pasa la vista es la ruta del fichero bajo
> `web/src/pages/`. Renombrar o mover una página rompe la vista en tiempo de
> ejecución, sin error de compilación.

## Ciclo de vida de un análisis

Los análisis tardan minutos: dentro de la petición chocaban con el 504 del proxy
inverso y con el `--timeout 300` de gunicorn, que dejaba un mes con la mitad de
los días escritos. Hoy corren en un worker de Celery.

```
Navegador                Django (web)                 Redis          Worker Celery
   │  POST api/run-analysis/  │                          │                  │
   ├─────────────────────────►│ lanzar_analisis()        │                  │
   │                          │  · valida el mes         │                  │
   │                          │  · 409 si ya hay uno     │                  │
   │                          │    igual abierto         │                  │
   │                          │  · crea AnalysisJob      │                  │
   │                          ├─ encola ────────────────►│                  │
   │ ◄── 202 {job} ───────────┤                          ├─ entrega ───────►│
   │                          │                          │      bloqueo_modulo()
   │                          │                          │      fixtures.reset_cache()
   │  GET api/jobs/<uuid>/    │                          │      runner(job, consola)
   ├─────────────────────────►│ lee la fila AnalysisJob ◄┼──── log + progreso cada 2 s
   │ ◄── estado, log, % ──────┤                          │                  │
   │        (cada 2 s)        │                          │      marcar_fin() + historial
```

Piezas clave:

- **`services/imports/jobs.py`** — `lanzar_analisis()` (validar, rechazar el
  duplicado exacto, crear la fila y encolar), `bloqueo_modulo()` (cerrojo Redis
  por módulo y entorno) y `ConsolaJob` (buffer de stdout que vuelca el log a la
  fila cada 2 segundos).
- **`services/imports/tasks.py`** — una sola tarea, `imports.ejecutar_analisis`,
  y un diccionario `RUNNERS` que la especializa por módulo. **Para añadir un
  análisis se registra su función en `RUNNERS`; no se escribe una segunda
  tarea.**
- **`AnalysisJob`** (`services/imports/models.py`) es la única fuente de verdad
  del estado. Celery corre **sin backend de resultados** a propósito.

Concurrencia:

- Varios análisis **de módulos distintos** corren en paralelo
  (`CELERY_WORKER_CONCURRENCY`, por defecto 2).
- Dos del **mismo módulo** nunca se solapan: comparten tabla y `save_historico`
  la crea y altera sobre la marcha. El que llega segundo hace
  `self.retry(countdown=20)` y libera el hueco del worker, quedándose visible
  como `pending`.
- Solo se rechaza (409) el **duplicado exacto**: mismo módulo y mismo periodo ya
  abierto. En ese caso la respuesta lleva el job vivo para que el cliente se
  enganche a él en vez de lanzar otro.

## Convenciones transversales

- **Progreso por `print`.** Los analizadores narran su avance por stdout y se
  captura con `capture_console()` (`core/utils.py`). No se debe escribir un
  `redirect_stdout` a mano.
- **Pasos contables → barra de progreso.** `build_day_metrics()` recibe un
  callback `progreso(hechos, total, etiqueta)`; es lo que mueve la barra de
  `AnalysisRunnerCard` y del aviso flotante `AnalysisQueueAlert`.
- **Los endpoints de mutación llevan límite de peticiones**
  (`@ratelimit(key='ip', ...)`): `2/m` para los que disparan un cálculo, `5/m`
  para las cargas de CSV, `60/m` para el CRUD de catálogos. Los endpoints de
  sondeo (`api/jobs/...`) van deliberadamente **sin** límite.
- **Props JSON-safe.** Todo lo que venga de pandas pasa por `clean_json_props`
  o, cuando `NaN` significa "sin valor" y no cero, por `clean_json_nullable`.

## Mapa rápido de ficheros

| Ruta | Qué es |
|---|---|
| `manage.py`, `netowl_web/` | Proyecto Django: settings, urls, wsgi, middleware, Celery |
| `core/` | Lo transversal sin dominio |
| `services/config/` | Autenticación, perfiles y permisos |
| `services/imports/` | Carga de CSV y ejecución de análisis |
| `services/subscriptions/` | Churn, ciclo de vida, ETA y catálogos |
| `services/crm/` | Embudo comercial |
| `services/support/` | Tickets de soporte |
| `web/src/` | React |
| `web/templates/app.html` | La única plantilla Django |
| `data/Planes.json`, `data/Zonas.json` | Semilla inicial de los catálogos (solo los lee `cargar_catalogos`) |
| `scripts/dev.sh` | Arranque de desarrollo |
| `deploy/`, `Dockerfile`, `entrypoint.sh` | Empaquetado y despliegue |
| `graphify-out/` | Grafo de conocimiento del repositorio (generado) |
