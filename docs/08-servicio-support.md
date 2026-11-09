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
| `cerrados_periodo` | Etapa terminal **y** última actualización dentro del mes; en ATC, también lo que escaló a Soporte en el mes | El trabajo **despachado** en el mes |
| `resueltos_periodo` / `cancelados_periodo` / `escalados_periodo` | Los cerrados, por desenlace | |
| `creados_periodo` | Nació en el mes; en Soporte, también lo que le llegó escalado en el mes | La **demanda** que entró |

La cohorte de un periodo es la unión de las dos, y cada métrica recorta la suya.
Lo escalado entra en las dos puntas del recorrido: ver «El escalamiento dentro
de los grupos».

Etapas terminales: `RESOLVED_STAGES = {"resuelto"}` y `CANCELED_STAGES`
(`cancelado`, `anulado`, `rechazado`, y sus variantes de género e inglés).

### Medidas de tiempo

Dos relojes de cierre, uno de asignación y el tiempo hasta escalar
(`TIME_MEASURE_SPECS`):

| Medida | Tramo | Población |
|---|---|---|
| `cierre_creado_*` | Creación → cierre. Es `duracion_total_horas` de Odoo: el proceso completo, cola incluida | resueltos / cancelados / cerrados |
| `cierre_asignado_*` | Primera asignación → cierre. Solo la gestión del técnico | resueltos / cancelados / cerrados |
| `asignacion` | Creación → primera asignación, o → **el final del periodo** si todavía no la tiene | **creados**. No exige desenlace: la espera ya ocurrió, y medirla solo sobre lo asignado dejaría fuera justo a los que llevan más tiempo esperando |
| `escalamiento` | Creación → paso a Soporte (`creado_a_cierre` sobre la copia de ATC, cuyo cierre es el escalamiento) | **escalados** en el mes. Solo ATC tiene muestra |

