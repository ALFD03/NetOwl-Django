# 03 · `core/` — lo transversal

Aquí vive lo que los cuatro dominios comparten y nada más. **`core` no importa
de `services`**; la dependencia va siempre en el otro sentido. La única
excepción controlada es `core/fixtures.py`, que importa los modelos del
catálogo *dentro* de la función para no reventar con `AppRegistryNotReady`.

| Fichero | Contenido |
|---|---|
| `__init__.py` | Reexporta lo más usado: `DBConnector`, `Periodo`, `TableNames`, `parse_date` y las constantes de estado |
| `vault.py` | Lectura y validación de la configuración sensible |
| `config.py` | Constantes del negocio y el catálogo de nombres de tabla |
| `models.py` | La dataclass `Periodo` |
| `database.py` | `DBConnector`: pool psycopg2 + puente a pandas |
| `utils.py` | Fechas, normalización de texto, validación de CSV, limpieza para JSON, captura de consola |
| `fixtures.py` | Acceso único a los catálogos de referencia, con instantánea cacheada |

---

## `core/vault.py`

Ver [02 · Configuración](02-configuracion.md) para el contrato del secreto.

| Símbolo | Qué es |
|---|---|
| `VaultConfigError` | Error al obtener o validar la configuración |
| `DjangoModel` | `SECRET_KEY`, `DEBUG`, `SECURE_SSL`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`; el validador `split_hosts` acepta lista o cadena con comas |
| `DBConfigModel` | `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` (5432), `DB_SSLMODE` (`prefer`). **El esquema no está aquí**: vive en `.env` |
| `VaultDataStructure` | La forma exacta del JSON: `DJANGOCONFIG` + `DBCONFIG` |
| `VaultSettings` | Autentica (AppRole), lee y valida. Reintenta 3 veces con espera creciente |
| `get_config()` | Singleton: una sola lectura de Vault por proceso |

---

## `core/config.py`

Constantes del dominio, leídas por los tres analizadores.

### Estados de una suscripción

| Constante | Valor | Significado |
|---|---|---|
| `ACTIVE_STATE` | `3_progress` | Activa |
| `INACTIVE_STATES` | `4_paused`, `6_churn`, `8_30days` | Pausada, baja, más de 30 días suspendida |
| `VALID_REACT_ORIGINS` | los mismos tres | Estados desde los que una vuelta cuenta como reactivación |
| `FREE_STATE` | `9_free` | Migrada a servicio gratuito: ni activa ni baja |
| `EXCLUDED_STATE` | `0_other` | Cotización, instalación: fuera del cómputo |
| `CORTE_IMPAGADO_EVENT` | `corte automatico por factura impaga` | Texto que identifica el corte en el log |
| `ARCHIVED_EVENT` / `UNARCHIVED_EVENT` | `suscripcion archivada` / `desarchivada` | Abren y cierran el tramo gratuito |
| `PLAN_CANCELADO` | `Cancelado` | **Marca, no plan**: lo que Odoo deja como producto de una baja |
| `SUBS_STATE_TO_LOG_MAP` | — | Traduce el estado en texto del export al código interno |

### Otras constantes

- `DATE_FORMATS` — nueve formatos que `parse_date` prueba en orden antes de
  ceder a `pd.to_datetime`.
- `ACTIVO_TRUE_TOKENS` / `ACTIVO_FALSE_TOKENS` — vocabulario de la columna
  `Activo` del export. Odoo escribe el booleano como `"True"` o como **cadena
  vacía**: el `False` nunca viaja escrito. Los dos vocabularios se listan de
  forma explícita para poder **detectar** un valor desconocido en vez de que
  caiga en silencio de un lado. Los consumen el cargador de suscripciones y el
  de CRM, que leen el mismo fichero.
- `DIMS` — `["zona", "sucursal", "municipio", "campanna", "producto",
  "zona_sucursal"]`. Estaban declaradas por duplicado en el analizador y en el
  cargador de ciclo de vida.
- `TableNames` — el catálogo canónico de nombres de tabla. Ver
  [10 · Modelo de datos](10-modelo-de-datos.md).

---

## `core/models.py` — `Periodo`

Dataclass con `fecha_inicio` y `fecha_final`. Es lo que todos los análisis usan
para hablar de un mes o de un corte dentro de él.

| Método | Qué hace |
|---|---|
| `Periodo.build(ini, fin=None)` | Sin `fin`, construye el mes completo de `ini` (del día 1 a las 00:00:00 al último día a las 23:59:59). Con `fin`, un corte arbitrario; si `fin` viene sin hora se le pone 23:59:59 |
| `label()` | `"2025-03-01 al 2025-03-31"` — **es la clave `periodo_reporte` de casi todas las tablas** |
| `fecha_corte()` | `"YYYY-MM-DD"` del día final |
| `periodo_mes()` | `"YYYY-MM"` del mes de inicio |

---

## `core/database.py` — `DBConnector`

Acceso a Postgres de la analítica sobre un pool por proceso (`_ProcessPool`,
compartido por todas las instancias; instanciar `DBConnector` no abre nada). Las
credenciales salen de Vault y todo se cualifica con `DB_SCHEMA`.

| Método | Qué hace |
|---|---|
| `get_connection()` | Context manager. **Hace `rollback()` ante cualquier excepción antes de devolver la conexión al pool**: sin eso vuelve con la transacción abortada y envenena las consultas siguientes. Una conexión rota se descarta |
| `transaction()` | Un cursor cuya transacción se confirma al salir sin error. Es lo que usan todos los escritores de `core.tables` |
| `read_table(tabla, columns=None)` | `SELECT` completo a DataFrame |
| `read_table_filtered(tabla, col, valores, columns=None)` | Igual, con `WHERE col IN (...)` parametrizado |
| `query(sql, params=None)` | SQL libre a DataFrame |
| `table_exists(tabla)` | `to_regclass`: en un entorno donde nunca corrió `migrate` ni un análisis la tabla puede no estar, y eso es «sin datos», no un 500 |
| `columns(tabla)` | Las columnas de la tabla en el esquema del entorno |

---

## `core/tables.py` — las tablas de la analítica y su guardado

Cada dominio declara sus tablas en `services/<dominio>/analytics/tables.py` con
`Table(nombre, columnas, primary_key, unique, indexes, defaults)` y las registra
con `register(...)`; el `AppConfig.ready()` de la app importa ese módulo. Los
tipos son constantes del módulo: `TEXT`, `INT` (bigint), `INT32`, `SERIAL`,
`NUMERIC`, `FLOAT`, `DATE`, `TIMESTAMP`, `BOOL`, `JSON` (jsonb).

**Lo que no está declarado no existe.** `ensure(cur, tabla)` crea la tabla si
falta, añade las columnas nuevas, convierte las que cambiaron de tipo con un
`USING` tolerante (un texto que no es número o fecha pasa a `NULL` en vez de
romper), **borra las columnas que ya no están declaradas** y crea los índices
que no existan (si ya hay uno equivalente con otro nombre, lo respeta). Corre una
vez por tabla y proceso; `migrate` lo pasa por todas con `sync_all`, con el
cerrojo de migración tomado.

| Función | Qué hace |
|---|---|
| `replace(cur, tabla, df, **alcance)` | Borra lo que hay en el alcance (`periodo_reporte=…`, o la tabla entera sin alcance), añade el alcance como columnas y carga con `COPY`. **El guardado estándar de un análisis**: recalcular un mes sustituye al anterior, y un resultado vacío deja el mes vacío |
| `truncate(cur, tabla)` / `append(cur, tabla, df)` | Las dos mitades de `replace`, para cargas por bloques (CRM) |
| `upsert(cur, tabla, filas)` | `INSERT … ON CONFLICT (unique o primary_key) DO UPDATE` de las columnas que trae cada fila; pone `updated_at` al momento si la tabla lo tiene |
| `ensure_tables(db, *tablas)` | `ensure` en su propia transacción, para quien lee antes de que nadie haya escrito |
| `coerce(df, tabla)` | El DataFrame con las columnas de la tabla en su orden y con sus tipos. Normaliza los nombres como siempre (`%`→`pct`, minúsculas, solo `[a-z0-9_]`) |
| `apply_types(df, tipos)` | Convierte columnas a su tipo: enteros a `Int64`, fechas con `DATE_FORMATS`, booleanos con `ACTIVO_*_TOKENS`, JSON serializado sin `NaN` |
| `to_bool(serie, unknown=None)` | Booleano de Odoo (`True` o vacío); lo que no está en ningún vocabulario vale `unknown` |

Todo se escribe con el cursor de `db.transaction()`, así que un fallo a mitad
deja la tabla como estaba. Las fechas sin hora son `date` y salen en JSON como
`YYYY-MM-DD`; los enteros que un cálculo antiguo no tenía llegan como `NaN`, y
los lectores los pasan por `core.utils.zero_nulls`.

---

## `core/exports.py` — lectura común de los exports de Odoo

`ExportSpec(label, columns, required, aliases, prefix, types, blanks)` describe
un export: cabecera de Odoo → columna interna, cuáles son obligatorias, otras
formas de escribirlas, el prefijo de modelo que se ignora («Registros de
tiempo/»), los tipos y los textos que en ese export significan vacío (Odoo
escribe `False` en un relacional sin valor). `read_export(ruta, spec)` e
`iter_export(ruta, spec, chunksize)` devuelven el CSV limpio y tipado:

1. Lo leen como texto con `utf-8-sig` (el BOM de Excel fuera).
2. Resuelven las cabeceras sin caja, acentos ni espacios de sobra; primero las
   que coinciden enteras y luego, para las que faltan, sin el último sub-campo
   («Asignado a/Nombre para mostrar» → «Asignado a»). Si dos resuelven a la
   misma columna, gana la primera.
3. Si falta una obligatoria levantan `MissingColumns`, con las que faltan y las
   que trae el fichero. Un fichero vacío o que no es CSV levanta `InvalidExport`
   (de la que hereda `MissingColumns`); la vista lo devuelve como 400.
4. Dejan solo las columnas conocidas, los vacíos como nulo y los tipos.

Lo propio de cada export —consolidar líneas, arrastrar la referencia de la fila
de arriba, comprobar el catálogo— lo hace después su importador.
`spec.fields()` es la lista de cabeceras que muestra la pantalla de
importación, así que no puede separarse de lo que de verdad se lee.

### `core/day_metrics.py`

Lo común a las tres tablas de métricas diarias (`analyzer_day_metrics`,
`crm_day_metrics`, `support_day_metrics`): una fila por mes con
`periodo_reporte`, algún escalar (`activos_inicio` en suscripciones) y
`dia1..dia31` en `jsonb`. Sin dominio: `month_bounds`, `month_label`,
`last_day_to_compute` (que no calcula días futuros del mes en curso),
`cutoff_date`, el guardado y las lecturas.

`save_days(db, tabla, etiqueta, dias, **escalares)` hace *upsert* **solo de los
días enviados**, de modo que recalcular los días nuevos del mes en curso no
borra los anteriores.

| Lectura | Devuelve | Quién la usa |
|---|---|---|
| `read_series(tabla, mes, key, block)` | `{periodo_mes, dias_disponibles, serie: {"1": {…}, …}}` — solo el bloque `global` de cada día | Los tres |
| `read_month(tabla, mes, scalars, key)` | El mes entero, desgloses incluidos | Suscripciones |
| `read_day(tabla, mes, dia, key)` | El corte completo de **un** día, o `None` | CRM y soporte |

`dias_disponibles` cuenta los días **cuya celda tiene contenido**, tenga o no el
bloque dentro; `serie` trae solo los que sí lo tienen. Están separados a
propósito: un mes analizado antes de que su módulo empezara a guardar `global`
conserva sus 31 cortes perfectamente útiles —el desglose se lee igual— y atar la
barra al bloque los hacía desaparecer todos. El resumen del día se apaga solo y
dice por qué.

`read_series` es la que hace que la barra sea instantánea. El recorte lo hace
Postgres (`-> 'global'`), así que los desgloses ni salen de la base: treinta y un
bloques globales son unos pocos kilobytes, y con ellos el cliente resuelve solo
las tarjetas del día, el acumulado, la variación contra el día anterior y las
líneas de tendencia.

Lo que no cabe entero es el **desglose dimensional** de un día: el bloque de
métricas de cada vendedor, sucursal, zona o grupo de trabajo. Un día de
suscripciones sí es pequeño y viaja completo (`read_month`); en CRM y soporte se
pide de uno en uno (`read_day`, servido por `api/day-metrics/`) y el
navegador lo cachea. En ningún caso se recalcula nada: se lee una celda ya
escrita por el análisis.

`key` es el `periodo_reporte` de la fila: la etiqueta larga de `Periodo.label()`
en suscripciones, el `YYYY-MM` en CRM y soporte, como en el resto de sus tablas.

---

## `core/utils.py`

| Función | Qué hace |
|---|---|
| `parse_date(valor)` | Prueba `DATE_FORMATS` en orden y cae a `pd.to_datetime(errors="coerce")` |
| `normalize_text(valor)` | Minúsculas, sin acentos, sin puntuación, espacios colapsados. Es la base de todas las comparaciones de texto del churn |
| `zero_nulls(df)` | Las columnas numéricas con los nulos en 0 |
| `clean_json_props(obj)` | `NaN`/`Inf` → `0.0`, escalares de numpy → nativos, `Timestamp` → ISO 8601 |
| `clean_json_nullable(obj)` | Igual, pero `NaN` → `null`. Para métricas donde 0 no significa «sin dato»: una mediana de supervivencia incalculable debe llegar como `null`, porque un 0 se leería como que todos se dieron de baja de inmediato |
| `parse_jsonb(valor)` | Decodifica una columna JSONB que psycopg2 puede entregar ya parseada o como cadena |
| `capture_console(buffer=None)` | Context manager que redirige `stdout` y `stderr`. **No se debe hacer a mano.** Las tareas de Celery le pasan un `ConsolaJob` |

Detalle de `_clean_json`: comprueba los escalares de numpy **antes** que
`float`, porque `np.float64` hereda de `float` y saldría sin convertir,
reventando después en `json.dumps`.

---

## `core/fixtures.py` — los catálogos de referencia

Es **el único lector** de las tablas de catálogo. Los cuatro consumidores
(`subscriptions/analytics/{imports,queries,eta_report}.py` y
`support/analytics/queries.py`) siguen recibiendo los mismos diccionarios con
las claves de la época JSON (`Site`, `Type`, `Estado`, `TV`…); de eso se encargan
`Zona.to_fixture()` y `Plan.to_fixture()`.

### La caché

El `lru_cache` anterior no caducaba nunca: valía cuando el catálogo era un
fichero que solo cambiaba al desplegar, pero ahora se edita en caliente y **el
worker de Celery es otro proceso que jamás vería la edición**.

En su lugar se guarda **una sola instantánea coherente de todos los catálogos**
(`_Catalogo`, `frozen`) con **60 s de vigencia**, protegida por un `threading.Lock`:

- *Coherente* porque un análisis que consultara planes antes de una edición y
  zonas después mezclaría dos catálogos distintos.
- Un fallo de lectura **degrada a catálogo vacío pero no se cachea**: cachear el
  error dejaría al sistema sin catálogo durante un minuto por un corte de un
  segundo.
- `reset_cache()` lo llaman todas las escrituras del catálogo
  (`services/catalogos/views.py`) y también `_ejecutar_con_turno` al empezar cada
  análisis, de modo que una ejecución no cambia de catálogo a mitad de camino.

### API

| Función | Devuelve |
|---|---|
| `planes()` / `zonas()` | Listas de diccionarios con las claves JSON |
| `zonas_disponibles()` | Distingue «vacío» de «no configurado» |
| `plan_names()` | Qué planes existen. **No incluye `Cancelado`** |
| `nombres_reconocidos()` | `plan_names()` + `Cancelado`. Responde «¿esta línea del export es un plan?» |
| `zonas_por_nombre()` | Zonas indexadas por nombre en minúsculas |
| `orden_sites()` | Sites por relevancia comercial (columna `Site.orden`), no alfabéticamente |
| `productos_ignorados()` | Nombres que alguien declaró que nunca serán un plan |

### Por qué `plan_names()` y `nombres_reconocidos()` son distintas

`Cancelado` es la marca que Odoo deja como producto de una suscripción dada de
baja, y lo llevan unas 22 000 suscripciones. Sin separar los dos conceptos el
sistema era frágil en las dos direcciones:

- **Metiéndolo en el catálogo**, aparece como un producto editable y borrable.
- **Dejándolo fuera del todo**, esas 22 000 suscripciones cuentan como
  «productos sin registrar» y bloquean cada importación y cada análisis.
