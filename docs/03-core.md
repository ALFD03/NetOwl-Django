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
| `es_cierre_oficial()` | `True` si el corte cae en el último día del mes |

---

## `core/database.py` — `DBConnector`

Pool `SimpleConnectionPool(1, 10)` construido con las credenciales de Vault. Es
el nodo más conectado del repositorio: casi todos los módulos analíticos lo
usan.

| Método | Qué hace |
|---|---|
| `get_connection()` | Context manager. **Hace `rollback()` ante cualquier excepción antes de devolver la conexión al pool**: sin eso vuelve con la transacción abortada y envenena las consultas siguientes |
| `read_table(tabla, columns=None)` | `SELECT` completo a DataFrame, cualificando el esquema con `sql.Identifier` |
| `read_table_filtered(tabla, col, valores, columns=None)` | Igual, con `WHERE col IN (...)` parametrizado |
| `query(sql, params=None)` | SQL libre a DataFrame |
| `tabla_existe(tabla)` | Consulta `information_schema`. Necesario porque las tablas de análisis las crea `save_historico` al vuelo: preguntar por una que no existe aborta la transacción y sube como 500 |
| `save_historico(df, tabla, periodo, metodo=None)` | El escritor principal (ver abajo) |
| `save_day_metrics(periodo, activos_inicio, dias)` | Una fila por mes en `analyzer_day_metrics` |
| `copy_dataframe(df, tabla)` | `COPY` directo, sin crear ni truncar |

### `save_historico` paso a paso

1. Si el DataFrame está vacío, no hace nada.
2. Añade `periodo_reporte` (y `metodo_calculo` si se pasa `metodo`).
3. Normaliza los nombres de columna: `%`→`pct`, espacios→`_`, minúsculas, y
   elimina cualquier carácter fuera de `[a-z0-9_]`.
4. Convierte todo a texto o `None`.
5. **La primera vez por tabla y proceso** (`_schema_cache`): `CREATE TABLE IF
   NOT EXISTS` con todas las columnas `text`, más un `ADD COLUMN IF NOT EXISTS`
   por columna. Así una métrica nueva aparece sin migración.
6. `DELETE` de las filas del mismo `periodo_reporte` (y `metodo_calculo`): el
   recálculo de un mes sustituye al anterior.
7. Inserta: `COPY` con formato CSV tabulado por encima de 1000 filas,
   `execute_values` por debajo.

> Consecuencia a tener presente: **todas las columnas son `text`**. Los lectores
> de `queries.py` convierten explícitamente (`int(row.get(...) or 0)`).

### `save_day_metrics`

Tabla `analyzer_day_metrics` con `periodo_reporte`, `activos_inicio` y
`dia1..dia31` (JSON en texto). Crea un índice único sobre `periodo_reporte` y
hace *upsert* `ON CONFLICT DO UPDATE` **solo de los días enviados**, de modo que
recalcular los días nuevos del mes en curso no borra los anteriores.

---

## `core/utils.py`

| Función | Qué hace |
|---|---|
| `parse_date(valor)` | Prueba `DATE_FORMATS` en orden y cae a `pd.to_datetime(errors="coerce")` |
| `normalize_text(valor)` | Minúsculas, sin acentos, sin puntuación, espacios colapsados. Es la base de todas las comparaciones de texto del churn |
| `validate_csv_structure(ruta, cabeceras, delim=",")` | Lee los primeros 2 KB, detecta el delimitador con `csv.Sniffer` y comprueba las cabeceras obligatorias. Devuelve `(bool, mensaje)`. Abre con `utf-8-sig` para saltarse el BOM de Excel |
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
  (`views_catalogos.py`) y también `_ejecutar_con_turno` al empezar cada
  análisis, de modo que una ejecución no cambia de catálogo a mitad de camino.

### API

| Función | Devuelve |
|---|---|
| `planes()` / `zonas()` | Listas de diccionarios con las claves JSON |
| `planes_disponibles()` / `zonas_disponibles()` | Distinguen «vacío» de «no configurado» |
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
