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
| `asignacion` | Creación → primera asignación, o → **el final del periodo** si todavía no la tiene | **creados**. No exige desenlace: la espera ya ocurrió, y medirla solo sobre lo asignado dejaría fuera justo a los que llevan más tiempo esperando |

Cada medida aporta once columnas: siete estadísticos (`medio`, `mediana`, `min`,
`p25`, `p75`, `max`, `std`), `pct_excede_promedio_<medida>` y
`muestra_<medida>`.

#### Qué hace medible un tiempo

**No hay umbral de duración.** Un ciclo de treinta segundos es un ciclo de
treinta segundos, y descartarlo por corto era tirar dato bueno para protegerse
del malo. Lo único que deja fuera a un ticket es que sus fechas no sirvan
(`_tramos_validos`):

| Medida | Condición |
|---|---|
| `cierre_creado_*`, `cierre_asignado_*` | las **tres** fechas presentes y en orden: creación ≤ primera asignación ≤ última actualización de la etapa |
| `asignacion` | creación presente; la asignación, si la hay, no anterior a ella |

Una duración negativa es un error de captura, no un cierre instantáneo: se
descarta. Nunca se sustituye por 0 ni se recorta.

Que las medidas de cierre exijan fecha de asignación **no es una regla de
medición sino de higiene**: un ticket cerrado sin haber sido asignado nunca es
un dato mal capturado. La distancia entre `muestra_cierre_*` y
`tickets_cerrados` es exactamente la cuenta de esos tickets en el periodo, y es
para lo que sirve mirarla.

#### La espera censurada

El ticket creado, **sin asignar y todavía abierto** al corte no queda fuera del
tiempo de asignación: su reloj se cierra contra el corte —fin del día en la barra
diaria, **fin del mes** en el cierre—. Son los que más esperan, y son justo a los
que la métrica sirve para encontrar.

El corte del mes es el fin del mes y no la hora del cálculo, y eso es lo que
garantiza que **un mes cerrado dé siempre lo mismo**: agosto analizado el 1 de
septiembre y agosto analizado en diciembre son el mismo número, aunque entre
medias se haya asignado y cerrado lo que quedaba abierto. Lo que mide es la
espera acumulada *dentro* del periodo. El mes en curso es la única excepción —su
final no ha ocurrido todavía, así que se topa en el instante del cálculo— y por
la misma razón: no contar una espera que aún no ha pasado.

Como efecto de lo anterior, el corte del último día del mes **coincide** con el
cierre del mes, que es lo esperable aquí: a diferencia del CRM, donde el cierre
carga el desenlace donde ocurrió, un ticket de soporte no cambia de mes.

El cerrado sin asignación **no** se censura. Su espera no terminó: el dato está
mal, y es lo que las medidas de cierre señalan por su lado.

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

- **Dimensiones** (el dónde y el quién): `zona`, `sucursal`, `asignado_a`,
  `creado_por`.
- **Desgloses** (el qué): `tipo_solicitud`, `razon_falla`, `solucion_falla`.

**El quién son dos personas, no una.** `creado_por` es quien abrió el ticket en
Odoo y `asignado_a` quien responde de él, y casi nunca coinciden. En el eje del
asignado, `tickets_creados` cuenta los tickets que entraron **a su nombre**, no
los que esa persona abrió: es una cifra legítima, pero se estaba leyendo como la
otra. Cada eje mide ahora lo suyo —el de creación, la demanda que cada quien
registró; el de asignación, el trabajo despachado— y la tabla lo dice en su
subtítulo (`SUPPORT_DIMENSION_CAPTIONS`).

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

Después de resolver, `SUPPORT_LOADER_REQUIRED_COLUMNS` exige `ticket_sequence`,
`asignado_a` y `creado_por`; el mensaje de error **lista las cabeceras encontradas**, porque el
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

**La cohorte lleva su instante de corte** (`PeriodCohort.corte`): el fin del día
con `hasta`, el final del periodo sin él —o el instante del cálculo si el mes
todavía está en curso—. Recortar quién entra no bastaba, porque
las fechas de los que entran podían ser posteriores: el ticket nacido el 3 y
asignado el 20 aportaba al corte del 15 una espera de diecisiete días que ese día
no había ocurrido. De ahí salen dos columnas, resueltas de una vez por corte y
propagadas intactas a cada sub-cohorte:

* `asignado_al_corte` — la primera asignación, o nada si ocurrió después;
* `cerrado_al_corte` — si a esa hora ya estaba cerrado, en el mes que sea. Es lo
  que separa al que sigue esperando asignación del que murió sin ella.

Las tres fechas se convierten en `classify_tickets` y en ningún otro sitio:
`metrics` resta columnas ya parseadas en vez de llamar a `to_datetime` en cada
una de las cientos de sub-cohortes de un corte.

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
| `/support/users/` | `Support/Users` | `can_manage_support_users` |

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

