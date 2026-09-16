# 07 · `services/crm/` — el embudo comercial

Mide qué hace el embudo de venta con cada oportunidad: cuántas instalan, cuántas
se pierden, cuánto tarda cada etapa y **de quién es la culpa cuando algo falla**.

```
services/crm/analytics/
├── config.py      Vocabulario de etapas, reglas de efectividad y de atribución
├── loader.py      Import del export de Odoo + DDL del esquema CRM
├── dimensions.py  El mismo bloque de métricas por campaña, sucursal y vendedor
├── analyzer.py    run_crm_analysis(): recorre periodos y persiste
├── metrics/
│   ├── core.py         Compone el bloque de métricas de un periodo
│   ├── efectividad.py  Quién responde por cada ciclo fallido
│   ├── probabilidad.py Riesgo de caer a la etapa 8
│   └── tiempo.py       Permanencia por etapa y tiempos de cierre
└── queries.py     Lectura de lo calculado
```

---

## Las etapas

`ETAPA_MAP` traduce el nombre largo de Odoo a una clave canónica:

| Clave | Etapa |
|---|---|
| `etapa_1_contacto` | Contacto inicial |
| `etapa_2_recepcion` | Recepción de datos y creación de ficha |
| `etapa_3_factibilidad` | Evaluación de factibilidad |
| `etapa_4_adecuaciones` | Adecuaciones de red óptica |
| `etapa_5_gpi` | Gestión y planificación de instalaciones |
| `etapa_6_contratistas` | Asignado a contratistas |
| `etapa_7_instalados` | Clientes instalados |
| `etapa_8_devueltos` | Prospectos devueltos |
| `etapa_9_disponibles` | Disponibles en otra fecha |
| `etapa_10_proyectos` | Potenciales para proyectos |
| `perdido` | Perdido |

Tres listas distinguen matices que el orden por sí solo no da:

- `ETAPA_FLUJO` (1→7) — **el embudo lineal**. Las etapas 8, 9 y 10 van después en
  `ETAPA_ORDER` pero no son un avance, así que el sentido de un movimiento se
  decide contra esta lista.
- `ETAPAS_SIN_ESPERA` (7 y `perdido`) — no son cola de trabajo: nadie «espera»
  en ellas, así que su duración de salida no mide gestión.
- `ETAPAS_CLAVE_VENTAS` — las que manda la venta; el reporte de tiempos las
  destaca.

`map_stage_canonically` tolera cómo escribe Odoo: primero el mapa literal, luego
el número inicial, y por último una comparación normalizada por palabras clave.

---

## Importación (`loader.py`)

El export de Odoo viene **agrupado**: una fila por oportunidad y, debajo, sus
movimientos con la referencia en blanco. `parse_odoo_chunk` arrastra el
`client_id` hacia abajo y parte el CSV en dos tablas:

- `crm_clients` — una fila por oportunidad (estado actual, motivos, fechas,
  dimensiones).
- `crm_logs` — una fila por **movimiento** entre etapas.

Se lee **por trozos de 50 000 filas** y se lleva el último `client_id` válido de
un trozo al siguiente. La columna `Activo` usa el mismo vocabulario que el
loader de suscripciones (`ACTIVO_TRUE_TOKENS` / `ACTIVO_FALSE_TOKENS`), porque
es el mismo export de Odoo; lo que no esté en ninguno de los dos queda como
nulo.

`_create_tables_if_not_exist` crea las cinco tablas del dominio con sus índices
e incluye **migraciones en caliente** (`ADD COLUMN IF NOT EXISTS`) para las
columnas que se fueron añadiendo: la efectividad y el tiempo por etapa del
periodo, los tiempos de cierre combinados y el desglose del riesgo de devolución.
`ensure_crm_schema(db)` es su puerta pública y se llama al principio de cada
análisis.

---

## `run_crm_analysis(periodo=None, progreso=None)`

Los pasos 1–5 los hace `poblaciones.preparar_datos(db)` y el 6,
`poblaciones.construir_poblaciones(datos, periodo, hasta=None)`. Están en un
módulo aparte porque **el corte del mes y el corte de un día son la misma
operación con distinto `hasta`**, y no puede haber dos definiciones de qué es
una oportunidad ganada.

1. `ensure_crm_schema(db)`.
2. Lee `crm_clients` y `crm_logs`. **Descarta oportunidades duplicadas por `id`**
   (avisando en el log): una repetida ensancharía todos los cruces con los logs
   y contaría cada movimiento tantas veces como copias tenga.
