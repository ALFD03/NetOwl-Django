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

`to_dict()` es la forma en la que viaja al cliente; la vista Inertia y el
endpoint JSON sirven el mismo diccionario para no tener dos copias que mantener.

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

- `esta_abierto` — `pending` o `running`.
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
- **En curso** — `ConsolaJob` lo ve en su siguiente volcado y levanta
  `AnalisisCancelado`, que la tarea distingue del resto de excepciones.

**No se le manda nada a Celery.** `revoke(terminate=True)` mata el proceso del
worker a señal limpia, y en mitad de un `COPY` o de un `ALTER TABLE` eso deja la
conexión y la tabla como caigan. Parar en un punto conocido cuesta como mucho un
par de segundos más y no deja nada a medias: `save_historico` reescribe el
periodo entero la próxima vez, y los volcados parciales de métricas diarias son
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
| `job_en_curso(module)` | La ejecución abierta y viva de ese módulo, o `None` |
| `job_duplicado(module, periodo)` | La que escribiría exactamente lo mismo que la pedida |
| `jobs_abiertos()` | Todas las ejecuciones vivas: en ejecución primero, luego las que esperan turno. Alimenta el aviso flotante |
| `crear_job(user, module, periodo)` | Crea la fila en `pending` |
| `bloqueo_modulo(module)` | Context manager: toma el turno de escritura del módulo o cede con `None` |
| `ConsolaJob(job)` | Buffer de stdout que además vuelca el log a la fila |
| `marcar_inicio` / `marcar_fin` | Transiciones de estado |
| `cancelar_job(job, username)` | Cierra la fila como `cancelled`. No habla con Celery |
| `AnalisisCancelado` | La levanta el punto de control de `ConsolaJob`; no es un error del análisis |
| `lanzar_analisis(request, module, requiere_periodo=True)` | Valida, rechaza el duplicado, crea y encola. Devuelve la respuesta ya hecha |

### `bloqueo_modulo` — por qué existe

Con el worker en paralelo pueden coincidir dos análisis, y dos del mismo módulo
comparten tabla: además de reescribir filas, **`save_historico` crea y altera la
tabla sobre la marcha, y dos DDL simultáneas sobre la misma tabla acaban en
bloqueo mutuo**.

El cerrojo vive en Redis, con clave `netowl:analisis:<ENV_SUFFIX>:<module>` y
caducidad `ANALYSIS_LOCK_TIMEOUT` (2 h): si el worker muere a la fuerza se
suelta solo. **No espera**: cede con `None` y el llamador reencola.

Al soltarlo se ignora `LockNotOwnedError`: si el análisis duró más que la
caducidad, el cerrojo ya es de otro y soltarlo sería quitárselo.

### `ConsolaJob` — la consola en vivo

Hereda de `io.StringIO`. Cada `write` mira el reloj y, pasados 2 segundos desde
el último volcado, guarda el log acumulado en la fila del job. No se vuelca en
cada `write` a propósito: un análisis mensual imprime una línea por día y varias
por bloque, y un `UPDATE` por línea multiplicaría las escrituras sin que el
usuario note diferencia.

- `volcar(**campos)` **nunca propaga**: esto es la narración del análisis, no el
  análisis. Un corte de conexión guardando el log no puede tirar un cálculo de
  varios minutos. Reintenta una vez tras `close_old_connections()`, porque el
  fallo típico es una conexión caducada entre dos volcados.
- `progreso(hechos, total, etiqueta)` **sí fuerza** el volcado: es lo que mueve
  la barra y llega una vez por día calculado, no una por línea impresa.
- `abortar_si_cancelado()` es el **punto de control de la cancelación**: relee
  sólo el estado de la fila y levanta `AnalisisCancelado` si ya está en
  `cancelled`. Se llama al ritmo del volcado y en cada `progreso`, así que es el
  único sitio por el que pasan los cuatro análisis sin excepción y no añade ni
  una consulta por encima de las que ya hacía. Un fallo al preguntar **no**
  detiene nada: dar por cancelado un análisis porque la base parpadeó sería peor
  que tardar dos segundos más en pararlo.
- `_volcando` evita reentrar si algo dentro del propio volcado escribiera a
  stdout, que en ese momento sigue redirigido a este buffer.

### `lanzar_analisis`

1. Si `requiere_periodo`, lee `month` del cuerpo JSON y exige formato `YYYY-MM`
   (longitud 7) → 400 si no.
