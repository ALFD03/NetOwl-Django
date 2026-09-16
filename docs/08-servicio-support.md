# 08 · `services/support/` — cohortes de tickets

Mide el trabajo de soporte por mes: cuánto entró, cuánto se despachó, con qué
desenlace, cuánto tardó y dónde se concentra la incidencia.

```
services/support/analytics/
├── config.py      Mapa del CSV, etapas terminales, poblaciones, medidas y tasas
├── loader.py      Importación tolerante a cómo Odoo nombra las columnas
├── cohorts.py     Qué tickets entran en un periodo y cómo se clasifican
├── metrics.py     El bloque de métricas de una cohorte (función pura)
├── dimensions.py  Persistencia del corte dimensional
├── analyzer.py    run_support_analysis() y el promedio global
└── queries.py     Lectura, drill-down al vuelo e incidencia por zona
```

---

## Vocabulario

### Poblaciones

**No hay universo seleccionable**: cada métrica trae fijada la población sobre
la que tiene sentido.

| Población | Definición | Qué mide |
|---|---|---|
| `cerrados_periodo` | Etapa terminal **y** última actualización dentro del mes | El trabajo **despachado** en el mes |
| `resueltos_periodo` / `cancelados_periodo` | Los cerrados, por desenlace | |
| `creados_periodo` | Nació en el mes | La **demanda** que entró |

La cohorte de un periodo es la unión de las dos, y cada métrica recorta la suya.

Etapas terminales: `RESOLVED_STAGES = {"resuelto"}` y `CANCELED_STAGES`
(`cancelado`, `anulado`, `rechazado`, y sus variantes de género e inglés).

### Medidas de tiempo

Dos relojes de cierre y uno de asignación (`TIME_MEASURE_SPECS`):

| Medida | Tramo | Población |
|---|---|---|
| `cierre_creado_*` | Creación → cierre. Es `duracion_total_horas` de Odoo: el proceso completo, cola incluida | resueltos / cancelados / cerrados |
| `cierre_asignado_*` | Primera asignación → cierre. Solo la gestión del técnico | resueltos / cancelados / cerrados |
| `asignacion` | Creación → primera asignación | **creados**. No exige desenlace: la espera ya ocurrió, y medirla solo sobre lo cerrado dejaría fuera justo a los que llevan más tiempo esperando |

Cada medida aporta once columnas: siete estadísticos (`medio`, `mediana`, `min`,
`p25`, `p75`, `max`, `std`), `pct_excede_promedio_<medida>` y
`muestra_<medida>`.

#### El umbral de un minuto

`MIN_DURACION_HORAS = 0.016` (1 min). Por debajo, la diferencia entre dos marcas
de tiempo no es tiempo de servicio real sino el rastro de una acción masiva de
Odoo, que asigna y cierra en el mismo segundo. Contarlas hunde el promedio y la
mediana e infla el porcentaje que excede el promedio.

**Se exige tramo a tramo, no sobre el total** (`_tramos_validos`): un cierre solo
cuenta si la espera creación→asignación **y** la gestión asignación→cierre duran
al menos un minuto cada una. Mirar solo el total no bastaba: un ticket asignado y
cerrado en el mismo segundo pasaba el filtro con tal de llevar horas en cola, y
metía en la media un tiempo de gestión que nunca ocurrió. Un ticket **sin fecha
de asignación** queda fuera de las medidas de cierre aunque Odoo le reporte una
duración total.

Una duración negativa es un error de captura, no un cierre instantáneo: se
descarta. Nunca se sustituye por 0 ni se recorta.

### Tasas

```
pct_resueltos  = resueltos en P  / cerrados en P
pct_cancelados = cancelados en P / cerrados en P
pct_rezagados  = creados en P sin cerrar en P / creados en P
```

Las dos primeras se abren en dos sumandos **sobre el mismo denominador**, para
que el desglose cierre exactamente con el total: del 89 % resuelto, cuánto nació
y murió dentro del mes (`_periodo`) y cuánto venía de meses anteriores
(`_arrastre`).

### Dimensiones

Todo cuelga del **grupo de trabajo** (`grupo_trabajo`). Dentro de él:

- **Dimensiones** (el dónde y el quién): `zona`, `sucursal`, `asignado_a`.
- **Desgloses** (el qué): `tipo_solicitud`, `razon_falla`, `solucion_falla`.

**El cruce dimensión × desglose no se persiste.** Con el volumen real el producto
cartesiano son decenas de miles de filas JSONB por periodo para algo que se
consulta de una en una: `queries.get_support_breakdown` lo calcula al vuelo
sobre los tickets del mes, con las mismas funciones de métrica.

---

## Importación (`loader.py`)

`rename` con el mapa literal exige coincidencia exacta, y **Odoo no la da
siempre**: cambia la caja y los acentos, traduce el género del campo, y al
exportar un campo relacional le añade el sub-campo detrás de una barra
(`Asignado a/Nombre para mostrar`).