3. Asigna `periodo_creacion` y `periodo_cierre` en formato `YYYY-MM`.
4. **Resuelve a qué oportunidad pertenece cada log.** `Iniciativa/ID`
   (`entrada_id`) *es* el id de la oportunidad; `client_id` solo es el que el
   cargador arrastró desde la fila padre del CSV, así que queda de respaldo. Si
   muchos no resuelven, se avisa en el log.
5. Calcula **una sola vez** las permanencias en etapa sobre toda la base
   (necesitan el historial completo) y fija `ahora`, para que todos los periodos
   de una misma ejecución se midan contra el mismo reloj.
6. Para cada periodo objetivo (el pedido, o todos los de creación):

   | Conjunto | Definición |
   |---|---|
   | `df_creados` | Creadas en P |
   | `df_ganados` | Creadas en P, `ganado`, etapa 7 y cierre en P |
   | `df_perdidos` | Creadas en P, `perdido` y cierre en P |
   | `df_pendientes` | Creadas en P que no cerraron en P |
   | `df_logs_p` | Movimientos con fecha en P |
   | `df_logs_e8_p` | De esos, los que van a la etapa 8 |
   | `df_en_riesgo` | **Todo lo que tuvo vida en P** (ver abajo) |
   | `df_hist_p` | Historial completo de quienes se movieron en P |
   | `df_perdidas_cierre` | Perdidas **con cierre en P**, se hayan creado cuando se hayan creado |
   | `df_perm_p` | Estancias cuya entrada a la etapa cae en P |

7. `compute_crm_metrics_for_period(...)` y persistencia en
   `crm_cierre_historico` + `crm_dimensiones_historico`.
8. **El corte de cada día del periodo** (`build_crm_day_metrics`), sobre la misma
   base ya preparada. Solo cuando se pidió un mes concreto: en una corrida global
   los cierres se recalculan todos, pero recorrer 31 días por cada mes del
   histórico no es lo que nadie espera de ese botón.
9. Al final, el promedio acumulado global en `crm_metricas_globales`.

`_COLUMNAS_CIERRE` declara **una sola vez** las columnas escalares del cierre;
el SQL (columnas, marcadores y valores) se construye a partir de ella. Se usa
`m[c]` y no `.get`: una métrica declarada y no calculada debe reventar, no
escribir un NULL silencioso en el histórico.

---

## Las métricas

### Riesgo de devolución a la etapa 8 (`probabilidad.py`)

**Es una tasa de riesgo mensual, no una probabilidad de cohorte:**

```
pct_devueltos_e8 = transiciones a la etapa 8 ocurridas en P
                   ─────────────────────────────────────────
                   oportunidades con vida en P
```

*Vivo en P* = creada en P o antes **y** todavía sin cerrar al empezar P. Entran
las arrastradas de meses anteriores, que son la mayor parte de lo que el embudo
gestiona cualquier mes dado.

La razón de medirlo así, y no siguiendo a la cohorte de creación hasta su
desenlace, es que **un mes cerrado no vuelve a cambiar**: numerador
(movimientos con fecha en P) y denominador (fechas de creación y cierre) son
hechos ya escritos. Una métrica de cohorte obligaría a reprocesar el pasado cada
vez que llegan datos nuevos.

**No toda devolución es del embudo.** Los motivos de `ETAPA8_EXCEPTION_MOTIVOS`
(el cliente no contesta, espera su router) son ajenos a la gestión y se excluyen.
El problema es que el motivo solo es legible mientras la oportunidad siga en la
etapa 8 —`devolver_oportunidad` se sobrescribe al moverse— y **dos tercios de las
devoluciones históricas no lo traen**. Se imputan: la fracción que son de
gestión se estima con la tasa observada en las que sí lo traen, **condicionada a
la etapa de origen** (que el log siempre conserva). Si un origen no llega a
`E8_IMPUTACION_MIN_MUESTRA` (30) casos legibles se usa la tasa global, y si no
hay ninguno legible no se excluye nada: sin evidencia de excepción, la devolución
cuenta.

La parte estimada viaja en su propio campo, separada del dato duro. Invariantes:

```
count_devueltos_e8_bruto = count_devueltos_e8 + e8_devueltos_excepcion
count_devueltos_e8       = observadas de gestión + e8_devueltos_estimados
count_devueltos_e8_bruto = e8_devueltos_con_motivo + e8_devueltos_sin_motivo
```

### Efectividad (`efectividad.py`)

**La unidad es la transición, no el cliente.** Cada vez que una oportunidad sale
de la etapa hacia adelante se abre un ciclo, y ese ciclo termina bien o mal. Un
cliente que pasó cuatro veces por factibilidad antes de instalar deja tres ciclos
fallidos y uno bueno: contar por cliente único diría «instaló, 100 %» y
escondería justo lo que hay que ver, porque casi todos acaban instalando.