## Directorio de usuarios (`/support/users/`)

El export identifica a una persona por el literal de `Asignado a` y
`Creado por`, y ese literal es lo único con lo que agrupan las dimensiones del
técnico: el mismo nombre escrito de dos maneras son dos técnicos distintos en
el reporte y nada avisa.

`services/support/models.py` registra la forma buena. `UsuarioSoporte.nombre_odoo`
es la clave —**el nombre exacto tal y como Odoo lo exporta, sufijo `(User)`
incluido**—. Es `(User)` en singular, que es lo que dicen los tickets ya
cargados: de los 329 nombres distintos de `asignado_a` y `creado_por`, todos
menos cuatro lo escriben así, cuatro lo escriben `(user)`, y solo `OdooBot` y el
relleno `Sin Especificar` no lo llevan. `normalizar_nombre_odoo` deja siempre esa
forma, y vive en `save()` y no solo en la vista porque la unicidad se apoya en
ella.

**La coincidencia no mira ni el sufijo ni las mayúsculas** (`nombre_base` +
`casefold`, en `analytics/usuarios.py:_clave`). Las dos renuncias las pide el
dato: el mismo export escribe `(User)`, `(user)` y nada, y el directorio se
rellena copiando el literal pero nada impide teclearlo luego con otra caja. Todo
eso es una sola persona.

`nombre` y `apellido` van aparte para poder presentar a alguien sin arrastrar el
sufijo, y no se derivan partiendo `nombre_odoo` por el primer espacio: los
apellidos compuestos no se parten así.

El departamento es **otro modelo** (`Departamento`) y la FK es obligatoria con
`PROTECT`. Por lo mismo que existe el directorio: un departamento tecleado
libremente se escribe de tres maneras y deja de agrupar. Borrar uno con gente
dentro responde 409 en vez de dejar filas huérfanas.

Las dos tablas viven en el esquema del entorno, como los catálogos de
suscripciones: cada entorno tiene su propio directorio.

### La pestaña «Por registrar»

`analytics/usuarios.py:usuarios_fuera_del_directorio()` cruza el directorio con
`support_tickets`: agrupa las dos columnas de persona, normaliza cada literal y
devuelve los que nadie ha registrado, con cuántos tickets tiene asignados y
cuántos ha creado por separado —son dos papeles distintos del mismo directorio—.
`Sin Especificar`, que es el relleno de `SUPPORT_TEXT_COLUMNS`, se descarta: no
es una persona.

A diferencia del catálogo de planes, **esto no bloquea nada**. Un técnico sin
registrar no invalida el análisis, así que es una lista para repasar y no una
verificación previa a escribir. El botón «Registrar» abre el alta con el nombre
ya copiado (`?nuevo_usuario=`), que es lo que evita el error de tipeo en la
única cadena que tiene que coincidir carácter por carácter.

## Agrupación por departamento

En los dos ejes de persona, el panel de dimensión ofrece una segunda lectura:
las mismas cifras sumadas por el departamento al que pertenece cada quien.

**El departamento se resuelve al leer, no al calcular.**
`usuarios.anotar_departamentos` cuelga un `departamento` de cada valor de
`asignado_a` y `creado_por`, y lo llaman `get_support_analytics_structured` y
`get_support_day_payload`. Deliberadamente **no** se llama desde
`estructurar_grupos`, que comparten la lectura del mes y la *escritura* de los
cortes diarios: anotar ahí dejaría el departamento grabado dentro del JSON del
día. Resolverlo al leer es lo que hace que corregir a quién pertenece alguien se
vea en todos los meses, también en los ya analizados, sin reejecutar nada.

**La suma la hace el cliente, y solo porque es exacta.** Dentro de un grupo de
trabajo cada ticket tiene un solo asignado y un solo creador, así que las
personas parten el conjunto: `agruparPorDepartamento`
(`web/src/features/support/lib/supportMetrics.ts`) suma los volúmenes sin contar
nada dos veces, recalcula las tasas desde esas sumas —nunca promedia
porcentajes, cada uno trae fijado su denominador— y pondera los tiempos medios
por su `muestra_*`, que da exactamente la media del conjunto.

**Lo que no se puede reconstruir son las medianas, los percentiles, la
desviación y el `pct_excede_promedio`**: hacen falta los tickets uno a uno. Salen
en cero, y la tabla de departamentos no los enseña —`SUPPORT_DEPARTAMENTO_COLUMNS`
quita la columna de mediana y añade «Personas»— en vez de enseñar un promedio de
medianas. Para la distribución de alguien concreto, su fila sigue estando en la
vista por persona.

Quien no está en el directorio cae en «Sin departamento». Un departamento no
tiene desglose propio: pinchar su fila filtra la tabla de personas a su gente,
que es donde el drill-down sí existe.
