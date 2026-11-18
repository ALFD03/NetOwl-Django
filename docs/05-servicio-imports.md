# 05 · `services/imports/` — carga de CSV y ejecución de análisis

Es el dueño único de la pantalla de importación. Aquí conviven dos cosas que
conviene no confundir:

- **La carga de CSV**, que es síncrona y ocurre dentro de la petición.
- **El lanzamiento de análisis**, que es asíncrono y lo ejecuta el worker.

| Fichero | Contenido |
|---|---|
| `models.py` | `ImportActionLog` (historial permanente) y `AnalysisJob` (estado vivo de una ejecución) |
| `jobs.py` | Lo que comparten la vista que encola y la tarea que ejecuta |
| `tasks.py` | La tarea de Celery y el registro `RUNNERS` |
| `history.py` | `register_import_log()` |
| `views.py` | Pantallas y endpoints |
| `urls.py` | Bajo el prefijo `/imports/` |

---

## Los dos modelos

### `ImportActionLog` — el historial permanente

Lo que ve el usuario en «Historial de Acciones». Una fila por importación o por
cálculo terminado, con `module`, `file_name`, `rows_processed`, `status`
(`success` / `error` / `warning`), `message` y `details` (la traza o el log de
consola completo). Ordenado por fecha descendente.

`to_dict()` es la forma en la que viaja al cliente: la sirven tanto el historial
como el seguimiento de un job, para no tener dos copias que mantener.

Módulos (`MODULE_CHOICES`, compartidos con `AnalysisJob`):
`subs_subscriptions`, `subs_logs`, `subs_analysis`, `crm`, `crm_analysis`,
`support`, `support_analysis`, `subs_lifetime`.

### `AnalysisJob` — el estado vivo

**La única fuente de verdad del estado de una ejecución.** El worker escribe
aquí log y progreso mientras calcula, y la interfaz lo lee por sondeo; por eso
Celery corre sin backend de resultados.

| Campo | Nota |
|---|---|
| `id` | **UUID, no autoincremental**: el id viaja al navegador y se sondea; un entero correlativo dejaría adivinar ejecuciones ajenas |
| `module`, `periodo` | `periodo` es `YYYY-MM`, vacío en los análisis sin periodo (ciclo de vida) |
| `status` | `pending` → `running` → `success` / `error` / `cancelled` |
| `task_id` | Id de la tarea Celery |
| `log` | Salida de consola acumulada |
| `message`, `result` | Lo que la vista devolvía antes en el JSON final |
| `progress_done` / `_total` / `_label` | Alimentan la barra de progreso |
| `created_at`, `updated_at`, `started_at`, `finished_at` | `updated_at` es el **latido**: cada volcado de log lo actualiza |

Dos propiedades:

- `is_open` — `pending` o `running`.
- `esta_muerto` — abierto y sin señales de vida desde hace más de
  `ANALYSIS_JOB_STALE_SECONDS` (15 min). **Si el contenedor del worker muere de
  golpe, la fila se queda en `running` para siempre y bloquearía cualquier
  ejecución posterior del mismo módulo**; pasado el margen se ignora.

### Cancelar es escribir en `status`

No hay bandera aparte ni columna nueva: cancelar pone `cancelled` en `status` y
eso es todo. De ahí salen las dos mitades solas:

- **En cola** — la fila deja de estar abierta, y `ejecutar_analisis` ya
  descartaba los jobs cerrados al recogerlos (la guarda que protege de una
  reentrega tras reiniciar el worker). El análisis no llega a empezar.
- **En curso** — `JobConsole` lo ve en su siguiente volcado y levanta
  `AnalysisCancelled`, que la tarea distingue del resto de excepciones.

**No se le manda nada a Celery.** `revoke(terminate=True)` mata el proceso del
worker a señal limpia, y en mitad de un `COPY` o de un `ALTER TABLE` eso deja la
conexión y la tabla como caigan. Parar en un punto conocido cuesta como mucho un
par de segundos más y no deja nada a medias: cada periodo se guarda en una sola
transacción y se reescribe entero la próxima vez, y los volcados parciales de métricas diarias son
deliberadamente reanudables.