2. `job_duplicado(...)`: si ya hay uno abierto del mismo módulo y periodo,
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
| `_correr_subscriptions` | Comprueba `productos_fuera_de_catalogo()` **antes de calcular**, luego `MetricsAnalyzer.run()` y `build_day_metrics()` reutilizando el mismo analyzer (una sola lectura de datos para el cierre y los 31 días) |
| `_correr_crm` | `run_crm_analysis(job.periodo)` |
| `_correr_support` | `run_support_analysis(job.periodo)` |
| `_correr_lifetime` | `run_lifecycle_analysis()`; del resultado solo guarda los escalares, porque las curvas de supervivencia son series largas que se leen después con `get_lifecycle_results` |

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

`_ejecutar_con_turno`:

1. `fixtures.reset_cache()` — arrancar con lo último guardado y **no cambiar de
   catálogo a mitad de un cálculo de minutos**.
2. `marcar_inicio(job, task_id)`.
3. `with capture_console(consola): runner(job, consola)`.
4. Captura `AnalisisCancelado` (cierra el job como `cancelled`, con el log
   parcial, y lo deja en el historial como advertencia — no es un fallo),
   `SoftTimeLimitExceeded` y cualquier `Exception`: el desenlace se deja en el
   job y en `ImportActionLog`. **No propaga**: el error interesa donde lo lee la
   interfaz, no como traza de Celery que nadie mira.
5. `marcar_fin(...)` + `register_import_log(...)`.

---

## `views.py`

### Pantallas

| Ruta | Página Inertia | Permisos |
|---|---|---|
| `/imports/` | *(redirección)* | `can_view_imports` |
| `/imports/subscriptions/` | `Imports/Subscriptions` | `can_view_imports` **y** `can_view_imports_subs` |
| `/imports/crm/` | `Imports/Crm` | … **y** `can_view_imports_crm` |
| `/imports/support/` | `Imports/Support` | … **y** `can_view_imports_support` |
| `/imports/history/` | `Imports/History` | … **y** `can_view_import_history` (últimos 200 registros) |

`imports_index_view` recorre `IMPORT_TABS` y **lleva a la primera pestaña que el
usuario sí pueda ver**. Antes `/imports/` era un alias de la pestaña de
Subscriptions, así que un usuario con acceso solo a otra pestaña entraba, se le
negaba y se le expulsaba del módulo sin poder llegar nunca a la suya.

### Cargas de CSV

Las cinco (`subscriptions`, `logs`, `gratis`, `crm`, `support`) siguen el mismo
patrón: `@ratelimit(5/m)`, `permission_required('can_import_<x>', 'can_import_data')`,
`@require_POST`, `handle_csv_upload(...)` con las cabeceras obligatorias del
dominio, y `cleanup_tempfile` en `finally`. Toda salida —buena o mala— queda en
`ImportActionLog`.

> **Excepción deliberada de esta app:** los endpoints de mutación aceptan *o* el
> permiso granular *o* el comodín heredado (`can_import_data` /
> `can_run_calculations`), para que las cuentas que ya los tenían no pierdan
> acceso. **Ese patrón OR debe conservarse.**

La carga de suscripciones tiene dos respuestas especiales:

| Excepción | Respuesta | Significado |
|---|---|---|
| `ProductosSinCatalogo` | **409** con `status: "catalogo"`, la lista de productos y el número de órdenes afectadas | El export trae productos que el catálogo no reconoce. **No se escribió nada**: la comprobación corre antes del `TRUNCATE`. Queda registrado como `warning` |
| `CatalogoVacio` | **409** con `status: "error"` | No hay ni un plan registrado. Es un problema de configuración, no del fichero; confundirlos mandaba a revisar el export |

### Lanzamiento y seguimiento

| Endpoint | Qué hace |
|---|---|
| `POST api/run-analysis/` | `lanzar_analisis(request, 'subs_analysis')` — `2/m` |
| `POST api/run-crm-analysis/` | `'crm_analysis'` — `2/m` |
| `POST api/run-support-analysis/` | `'support_analysis'` — `2/m` |
| `GET api/jobs/<uuid>/` | Estado vivo de una ejecución. **Sin `@ratelimit`**: el sondeo es cada pocos segundos y el límite de `2/m` lo cortaría |
| `GET api/jobs/queue/` | Todo lo que hay en la cola, para el aviso flotante. Sin límite y sin permiso de módulo |
| `GET api/jobs/active/?module=…` | La ejecución abierta de un módulo, para reengancharse tras recargar |

`_job_visible(request, job)` decide qué ve cada uno: **quien lanzó el análisis,
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