Dos fuentes con alcances distintos:

| Fuente | Qué guarda |
|---|---|
| `crm_logs` | **Movimientos** entre etapas: historia completa y auditable |
| `crm_clients` | **Estado actual**. La pérdida solo existe aquí: no hay ningún movimiento a «perdido» en el log |

Desenlaces de un ciclo, leídos sobre todo el historial del cliente:

| Desenlace | Significado |
|---|---|
| `exitoso` | Llegó a instalarse sin volver |
| `retorno` | Volvió a la etapa: hubo que repetir el trabajo |
| `devuelto` | Salió del embudo a la etapa 8 |
| `perdido` | La oportunidad se dio de baja (viene del estado, no del log) |

Quién paga cada fallo:

- El **retorno** lo paga la etapa que mandó al cliente hacia adelante
  (`RETORNO_ATRIBUCION`).
- La **devolución** la paga la etapa que indica su motivo (`ETAPA8_ATRIBUCION`,
  en orden de prioridad: gana la primera etapa cuyo motivo y destino de avance
  encajan). Lo no legible se estima y viaja en `devoluciones_estimadas`.
- La **pérdida** la paga la etapa donde murió (`PERDIDA_ATRIBUCION_POR_ETAPA`),
  salvo si murió en la etapa 8, que no es de nadie y se resuelve por motivo
  (`PERDIDA_ATRIBUCION_MOTIVO`). **Se cobra una sola vez, en el periodo de su
  `fecha_cierre`.** La etapa 6 no es una fila del reporte: quien mandó al
  cliente a contratistas fue GPI, así que responde GPI. Morir instalado no es un
  fallo del embudo de venta.

Las filas del reporte son las cuatro de `EFECTIVIDAD_REGLAS`: factibilidad,
adecuaciones, GPI y **`ventas`** (etapas 1 y 2), que tiene población propia, no
es un duplicado de factibilidad, y recoge lo que ninguna etapa técnica explica.

Invariantes:

```
total_salidas = exitosos + fallidos + retornan
fallidos      = retornos_penalizados + devoluciones_atribuidas
                + devoluciones_estimadas + perdidas_atribuidas
```

### Tiempos (`tiempo.py`)

**`compute_tiempos_cierre(ganados, perdidos)`** devuelve tres distribuciones:
`instalacion`, `perdida` y **`cierre`**, que es el universo cerrado (ganados y
perdidos juntos) y **no el promedio de las otras dos**: una cohorte con muchas
más pérdidas que instalaciones pesa hacia la pérdida, que es justo lo que hace
comparable el dato entre periodos. Los pendientes quedan fuera.

**`compute_tiempo_por_etapa(logs, permanencias, ahora)`** — cuánto tarda una
oportunidad en salir de cada etapa. La medida base son los movimientos agrupados
por `etapa_anterior`, porque la duración que trae el log es el tiempo que la
oportunidad pasó en la etapa de la que sale. Sobre eso:

- Se descartan los orígenes que no son cola de trabajo y las etapas fuera del
  catálogo.
- Se descartan los movimientos de duración exactamente 0 (menos de un minuto,
  `TIEMPO_ETAPA_MIN_DURACION_H`): son dos escrituras del mismo instante, no una
  estancia, y solo inflan el divisor. Van a `movimientos_nulos`. Un movimiento
  corto pero real cuenta entero.
- **Se deduplica por la clave del propio log (`id`), NO por `entrada_id`.**
  `entrada_id` es el `Iniciativa/ID` del CSV, que es el id de la oportunidad y se
  repite en todos sus movimientos: deduplicar por él dejaría una sola transición
  por oportunidad.
- Junto al promedio crudo se publica uno **winsorizado** al percentil 95
  (`TIEMPO_ETAPA_WINSOR_P`), porque el crudo lo domina la cola de oportunidades
  olvidadas meses en una etapa. El caso extremo no se descarta: entra valiendo
  el corte, así que el promedio sigue estando sobre las N salidas reales.
- Cada etapa se desglosa por desenlace: avanzar, volver atrás y acabar devuelto
  son tres cosas distintas, y mezclarlas es lo que hacía ilegible el número.

**`compute_permanencias_en_etapa(clients, logs, ahora)`** — el log solo registra
salidas, así que medir solo sobre él deja fuera exactamente los casos lentos: los
que siguen ahí. Esta función mide la estancia en curso contra un corte:

- Con `fecha_cierre`, la oportunidad murió (o se ganó) dentro de la etapa: la
  estancia está terminada y **el dato no se mueve**.