Elegir el campo en vez de una columna nueva no es sólo economía: **añadir un
valor a `choices` no toca la tabla** —Django no genera un CHECK en Postgres— y
por tanto no hace falta ninguna migración. (Cuando se decidió, además,
`django_migrations` era compartida entre entornos y una columna nueva habría
que haberla creado esquema por esquema; hoy cada esquema tiene la suya.)

---

## `jobs.py` — el puente entre la vista y la tarea

| Símbolo | Qué hace |
|---|---|
| `running_job(module)` | La ejecución abierta y viva de ese módulo, o `None` |
| `duplicate_job(module, periodo)` | La que escribiría exactamente lo mismo que la pedida |
| `open_jobs()` | Todas las ejecuciones vivas: en ejecución primero, luego las que esperan turno. Alimenta el aviso flotante |
| `create_job(user, module, periodo)` | Crea la fila en `pending` |
| `module_lock(module)` | Context manager: toma el turno de escritura del módulo o cede con `None` |
| `JobConsole(job)` | Buffer de stdout que además vuelca el log a la fila |
| `mark_started` / `mark_finished` | Transiciones de estado |
| `cancelar_job(job, username)` | Cierra la fila como `cancelled`. No habla con Celery |
| `AnalysisCancelled` | La levanta el punto de control de `JobConsole`; no es un error del análisis |
| `launch_analysis(request, module, needs_period=True)` | Valida, rechaza el duplicado, crea y encola. Devuelve la respuesta ya hecha |

### `module_lock` — por qué existe

Con el worker en paralelo pueden coincidir dos análisis, y dos del mismo módulo
comparten tabla: **los dos borrarían y reescribirían el mismo periodo, y la
primera escritura de un proceso puede ajustar la tabla (`core.tables.ensure`):
dos DDL simultáneas sobre la misma tabla acaban en bloqueo mutuo**.

El cerrojo vive en Redis, con clave `netowl:analisis:<ENV_SUFFIX>:<module>` y
caducidad `ANALYSIS_LOCK_TIMEOUT` (2 h): si el worker muere a la fuerza se
suelta solo. **No espera**: cede con `None` y el llamador reencola.

Al soltarlo se ignora `LockNotOwnedError`: si el análisis duró más que la
caducidad, el cerrojo ya es de otro y soltarlo sería quitárselo.

### `JobConsole` — la consola en vivo

Hereda de `io.StringIO`. Cada `write` mira el reloj y, pasados 2 segundos desde
el último volcado, guarda el log acumulado en la fila del job. No se vuelca en
cada `write` a propósito: un análisis mensual imprime una línea por día y varias
por bloque, y un `UPDATE` por línea multiplicaría las escrituras sin que el
usuario note diferencia.

- `dump(**campos)` **nunca propaga**: esto es la narración del análisis, no el
  análisis. Un corte de conexión guardando el log no puede tirar un cálculo de
  varios minutos. Reintenta una vez tras `close_old_connections()`, porque el
  fallo típico es una conexión caducada entre dos volcados.
- `progreso(hechos, total, etiqueta)` **sí fuerza** el volcado: es lo que mueve
  la barra y llega una vez por día calculado, no una por línea impresa.
- `abort_if_cancelled()` es el **punto de control de la cancelación**: relee
  sólo el estado de la fila y levanta `AnalysisCancelled` si ya está en
  `cancelled`. Se llama al ritmo del volcado y en cada `progreso`, así que es el
  único sitio por el que pasan los cuatro análisis sin excepción y no añade ni
  una consulta por encima de las que ya hacía. Un fallo al preguntar **no**
  detiene nada: dar por cancelado un análisis porque la base parpadeó sería peor
  que tardar dos segundos más en pararlo.