Cada fallo era **silencioso**: la columna quedaba fuera del DataFrame y el
relleno de `SUPPORT_TEXT_COLUMNS` la dejaba entera en «Sin Especificar»,
colapsando la dimensión del técnico en una única fila sin que nada fallara.

`_resolve_columns` compara por **clave normalizada** (sin BOM, sin acentos, sin
caja) y solo después, si nada coincide, prueba el prefijo antes de la barra.
Hay además un diccionario de alias explícitos (`SUPPORT_CSV_COLUMN_ALIASES`).
Dos cabeceras que resuelvan al mismo destino: gana la primera, porque renombrar
ambas dejaría dos columnas homónimas y `df[SUPPORT_TICKET_COLUMNS]` devolvería un
DataFrame donde se espera una Serie.

Después de resolver, `SUPPORT_LOADER_REQUIRED_COLUMNS` exige `ticket_sequence` y
`asignado_a`; el mensaje de error **lista las cabeceras encontradas**, porque el
fallo típico no es que la columna no exista sino que Odoo la nombró de otra
forma.

Otros detalles:

- Las columnas de texto se rellenan a «Sin Especificar»: son claves de
  agrupación, y un `NULL` partiría la misma zona o el mismo técnico en dos filas
  del reporte.
- `duracion_total_horas` **se conserva como `NULL`** cuando no viene: un 0 sería
  un cierre instantáneo falso.
- `reset_support_tickets` hace `DROP` + `CREATE` de **solo** `support_tickets`.
  Las tablas de resultados no se tocan: guardan los periodos ya evaluados y el
  analizador las reescribe periodo a periodo. Borrarlas en cada importación
  vaciaba el histórico completo aunque después solo se recalculara un mes.

---

## Cohortes (`cohorts.py`)

`classify_tickets(df)` añade **una sola vez sobre la tabla completa** las
columnas derivadas del desenlace (resuelto, cancelado, cerrado, periodo de
creación, periodo de cierre…): las reglas de etapa y la relación creación/cierre
no dependen del mes que se analice.

`PeriodCohort` es **un solo DataFrame**: las poblaciones de cada medida salen de
las columnas booleanas y `filter(columna, valor)` recorta esa misma tabla al
bajar de nivel dimensional. `poblacion(nombre)` devuelve la sub-tabla sobre la
que se mide cada métrica.

`periodos_disponibles` une los meses de creación y los de cierre: **un mes en el
que no nació nada pero sí se cerró arrastre sigue teniendo un reporte que dar**.

`build_cohort(df_all, periodo, hasta=None)` acepta un día de corte: con `hasta`
la cohorte es el acumulado del mes hasta esa fecha, incluida. Un ticket abierto
el 3 y cerrado el 20 cuenta como **creado** —y como rezagado— en el corte del 15,
y solo pasa a cerrado del 20 en adelante. Es lo que alimenta `day_metrics.py`.

---

## `run_support_analysis(periodo=None, progreso=None)`

1. `ensure_support_schema(db)` — idempotente, no pierde nada en una instalación
   con datos.
2. Lee y clasifica los tickets.
3. Para cada periodo objetivo: construye la cohorte, calcula el bloque con
   `compute_metrics_for_period` y guarda:
   - `support_cierre_historico` — el bloque completo como JSONB, con *upsert*
     por `periodo_reporte`.
   - `support_dimensiones_historico` — las filas de grupo, dimensión y desglose
     (`build_dimension_rows`), insertadas en una sola sentencia con
     `execute_values`.
   - `support_day_metrics` — el corte de cada día del mes
     (`build_support_day_metrics`), sobre los mismos tickets ya clasificados.
     Solo cuando se pidió un mes concreto: en una corrida global los cierres se
     recalculan todos, pero recorrer 31 días por cada mes del histórico no es lo
     que nadie espera de ese botón.
4. **Recalcula el promedio acumulado sobre TODO lo que hay en
   `support_cierre_historico`**, no solo sobre los periodos recién procesados:
   analizar un mes suelto no debe borrar el histórico del dashboard de empresa.

`average_blocks` promedia los bloques: los **volúmenes** quedan como promedio
mensual y las **tasas** como promedio simple de las tasas de cada periodo —no
como la tasa del agregado— para que un mes de mucho volumen no aplaste a los
demás al juzgar el desempeño típico. Los periodos con `muestra_<medida> = 0` se
excluyen de la media de esa medida: promediar un periodo sin ninguna duración
medible metería un 0 en la media, que es el mismo sesgo que se corrige a nivel
de ticket.

---

## Lectura (`queries.py`)