En un ticket escalado cada grupo mide su parte: ATC de la creación al
escalamiento, Soporte del escalamiento a su cierre (su `dt_creacion` es el día en
que le llegó). Las horas en cola, pausa y gestión de la composición del tiempo
(`composicion_<tipo>_horas`, sobre los cerrados con logs, `muestra_composicion`)
salen de los logs de etapa del equipo dueño de cada fila.

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
pct_resueltos           = resueltos en P  / cerrados en P
pct_cancelados          = cancelados en P / cerrados en P
pct_escalados           = escalados a Soporte en P / cerrados en P        (solo ATC)
pct_rezagados           = creados en P sin cerrar ni escalar en P / creados en P
pct_recibidos_escalados = llegados de ATC en P / creados en P             (solo Soporte)
```

Resueltos + cancelados + escalados son los cerrados, así que las tres primeras
suman 100 %. Se abren en dos sumandos **sobre el mismo denominador**, para que el
desglose cierre exactamente con el total: del 89 % resuelto, cuánto nació y murió
dentro del mes (`_periodo`) y cuánto venía de meses anteriores (`_arrastre`).

**El total de la empresa es la suma de los grupos**: un ticket escalado cuenta
una vez como cierre de ATC y otra como ticket de Soporte. Es lo que se pidió:
cada grupo trabajó ese ticket.

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
2. Si hay logs de etapa cargados, `flujo.run_flujo_analysis` rehace
   `support_ticket_flujo` (ver «Logs de etapa y escalamiento»). Va **primero**
   porque de él sale cuándo escaló cada ticket. Sin logs, lo dice y no hace nada.
3. Lee, clasifica y reparte el escalamiento (`escalamiento.cargar_tickets`).
4. Para cada periodo objetivo: construye la cohorte, calcula el bloque con
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
5. **Recalcula el promedio acumulado sobre TODO lo que hay en
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
| `/support/dashboard/` (`/support/` redirige a la primera página visible) | `Support/Dashboard` | `can_view_support` y `can_view_support_dashboard` |
| `/support/analytics/` | `Support/Analytics` | `can_view_support_analytics` |
| `/support/results/?period=` | `Support/Results` | `can_view_support_results` |
| `/support/users/` | `Support/Users` | `can_manage_support_users` |
| `/support/etapas/` | `Support/Etapas` | `can_manage_support_users` |

Todas las respuestas pasan por `clean_json_props`. El drill-down
(`api/breakdown/`) exige `period`, `dimension` y `valor`, y acepta `grupo`
opcional. `api/tickets/` limita a 5 000 registros como techo absoluto.

**Analytics es de gráficos y Results de tablas.** Analytics enseña el grupo
(tarjetas, composición, recorrido del mes, en qué se va el tiempo, líneas de
tiempo) y cada eje como barras partidas por desenlace o como velas de la
distribución del cierre; el tipo, la razón y la solución en anillos y la
incidencia por zona en barras. **La cifra principal de un tiempo es siempre el
promedio** —tarjetas, anillo, velas (la marca es el promedio), tickets
abiertos—; la mediana queda como dato adicional al lado o en el tooltip. Results lleva el historial de cierres y el
**detalle del mes** (`analyticsData` del cierre, sin barra de días): la tabla
completa de cada eje, la de incidencia por zona y el mismo desglose al pulsar una
fila, que por eso acepta los dos permisos.

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

---

## Logs de etapa y escalamiento (`logs.py`, `flujo.py`)

El export de tickets da un estado y una `duracion_total_horas`, que Odoo cuenta
desde la creación también en un ticket escalado: suma el tiempo de ATC y el de
Soporte y no dice de quién fue cada parte. Los «Registros de tiempo» —un log por cambio
de etapa— sí, y de ellos sale todo lo de esta sección.

### Importación por lotes (`logs.import_support_logs_csv`)

El histórico completo (~500 k tickets × 12-15 logs) no se puede sacar de Odoo de
una vez, así que **la tabla `support_ticket_logs` nunca se reemplaza**: cada
lote se suma y `log_id` (el ID del registro, único entre todos los tickets) es
la clave. Se sube mes a mes con dos filtros —los logs de los tickets creados en
el mes y los de los tickets cuya última actualización de etapa cae en el mes—,
que se solapan sin problema: lo repetido se descarta con
`ON CONFLICT (log_id) DO NOTHING`. El archivo se lee en bloques, se copia a una
tabla temporal y se inserta todo en una transacción; la respuesta dice cuántos
logs eran nuevos y cuántos ya estaban. Las cabeceras se aceptan con o sin el
prefijo `Registros de tiempo/`. La página de importación muestra los logs por
mes, para ver qué lote falta.

### El catálogo de etapas (`EtapaSoporte`, `/support/etapas/`)

El sufijo `- Soporte Técnico` no basta para saber de quién es una etapa (hay
pausas de Soporte sin sufijo), así que cada etapa declara su **equipo** (ATC,
Soporte o *compartida*) y su **tipo** (cola, pausa, gestión). Una compartida
—«En espera - Falla masiva»— es de ATC antes del escalamiento y de Soporte
después; si el ticket nunca escaló, del equipo en que nació. Una etapa que no
está en el catálogo se trata igual y su tiempo va a «sin clasificar»; la pestaña
«Por clasificar» las lista y el análisis lo avisa. Las de cierre (`Resuelto`,
`Cancelado`) son fijas y no van en el catálogo. Un cambio se ve al volver a
ejecutar el análisis, en todos los meses.

### Reglas

- **Escalamiento**: el primer log que entra en `Nuevo - Soporte Técnico` viniendo
  de una etapa que no es de Soporte. Un ticket creado ahí (etapa anterior vacía)
  no está escalado. Hay como mucho uno por ticket.
- **Tramo**: de un log al siguiente, medido con las fechas de los logs (no con la
  `Duración (horas)` de Odoo). Cada tramo cuenta para su equipo y su tipo; el
  último de un ticket abierto llega hasta el corte.
- Solo cuentan los tickets con la secuencia completa (su primer log es la
  creación): de los demás no se sabe qué pasó antes del primer log.
- Ahora es la hora de Caracas (UTC-4).

`_crear_tramos` arma los tramos con funciones de ventana en una tabla temporal y
`_persistir_flujo` rehace `support_ticket_flujo`: una fila por ticket con su
`escalado_el`, la salida de la cola de cada equipo y las horas `h_<equipo>_<tipo>`.
No hay un bloque mensual aparte: lo que de esto importa entra en las cohortes de
los grupos.

### El escalamiento dentro de los grupos (`escalamiento.py`)

El export de tickets solo conoce el grupo de hoy: un ticket que ATC escaló dice
`Soporte Técnico Nivel 1`, con la fecha de creación de ATC, y ATC no lo ve en
ninguna parte. `incorporar_escalamiento` lo parte en dos filas con los logs:

| | Copia de ATC (`es_escalado`) | Fila de Soporte (`llego_escalado`) |
|---|---|---|
| Grupo | `Atención al cliente` (`GRUPO_ATC`) | el del export |
| Creación | la del ticket | **el escalamiento** |
| Asignación | la del export si es anterior al escalamiento; si no, la salida de la cola de ATC | la salida de la cola de Soporte; si no, la del export si es posterior al escalamiento |
| Cierre | el escalamiento: **cerrado**, ni resuelto ni cancelado | el del export |
| Duración (cierre total) | creación → escalamiento | **escalamiento → cierre** (la de Odoo cuenta desde la creación) |
| Asignado / solución | `Escalado (sin asignado en ATC)` / `Escalado a Soporte` | los del export |
| Horas por tipo | las de ATC | las de Soporte |

- Para ATC escalar es cerrar: el ticket cuenta en sus tickets, creados y
  cerrados, en `pct_escalados` y no en resueltos. Rezagado es lo que a fin de mes
  no había cerrado **ni escalado**.
- Para Soporte es un ticket que entra el día del escalamiento, y sus tiempos se
  miden desde ahí.
- Un ticket escalado en octubre y creado en septiembre es arrastre de ATC en
  octubre (`escalados_arrastre`) y creado de Soporte en octubre.
- Un ticket sin logs queda como dice el export: el análisis funciona igual sin
  logs, solo que sin escalamiento.

Lo usan el análisis (`cargar_tickets`), los cortes por día (sobre el mismo frame)
y el drill-down (`queries._load_period_cohort`, que suma a los tickets del mes
los escalados en él con `escalados_entre`).

### Dónde se ve

En las mismas tarjetas, composiciones y tiempos de cada grupo, en Dashboard,
Analytics y Results: «% Escalados a Soporte» (o «% Llegados de ATC» en Soporte),
escalados del mes y de arrastre en la composición, «Hasta escalar» como medida de
tiempo con su línea de tiempo, y el recorrido del mes (de creados y arrastre a
resueltos, cancelados, escalados y sin cerrar). «En qué se va el tiempo» reparte
las horas promedio de lo cerrado en cola, pausa y gestión, con el promedio para
escalar y qué parte de los escalados pasa de él.

### Tickets abiertos (`get_tickets_abiertos`)

Se calcula al leer, contra la hora actual, desde `support_ticket_flujo`: depende
del último análisis y de los lotes cargados. Un ticket abierto según los logs y
cerrado según el export de tickets le faltan sus últimos logs: no se cuenta y se
dice cuántos son.