- `_volcando` evita reentrar si algo dentro del propio volcado escribiera a
  stdout, que en ese momento sigue redirigido a este buffer.

### `launch_analysis`

1. Si `needs_period`, lee `month` del cuerpo JSON y exige formato `YYYY-MM`
   (longitud 7) → 400 si no.
2. `duplicate_job(...)`: si ya hay uno abierto del mismo módulo y periodo,
   responde **409** con `status: "running"` y **el job vivo adjunto**, para que
   el cliente se enganche a él en vez de lanzar otro.
3. Crea el `AnalysisJob`, encola `imports.ejecutar_analisis` y responde **202**
   con `status: "queued"` y el job.

> El `import` de `tasks` está diferido dentro de la función: `tasks` importa
> este módulo, y hacerlo arriba cerraría el ciclo.

---

## `tasks.py` — una sola tarea

```python
RUNNERS = {
    'subs_analysis':   _correr_subscriptions,
    'crm_analysis':    _correr_crm,
    'support_analysis':_correr_support,
    'subs_lifetime':   _correr_lifetime,
}
```

Cada *runner* recibe `(job, consola)` y devuelve `(mensaje, resultado)`. **Para
añadir un análisis se registra su función aquí; no se escribe una segunda
tarea.**

| Runner | Qué ejecuta |
|---|---|
| `_run_subscriptions` | Comprueba `products_outside_catalog()` **antes de calcular**, luego `MetricsAnalyzer.run()` y `build_day_metrics()` reutilizando el mismo analyzer (una sola lectura de datos para el cierre y los 31 días) |
| `_run_crm` | `run_crm_analysis(job.periodo)` |
| `_run_support` | `run_support_analysis(job.periodo)` |
| `_run_lifetime` | `run_lifetime_analysis()`: el lifetime de las bajas de todos los meses desde enero de 2026. En el job guarda el resumen (meses, bajas, fecha de corte); la página lee el mes elegido con `get_lifetime_month` |

### `ejecutar_analisis(job_id)`

```
close_old_connections()
job = AnalysisJob.objects.get(pk=job_id)      → si no existe, se registra y se sale
if not job.esta_abierto: return                → reentrega tras reinicio del worker:
                                                 repetirla reescribiría el periodo entero
with bloqueo_modulo(job.module) as turno:
    if turno is None: raise self.retry(countdown=20)   → libera el hueco del worker
    _ejecutar_con_turno(self, job)
```

`_run_with_turn`:

1. `fixtures.reset_cache()` — arrancar con lo último guardado y **no cambiar de
   catálogo a mitad de un cálculo de minutos**.
2. `mark_started(job, task_id)`.
3. `with capture_console(consola): runner(job, consola)`.
4. Captura `AnalysisCancelled` (cierra el job como `cancelled`, con el log
   parcial, y lo deja en el historial como advertencia — no es un fallo),
   `SoftTimeLimitExceeded` y cualquier `Exception`: el desenlace se deja en el
   job y en `ImportActionLog`. **No propaga**: el error interesa donde lo lee la
   interfaz, no como traza de Celery que nadie mira.
5. `mark_finished(...)` + `register_import_log(...)`.

---

## `views.py`

### Pantallas

| Ruta de página | Datos | Permisos |
|---|---|---|
| `/imports/` | *(redirección)* | `can_view_imports` |
| `/imports/subscriptions/` | `/api/imports/subscriptions/` | `can_view_imports` **y** `can_view_imports_subs` |
| `/imports/crm/` | `/api/imports/crm/` | … **y** `can_view_imports_crm` |
| `/imports/support/` | `/api/imports/support/` | … **y** `can_view_imports_support` |
| `/imports/history/` | `/api/imports/history/` | … **y** `can_view_import_history` (últimos 200 registros) |

`/imports/` (`module_root(PAGES)`) **lleva a la primera página que el usuario sí
pueda ver**: quien solo tiene acceso a otra pestaña que Suscripciones llega a la suya.