| Función | Qué devuelve |
|---|---|
| `get_support_periodos()` | Los periodos con cierre |
| `get_support_cierre_historico(periodos)` | El histórico con las métricas del JSONB **ya aplanadas**: las tablas y las sparklines leen los escalares por nombre, y el JSONB es un detalle de almacenamiento |
| `get_support_metric_totals()` | El dashboard de empresa: promedio de todos los periodos más su serie |
| `get_support_dimension_metrics(periodo)` | Las filas dimensionales persistidas |
| `get_support_analytics_structured(periodo)` | **Todo lo que la vista de periodo necesita en una sola carga** |
| `get_support_breakdown(periodo, dimension, valor, grupo)` | El drill-down de un valor: sus tipos, razones y soluciones, calculado al vuelo |
| `get_incidencia_por_zona(...)` | Tickets por cada 100 clientes de la zona |
| `get_support_tickets_list(limit, grupo, periodo)` | Listado crudo de tickets |
| `get_support_day_series(mes)` | La serie ligera: el bloque global de cada día, sin desgloses. Es lo que dice qué días hay calculados |
| `get_support_day_payload(mes, dia)` | El corte completo de un día: `{global, grupos, incidencia_zonas}` |

`estructurar_grupos(filas)` agrupa las filas dimensionales por grupo de trabajo,
y la usan por igual las persistidas del mes y las que un corte diario trae ya
calculadas: el front recibe exactamente lo mismo en los dos casos.

`_load_period_cohort` reconstruye la cohorte desde los tickets aplicando **las
mismas reglas** del analizador, así que el drill-down es idéntico a lo que se
persistió. Solo se leen los tickets que nacieron o cerraron en el mes.

### Incidencia por zona

```
incidencia = tickets del grupo en la zona / suscriptores activos de la zona × 100
```

- El **numerador se recorta al grupo**; el **denominador no**: no existe un
  reparto de suscriptores por grupo de soporte, así que la población de
  referencia es siempre la base completa de la zona. La lectura de cada fila es
  «tickets de este grupo por cada 100 clientes de la zona», y las tasas de los
  grupos suman la tasa total de la zona.
- Los activos se leen de **`analyzer_churn_dimensiones`** (dimensión
  `zona_sucursal`) y no de un `COUNT` sobre la tabla de suscripciones: esa
  cuenta es la de hoy, y comparar los tickets de un mes antiguo contra la base
  actual convierte el crecimiento de clientes en una caída de la incidencia. Si
  el periodo pedido aún no está calculado en suscripciones, se usa el más
  reciente disponible.
- **Es la única dependencia entre dominios**: soporte lee un resultado de
  suscripciones. Además, `_load_zone_info` usa `fixtures.zonas_por_nombre()`
  para el site y la tecnología de cada zona.

Se devuelven **todos los grupos** en un mapa, no solo el seleccionado, porque el
selector de grupo es de cliente igual que el de dimensión.

---

## Vistas

| Ruta | Página | Permiso |
|---|---|---|
| `/support/` y `/support/dashboard/` | `Support/Dashboard` | `can_view_support` |
| `/support/analytics/` | `Support/Analytics` | `can_view_support_analytics` |
| `/support/results/` | `Support/Results` | `can_view_support_results` |

Todas las respuestas pasan por `clean_json_props`. El drill-down
(`api/breakdown/`) exige `period`, `dimension` y `valor`, y acepta `grupo`
opcional. `api/tickets/` limita a 5 000 registros como techo absoluto.

`analytics` acepta además `?dia=`, que sustituye `grupos` e `incidencia_zonas`
por el corte acumulado de ese día leído de `support_day_metrics`; sin él se envía
el último corte calculado (en un mes cerrado, el cierre).

`dayMetrics` lleva además la **serie ligera** del mes: `serie` es la cohorte
completa de cada día y `serie_grupos` la misma abierta por equipo. Las dos viajan
porque **la página entera está filtrada por grupo** y el selector no tiene un
«todos»: las tarjetas del día siguen al equipo elegido, y cambiarlo no cuesta una
vuelta al servidor. `global_grupos` no añade cálculo —`build_dimension_rows` ya
mide cada grupo para su fila `grupo_trabajo`—.

Soporte empezó a guardar esos bloques después que CRM, así que **un mes analizado
antes tiene sus cortes pero no el resumen del día**: la barra y el desglose
funcionan igual y el bloque de tarjetas lo dice en pantalla; se arregla volviendo
a ejecutar el análisis del mes. Con ella
el cliente resuelve sin pedir nada las tarjetas del día, el acumulado, la
variación contra el día anterior y las líneas de tendencia. Lo único que se pide
por día es el desglose por grupo, y va por `api/day-metrics/`, que el navegador
cachea y adelanta por vecinos: moverse por la barra no espera a la base.

El mes entero con desgloses no viaja porque un corte de soporte lleva las
métricas de cada grupo por sus seis ejes, varios cientos de bloques. Nada de esto
recalcula: se leen celdas ya escritas por el análisis.