- Sin `fecha_cierre`, sigue viva y el corte es **AHORA**, así que el dato
  envejece en cada ejecución. Es lo que se quiere —tres días estancado son tres
  días— pero implica que **reanalizar un mes antiguo no devuelve el mismo número
  que la vez anterior**.

Las permanencias no entran en la cifra principal: se publican al lado, en
`permanencia`, y `combinado` junta las dos poblaciones para quien quiera la
lectura sin sesgo de supervivencia. Una etapa de la que nadie ha salido todavía
sí produce fila: su tiempo son sus estancias en curso, y es justo la que el
cálculo anterior ocultaba.

---

## Dimensiones (`dimensions.py`)

Las tres dimensiones son `campana`, `sucursal` y `vendedor`. Para cada valor se
recorta **la misma batería de DataFrames** y se llama a la misma
`compute_crm_metrics_for_period`, así que una rebanada dimensional se calcula
exactamente igual que el total. Los logs se recortan por `oportunidad_id`, y la
población en riesgo también: el riesgo de devolución de una sucursal se mide
contra lo que esa sucursal tenía vivo, no contra la base entera.

Se guarda un `DELETE` + `INSERT` del periodo en `crm_dimensiones_historico`, con
`metricas` y `efectividad` como JSONB.

---

## Cortes por día (`day_metrics.py`)

Una fila por mes en `crm_day_metrics`, con `dia1..dia31`. Cada día es
`{"global": {...}, "dimensiones": [...]}`: **el acumulado del mes hasta ese
día**, con la misma forma que el cierre y sus dimensiones, para que la vista no
tenga que distinguirlos.

Qué significa el corte del día N:

- lo creado hasta ese día, lo cerrado hasta ese día, los movimientos hasta ese
  día. Una oportunidad que cerró el 20 aparece como **pendiente** en el corte del
  15, porque el 15 lo estaba;
- lo que el corte **no** puede deshacer es `etapa_actual`: `crm_clients` guarda
  un estado, no su historia. Solo se usa para distinguir una ganada de una
  pendiente ya cerrada, y esas ya cuentan como pendientes en el corte;
- las estancias en curso se siguen midiendo contra AHORA, igual que en el
  análisis mensual;
- **el corte del último día no siempre coincide con el cierre del mes**, y no es
  un fallo: una oportunidad de enero perdida en marzo es una pérdida en el cierre
  —la efectividad cobra el fallo donde ocurrió— y una pendiente en el corte del
  31 de enero, porque ese día seguía viva. La barra responde «qué se veía ese
  día»; el cierre, «cómo acabó el mes».

El coste dominante es preparar la base, no el corte, así que los 31 días salen
de la misma lectura que el cierre. El volcado es parcial cada cinco días: si la
ejecución se corta, lo ya hecho queda guardado.

---

## Lectura (`queries.py`) y vistas

| Función | Devuelve |
|---|---|
| `get_crm_periodos()` | Los periodos con cierre calculado |
| `get_crm_cierre_historico(periodos)` | Las filas del cierre, con `efectividad` y `tiempo_por_etapa` ya parseados a lista |
| `get_crm_metric_totals(periodo)` | Promedio global + tiempos + efectividad + la serie histórica (sin los dos JSON por periodo, que nadie lee ahí) |
| `get_crm_dimensiones(periodos, dimension)` | Las filas dimensionales con su JSONB parseado |
| `get_crm_day_metrics(mes, dia)` | `{periodo_mes, dias_disponibles, dia, payload}` — el corte de un día y la lista de los calculados |

| Ruta | Página | Permiso |
|---|---|---|
| `/crm/` y `/crm/dashboard/` | `CRM/Dashboard` | `can_view_crm` |
| `/crm/analytics/` | `CRM/Analytics` | `can_view_crm_analytics` |
| `/crm/results/` | `CRM/Results` | `can_view_crm_results` |

`analytics` envía **todas las dimensiones del periodo** en los props: el selector
de dimensión es de cliente, así que cambiarlo no debe costar una vuelta al
servidor. Envía también la fila de cierre del periodo, que es el denominador
global de los pesos simples y la fuente de las tarjetas de cabecera.

`?dia=` sustituye esas dos props por el corte acumulado de ese día, leído de
`crm_day_metrics`; sin él se envía el último corte calculado (en un mes cerrado,
el cierre). `dayMetrics` lleva solo la lista de días y cuál se está mirando, que
es lo que dibuja la barra.

**Aquí el día sí vuelve al servidor**, a diferencia de suscripciones: un corte de
CRM lleva el bloque completo de cada vendedor, sucursal y campaña, y mandar los
treinta y uno serían megabytes. La vuelta es una recarga parcial de Inertia que
lee una celda ya calculada — no recalcula nada.