### Cargas de CSV

Todas (`/api/imports/<módulo>/…/upload/`) pasan por `_import(...)`: `@endpoint`
con `5/m` y `can_import_<x>` **o** `can_import_data`, el cerrojo del módulo (409 si
hay un análisis corriendo), `uploaded_csv(...)` con las cabeceras obligatorias del
dominio, y el temporal borrado al salir. Toda salida —buena o mala— queda en
`ImportActionLog`.

> **Excepción deliberada de esta app:** los endpoints de mutación aceptan *o* el
> permiso granular *o* el comodín heredado (`can_import_data` /
> `can_run_calculations`), para que las cuentas que ya los tenían no pierdan
> acceso. **Ese patrón OR debe conservarse.**

Las cabeceras las comprueba cada importador al leer el fichero (`core.exports`):
un `InvalidExport` (faltan columnas obligatorias, fichero vacío o que no es CSV)
sale como **400** con el mensaje del importador, que dice qué falta y qué trae.

La carga de suscripciones tiene dos respuestas especiales:

| Excepción | Respuesta | Significado |
|---|---|---|
| `UncatalogedProducts` | **409** con `status: "catalog"`, la lista de productos y el número de órdenes afectadas | El export trae productos que el catálogo no reconoce. **No se escribió nada**: la comprobación corre antes de tocar la base. Queda registrado como `warning` |
| `EmptyCatalog` | **409** con `status: "error"` | No hay ni un plan registrado. Es un problema de configuración, no del fichero; confundirlos mandaba a revisar el export |

### Lanzamiento y seguimiento

| Endpoint | Qué hace |
|---|---|
| `POST /api/imports/subscriptions/run/` | `launch_analysis(request, 'subs_analysis')` — `2/m` |
| `POST /api/imports/crm/run/` | `'crm_analysis'` — `2/m` |
| `POST /api/imports/support/run/` | `'support_analysis'` — `2/m` |
| `GET /api/imports/jobs/<uuid>/` | Estado vivo de una ejecución. **Sin límite**: el sondeo es cada pocos segundos y el `2/m` lo cortaría |
| `POST /api/imports/jobs/<uuid>/cancel/` | Detiene una ejecución abierta — `10/m` |
| `GET /api/imports/jobs/queue/` | Todo lo que hay en la cola, para el aviso flotante. Sin límite y sin permiso de módulo |
| `GET /api/imports/jobs/active/?module=…` | La ejecución abierta de un módulo, para reengancharse tras recargar |

Los tres `run/` aceptan `{"month": "YYYY-MM"}` o **`{"months": [...]}`** para
varios meses de una vez (`jobs._launch_batch`, como mucho 24): se crea un job por
mes, igual que si se pidieran sueltos, y el bloqueo del módulo los ejecuta de uno
en uno. Va en un solo POST porque el límite de `2/m` cortaría un lote pedido mes
a mes. Un mes que ya está en la cola o corriendo no se duplica: vuelve en
`skipped` con su job (409 si eran todos). La tarjeta lo ofrece como «Varios
meses» y sigue cada mes en `MonthBatch`.

`_job_is_visible(request, job)` decide qué ve cada uno: **quien lanzó el análisis,
quien puede ver el historial de importaciones, y los superusuarios**.

*(El análisis de ciclo de vida se lanza desde `services/subscriptions`, con
`can_run_lifetime`, pero se sigue con estos mismos endpoints.)*

---

## `history.py`

`register_import_log(user, module, file_name, rows, status, message, details)`.

`user` puede ser `None`: las tareas de Celery registran el desenlace mucho
después de que la petición haya terminado, y el usuario que la lanzó pudo haber
sido borrado entre medias (`AnalysisJob.user` es `SET_NULL`). En ese caso se
registra como «Sistema». La función **nunca propaga**: un fallo escribiendo el
historial no debe tirar el análisis.
