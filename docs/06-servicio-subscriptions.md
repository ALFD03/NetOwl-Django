# 06 · `services/subscriptions/` — churn, ciclo de vida, ETA y catálogos

El dominio mayor (~5 300 líneas). Es el único que crece por encima del esquema
`loader → dimensions → analyzer → queries`.

```
services/subscriptions/
├── analytics/
│   ├── config.py           Constantes del dominio y cabeceras obligatorias
│   ├── imports.py          Importación de suscripciones y de logs
│   ├── free_plans.py       Detección e importación de planes gratuitos
│   ├── analyzer/           El análisis mensual de churn
│   │   ├── loader.py       Lectura paralela de las cuatro tablas
│   │   ├── cleaner.py      Normalización y unión de los dos formatos de log
│   │   ├── rules.py        Logs sintéticos y tramo gratuito
│   │   ├── metrics_calc.py Estado a una fecha, reactivaciones, cortes
│   │   ├── dimensions.py   Desglose por las seis dimensiones
│   │   └── analyzer.py     `MetricsAnalyzer`: orquesta, calcula y persiste
│   ├── day_metrics.py      El corte acumulado de cada día del mes
│   ├── lifetime/           Supervivencia Kaplan-Meier (pipeline aparte)
│   ├── eta_report.py       El reporte de la reguladora
│   └── queries.py          Lectura de resultados + Sales Report + Business Units
├── models.py               Los catálogos de referencia (tablas en `public`)
├── views.py                Dashboard, analytics, results, lifetime, reportes
├── views_eta.py            Las vistas del reporte ETA
├── views_catalogos.py      La pantalla de catálogos y su CRUD
├── urls.py
└── management/commands/cargar_catalogos.py
```

---

## 1. Importación (`analytics/imports.py`)

Dos entradas independientes: el export de **suscripciones** y el de **logs**.

### `import_subscriptions_csv(ruta)`

1. Lee con `dtype=str`, `keep_default_na=False`, `encoding="utf-8-sig"`.
2. Renombra con `SUBS_COLUMN_MAPPING` + `SUBS_ACTIVO_ALIASES` (Odoo no siempre
   exporta `Activo` con la misma capitalización).
3. Descarta las filas en las que se repite la cabecera y las columnas que no
   estén en el mapa.
4. `_blank_to_nan` — convierte en `NaN` las celdas vacías o de solo espacios,
   **columna a columna**. La versión anterior usaba `DataFrame.apply`, que
   entrega Series completas y no celdas, así que nunca convertía nada: sin esto
   el `ffill` por orden no rellena, el `dropna` no descarta las líneas sin
   referencia y `groupby.first` se queda con la cadena vacía.
5. Descarta las líneas sin referencia de orden: no pertenecen a ninguna
   suscripción y agrupadas formarían una fila fantasma.
6. `ffill` de los metadatos por orden y consolidación con `groupby(...).agg()`.
7. **El producto de la orden lo elige `_first_matching_plan`**: el export trae
   varias líneas por orden (el plan, el router, la instalación) y se queda con
   la primera que esté en `nombres_reconocidos()`.
8. **`_verificar_catalogo(df_local)` — antes de crear, truncar o copiar nada.**
9. Crea las tablas si faltan, añade las columnas nuevas
   (`ADD COLUMN IF NOT EXISTS`), hace `TRUNCATE` y carga con `COPY`:
   - `subscriptions-b` ← el detalle línea a línea.
   - `subscriptions` ← una fila por orden.

Devuelve el número de órdenes consolidadas.

### La verificación de catálogo

```
¿hay algún plan en el catálogo?            no → CatalogoVacio
para cada orden con líneas de producto:
    ¿alguna línea está en nombres_reconocidos()?   sí → correcta
    ¿el resto están en productos_ignorados()?      sí → no cuenta
    en otro caso                                   → candidata
si hay candidatas → ProductosSinCatalogo(productos, órdenes)
```

- Se comprueba **antes del `TRUNCATE`**: si levanta, no se escribió nada y la
  tabla anterior sigue intacta.
- **Una orden sin ninguna línea de producto no se reporta**: no hay nombre que
  registrar, así que pasa como antes.
- Antes, cuando ninguna línea estaba catalogada, la orden se guardaba **sin
  producto**, y la pérdida no se notaba hasta meses después, en el reporte de la
  reguladora.
- `ProductosSinCatalogo` lleva encima lo que el cliente necesita para resolverlo
  sin volver a subir el fichero a ciegas: qué productos son y cuántas órdenes
  arrastra cada uno.

La pantalla que lo recibe ofrece **las dos respuestas** por producto, porque la
comprobación no puede distinguir un plan nuevo de una línea que nunca lo será:

- **Crear plan** → `/subscriptions/config/?nuevo_plan=<nombre>`, que abre el
  formulario ya relleno.
- **Ignorar** → registra el nombre en `ProductoIgnorado`.

Un nombre ignorado deja de contar como candidato en las dos comprobaciones
(`_verificar_catalogo` y `productos_fuera_de_catalogo`), que es lo que evita que
routers, instalaciones y servicios puntuales bloqueen cada importación para
siempre. Es una pestaña aparte del catálogo para poder deshacer la decisión.

> No confundir con `Plan.declarar_en_eta`: eso es un plan real excluido del
> reporte de la reguladora, que sigue contando como plan en todas partes.

### `productos_fuera_de_catalogo()`

Mira lo **ya importado** que hoy no está en el catálogo. La importación
garantiza que toda orden entra con un plan catalogado, pero un plan se puede
borrar después, y los datos cargados antes de que la comprobación existiera
pueden no tener ninguno. Lo llama el análisis mensual **antes de los minutos de
cálculo** y la pantalla de catálogos, que lo usa como primera pestaña.

### `import_logs_csv(ruta)`

Mucho más simple: renombra, exige las cuatro columnas (`orden`, `fecha_log`,
`log`, `estado`), limpia, `TRUNCATE` y `COPY` sobre `subscriptions-logs`.

---

## 2. Planes gratuitos (`analytics/free_plans.py`)

El cálculo normal marca a un cliente como gratuito por su log «Suscripción
archivada». El problema es que **muchas suscripciones nunca recibieron ese log
en Odoo**, así que no hay forma de fecharlas desde los logs.

Este módulo consume el export de planes gratuitos (que además trae la mensajería
del *chatter*) e infiere, para cada suscripción sin log, cuándo dejó de ser un
cliente de pago. El resultado queda como semilla en `subscriptions_gratis`, y el
análisis lo usa **solo cuando la suscripción no trae el log real: el log siempre
manda**. Así no hay que reprocesar este CSV en cada cálculo.

### La cascada de evidencias

| # | Método | Evidencia | Confianza |
|---|---|---|---|
| 1 | `log_archivada` | Log «Suscripción archivada»: fecha exacta del evento | alta |
| 2 | `cambio_tarifa` | Mensaje «Cambio de Tarifa: X → … Gratis» | alta |
| 3 | `factura_cero` | Primer intento de facturación con importe cero: **cota superior** | media |
| 4 | `facturacion_detenida` | La próxima fecha de factura quedó congelada en el pasado: el cron dejó de procesarla. **Cota superior** | media |
| 5 | `sin_evidencia` | Ninguna señal: gratuita desde su fecha de inicio | baja |

Detalles:

- `_eventos_estado` construye la línea de tiempo de entradas y salidas del
  servicio gratuito, y se queda con **la última entrada no revertida**.
- Un cambio entre dos tarifas gratuitas no mueve el estado.
- De las dos cotas superiores (3 y 4) se toma **la más antigua**.
- La fecha resultante nunca puede ser anterior a la de inicio: *nunca puede ser
  gratuita antes de existir*. Se guarda también `fecha_evidencia`, la fecha
  cruda antes de ese recorte.

`import_gratis_csv` reconstruye la tabla entera (`DROP` + `CREATE` + `COPY`):
es propia y siempre se rehace desde el CSV. `summarize_detection` da el resumen
por método y confianza para revisión humana.

---

## 3. El análisis mensual de churn (`analytics/analyzer/`)

### 3.1 `loader.py`

Lee **en paralelo** (cuatro hilos) `subscriptions`, `subscriptions-logs`,
`subscriptions-logs-v15` y la tabla de gratuitos. La columna `activo` solo se
pide si existe en la tabla (`information_schema`), porque solo la traen los
exports nuevos.

### 3.2 `cleaner.py`

- `parse_archivado(serie)` — deriva la marca de archivado de la columna
  `activo`. **Un valor fuera de los dos vocabularios conocidos NO se asume
  archivado**: eso sacaría clientes de pago de la base activa sin dejar rastro.
  Se avisa por consola (el log del cálculo lo recoge) y se cuenta como activo.
- `_normalize_string_series` — normaliza mapeando **solo los valores únicos**,
  que es lo que lo hace rápido sobre cientos de miles de filas.
- `build_clean_data` — normaliza suscripciones y **une los dos formatos de log**
  (`subscriptions-logs` y `subscriptions-logs-v15`, donde la categoría
  *En progreso*/*Cerrado* se traduce a `3_progress`/`6_churn`). Deja el frame
  **ordenado por `["orden", "f_dt"]`** y calcula `estado_origen` con un `shift(1)`
  por orden.

> **Invariante crítica: el frame de logs llega ordenado por `["orden", "f_dt"]`.**
> De ella dependen `last_log_per_orden` y `EstadoAcumulado`. Cambiar esa
> ordenación rompe las dos.

### 3.3 `rules.py` — logs sintéticos

Odoo no deja un log para todo, así que se fabrican los que faltan. Cada uno se
marca con `_sintetico = True` y una nota que lo identifica.

| Caso | Situación | Log que se inserta |
|---|---|---|
| 1 | La suscripción no tiene ningún log | Uno con su estado actual en su fecha de inicio. Se excluyen las de estado `0_other` y las que nunca fueron de pago |
| 2 | Último log inactivo pero la suscripción está activa | Activo, un segundo después |
| 4 | Último log activo pero la suscripción está inactiva | El estado de la suscripción, un segundo después |
| 5 | **El primer log es un corte por impago** | Activo, en su fecha de inicio: para cortarla tuvo que haber estado activa |
| 6 | Log inactivo seguido inmediatamente de un corte por impago | Activo entre los dos, un segundo después |
| — | Archivada sin log de archivado | Paso a gratuito, fechado con la detección de `subscriptions_gratis` y, a falta de esa, con su fecha de inicio |

Después, `apply_archived_overlay` marca como `9_free` **todo el tramo** entre
«Suscripción archivada» y «Suscripción desarchivada»: el cliente deja de contar
como activo sin convertirse en baja, y al desarchivarse vuelve a activo. Se
aplica sobre el histórico ya consolidado (sintéticos incluidos) para que ningún
log posterior lo saque del estado. *(«desarchivada» contiene «archivada», por
eso se descarta primero.)*

`_ordenes_siempre_gratis` identifica a las archivadas que **nunca llegaron a ser
clientes de pago**: no deben nacer como activas ni contarse como altas.

### 3.4 `metrics_calc.py` — el estado a una fecha

| Símbolo | Qué es |
|---|---|
| `last_log_per_orden(df)` | El último log de cada suscripción. Toma `tail(1)`, **no `idxmax`**: varios logs pueden compartir el mismo segundo (un cambio de plan deja «Plan change», «Suspensión TV» y el sintético a la vez) e `idxmax` devuelve la primera del empate |
| `get_state_at(df, fecha, estado, strictly_before)` | **La definición de referencia**: filtra el histórico y reagrupa. Correcta, pero cara |
| `EstadoAcumulado` | La misma respuesta recorriendo el log **una sola vez** |
| `react_candidates(df)` | Logs que podrían ser reactivación, sin filtrar por fecha |
| `corte_candidates(df)` | Cortes por impago, deduplicados por orden y minuto |
| `get_reactivations(...)` | Las reactivaciones del periodo, ya filtradas |
| `get_corte_impagado(...)` | Los cortes del periodo |

#### `EstadoAcumulado`, la optimización central

`get_state_at` filtra el histórico entero y lo reagrupa por orden. El análisis de
un mes pregunta **dos veces por cada uno de los 31 días** (activos y gratuitos),
así que el log completo se recorría 62 veces y ahí se iba la mayor parte del
tiempo.

Aquí el recorrido es acumulativo: **el estado del día N es el del día N−1 más
los logs que caen entre medias**. Para una serie de fechas crecientes —que es
justo como avanza `build_day_metrics`— cada fila se toca una sola vez.

El resultado es **idéntico**, no una aproximación, y la razón es la invariante de
ordenación: dentro de una suscripción la posición en el frame crece con la
fecha, así que «el último log hasta la fecha» es siempre «la posición más alta
de esa orden entre las filas que ya entraron». El recorrido usa
`np.argsort(kind="stable")`, que conserva el orden del frame entre filas de la
misma fecha y con él el desempate histórico.

Un retroceso (`corte < cursor`) rehace el recorrido desde cero. Ocurre una vez
por ejecución, cuando el cierre del mes se calcula antes que los días: sigue
siendo **una** pasada frente a las 62 de antes.

#### Qué cuenta como reactivación

Un log cuenta si **el texto contiene «reactivacion»** o si **viene de un estado
inactivo y pasa a activo** (`VALID_REACT_ORIGINS`). Después se filtra:

- Solo dentro del periodo.
- Una por orden, con prioridad de origen `6_churn` > `8_30days` > `4_paused`.
- **Se excluyen las suscripciones nuevas del periodo**: un alta no es una
  reactivación.
- Solo las que siguen activas al cierre.
- Las de origen desconocido con texto de reactivación se marcan como
  `reactivacion_sin_origen`.

### 3.5 `dimensions.py`

`prepare_subs_dims()` normaliza el frame una vez y devuelve un objeto
`DimsPreparadas` que cachea, por dimensión, el mapa `orden → valor` y la
facturación como número. Nada de eso depende del periodo, y reconstruirlo dentro
del bucle diario suponía **186 recorridos** (6 dimensiones × 31 días) de la tabla
de suscripciones para obtener siempre lo mismo.

`aggregate_dimensions(...)` produce, por cada dimensión y cada valor, la misma
batería de métricas que el resumen global (activos inicio/final, nuevos, bajas,
crecimiento, churn neto y bruto, reactivaciones por origen, inactivos, cortes,
facturación, ARPU, gratuitos…). Con `persist=False` devuelve las filas sin
escribir: así lo usa el cálculo diario.

La facturación por valor se agrega **en una sola pasada**; antes se remapeaba
`act_fin` entero dentro del bucle de valores, lo que lo hacía O(valores × órdenes)
y dominaba el tiempo del cálculo.

### 3.6 `analyzer.py` — `MetricsAnalyzer`

```python
analyzer = MetricsAnalyzer(db, periodo)
analyzer.run()          # load_data → build_clean_data → _apply_log_rules → persist(_compute(periodo))
```

`_prepare_caches()` precalcula todo lo que no depende del periodo: candidatos de
reactivación y de corte, el frame de dimensiones y el `EstadoAcumulado`. Además
cachea el estado **al inicio** del periodo (idéntico en los 31 cortes del mes) y
los inactivos al inicio. El estado al cierre **no** se cachea: cambia cada día y
guardarlo solo gastaría memoria.

`_compute(periodo)` calcula **sin escribir**, lo que permite recorrer los 31 días
reutilizando una única carga de datos. `persist(c)` escribe el resultado.

#### Las fórmulas

```
sobrevivientes = activos_final − nuevos
bajas_idx      = activos_inicio − sobrevivientes − gratuitos_final
bajas_netas    = |act_ini| − (|act_fin| − |nuevos| − gratuitos_retornados) − gratuitos_nuevos
bajas_brutas   = bajas_netas + reactivaciones_que_no_estaban_al_inicio

churn_neto_pct  = bajas_netas  / activos_inicio × 100
churn_bruto_pct = bajas_brutas / activos_inicio × 100
crecimiento     = (activos_final − activos_inicio) / activos_inicio × 100
arpu            = facturación_de_los_activos_finales / activos_final
tasa_winback    = reactivaciones / inactivos_al_inicio × 100
tasa_aporte_react     = react_val / (nuevos + react_val) × 100
indice_reemplazo_react = react_val / bajas_brutas × 100
adiciones_netas   = nuevos − bajas_brutas
adiciones_brutas  = (nuevos + react_no_en_inicio) − bajas_brutas
```

Reactivaciones, desglosadas por origen:

- `react_4_P` — venía de pausa **y ya estaba** en la base al inicio.
- `react_4_H` — venía de pausa y **no** estaba.
- `react_6_churn`, `react_8_30days` — solo las que no estaban al inicio. Las de
  origen desconocido se suman a `react_6_churn`.
- `react_val = react_6_churn + react_8_30days + react_4_H` — las que realmente
  **añaden** base.
- `reactivaciones = react_val + react_4_P`.

Clientes gratuitos: **ni activos ni bajas**. `gratuitos_nuevos` son los que
salieron hacia el servicio gratuito en el periodo y `gratuitos_retornados` los
desarchivados, que vuelven a la base sin ser altas ni reactivaciones.

#### Qué persiste

| Tabla | Contenido |
|---|---|
| `analyzer_cierre_historico` | Una fila con el resumen del periodo |
| `analyzer_activos_cierre` | `orden`, `f_dt`, `estado` de los activos al cierre |
| `analyzer_reactivaciones` | Las reactivaciones con su origen |
| `analyzer_bajas_detalladas` | `orden`, `f_ini_dt`, `estado` |
| `analyzer_corte_impagado` | `orden`, `fecha_corte`, `motivo_corte` |
| `analyzer_clientes_gratuitos` | `orden`, `fecha_archivado`, `estado` |
| `analyzer_inactivos_detallados` | `orden`, `fecha_evento`, `estado_inactivo` |
| `analyzer_churn_dimensiones` | Una fila por dimensión y valor |

---

## 4. Métricas diarias (`analytics/day_metrics.py`)

Una fila por mes en `analyzer_day_metrics`:

```
periodo_reporte | activos_inicio | dia1 | dia2 | … | dia31
```

Cada `diaN` es un JSON con el **corte acumulado del mes hasta ese día**:

```json
{
  "global":      { …el mismo resumen que el cierre, sin la clave periodo… },
  "dimensiones": [ …lista plana de zona_sucursal… ],
  "dims":        { "zona": [...], "sucursal": [...], "municipio": [...],
                   "campanna": [...], "producto": [...] }
}
```

El objetivo es que **una sola lectura de fila entregue el mes completo**, de modo
que mover la barra de días sea puramente de cliente y no dispare ningún
recálculo. `dimensiones` se mantiene como lista plana de `zona_sucursal` (la
forma que ya leen Sales Report y Business Units) y `dims` agrupa las dimensiones
del selector de Analytics.

`build_day_metrics(mes, db, hasta_dia, analyzer, progreso)`:

- **No calcula días futuros** del mes en curso.
- `analyzer` permite reaprovechar uno que ya tenga los datos cargados (el del
  análisis mensual): un solo botón hace **una sola lectura** para el cierre y
  para los 31 días.
- Vuelca a la base **cada 5 días** (`FLUSH_CADA_N_DIAS`): como el *upsert* solo
  toca los días enviados, si la ejecución se corta el trabajo hecho queda
  guardado.
- `progreso(hechos, total, etiqueta)` se llama al cerrar cada día: es la única
  parte del análisis con pasos contables, y es la que mueve la barra.

Lectura: `get_day_metrics(mes)` y `get_periodos_con_dias()`. Ambas comprueban
antes con `to_regclass` que la tabla exista —un entorno donde nunca terminó un
análisis no la tiene, y eso no es un error.

---

## 5. Ciclo de vida (`analytics/lifetime/`)

Pipeline independiente, con su propio cargador, que usa `lifelines`. Se lanza
aparte (`can_run_lifetime`) y **no tiene periodo**: recorre todo el histórico.

| Módulo | Contenido |
|---|---|
| `loader.py` | Lee suscripciones y los dos formatos de log; `build_clean_logs` los une y ordena |
| `lifecycle.py` | `build_lifecycle_periods` y `compute_metrics` |
| `km_utils.py` | `compute_km`: ajusta Kaplan-Meier y devuelve curva, mediana, p25, p75 y conteos |
| `dimensions.py` | Las mismas curvas por valor de dimensión |
| `runner.py` | `run_lifecycle_analysis()`: orquesta y persiste |
| `queries.py` | Lectura y composición del payload de la página |

### `build_lifecycle_periods`

Recorre los logs relevantes (activo + inactivos) por suscripción y emite
**periodos**:

- `tipo="activo"` — desde el alta o desde la última reactivación hasta que cae a
  un estado inactivo. `evento=1` si terminó; `evento=0` si sigue viva
  (**censurada**, medida contra la fecha máxima del histórico).
- `tipo="cancelado"` — desde que cae inactiva hasta que vuelve a activo.
  `evento=1` si volvió; `evento=0` si sigue inactiva.

Las fechas se convierten a días flotantes desde 1970 antes del bucle y se
reconvierten al final: el bucle es entonces aritmética pura.

### Métricas

- **Vida activa**: Kaplan-Meier sobre el **primer** periodo activo de cada
  suscriptor. Mediana, promedio, p25, p75, censurados.
- **Reactivación**: KM sobre los periodos cancelados con `evento=1` **y duración
  ≥ 15 días**, para no contar como reactivación un rebote administrativo.
- `ciclos_por_suscriptor` (mín, máx, mediana, promedio) y el número de
  suscriptores que nunca estuvieron inactivos.

Por dimensión se exige una cohorte mínima de **15** (`MIN_COHORT_SIZE`) y se
desactivan los intervalos de confianza de Greenwood: ahorra la mayor parte del
coste estadístico en grupos que no se leen.

Se persiste en `lifetime_periodos`, `lifetime_metricas` y `lifetime_dimensiones`
con `periodo="global"` y `metodo="lifetime"`.

`get_survival_report(dim)` compone el payload de la página: curva global, sus
estadísticos —incluidas **tasa de censura** y **tiempo máximo**, que se calculan
aquí porque son parte de la métrica y no del transporte HTTP— y, si se pide, las
curvas por dimensión. `DIMENSION_ALIASES` traduce el nombre de la interfaz
(`campana`) al de la columna (`campanna`) y evita filtrar hacia la base un valor
arbitrario de la query string.

---

## 6. El reporte ETA (`analytics/eta_report.py`)

Las matrices que se declaran a la reguladora, calculadas sobre **los activos al
cierre de un mes**.

### `ETAReportManager`

| Método | Qué hace |
|---|---|
| `calculate_eta_report(periodo, force_recalc=False)` | Calcula (o devuelve el guardado si el periodo está bloqueado) |
| `get_lock_status` / `set_lock_status` | Bloqueo del periodo |
| `save_sub_individual_config` / `delete_sub_individual_config` | Excepciones por orden |
| `get_configured_individual_subs` | Las excepciones ya guardadas |
| `get_discovered_unmapped_plans` / `_subs` | Lo que falta por parametrizar |
| `get_all_known_plans` | Para el desplegable del formulario |
| `get_config_page_data(periodo)` | Todo lo que necesita la pantalla de parametrización |
| `get_tasa_bcv` / `set_tasa_bcv` | La tasa del periodo y de dónde salió |
| `asegurar_tasa_bcv(periodo)` | La consulta al BCV **solo si no hay ninguna guardada**. No propaga el fallo |
| `consultar_tasa_bcv(periodo)` | Fuerza la consulta y pisa lo guardado. Deja subir `TasaNoDisponible` |

### El cálculo

1. Toma los `orden` distintos de `analyzer_activos_cierre` del periodo. Si la
   tabla no existe (entorno recién estrenado) devuelve `status: "empty"`, que no
   es un fallo.
2. Cruza con `subscriptions` (deduplicada por orden) para el producto, cliente,
   zona y sucursal; para los que no tengan producto ahí, respalda con
   `subscriptions-b`.
3. Resuelve la clasificación de cada suscripción con esta prioridad:
   **excepción individual → plan del catálogo → descarte**.
4. Lo que no resuelve sale como `status: "unmapped_elements"` con dos listas:
   `unmapped_plans` (planes sin clasificar) y `unmapped_subs` (órdenes sin
   producto, o de tipo dedicado/transporte/L2, que se gestionan una a una).
5. Normaliza a los dos vocabularios de la reguladora: `TECH_MAP` colapsa la
   tecnología a **Alámbrico / Inalámbrico** y `PERSONA_MAP` a **Persona Natural
   / Persona Jurídica**.
6. Produce las matrices: totales de internet por tecnología, persona, estado y
   todos sus cruces; las de TV; el conteo de transporte de datos; y la
   penetración de velocidades en seis rangos (`256 Kbps–2 Mbps`, …, `1 Gbps en
   adelante`).
7. Arma además los **formularios** (`analytics/eta_forms.py`): una fila por
   producto declarado, en tres hojas.
8. Guarda el JSON en `analyzer_eta_reporte_mensual` **salvo que el periodo esté
   bloqueado**. La tasa del BCV se guarda en su propia columna, fuera de ese
   JSON.

### Los formularios (`analytics/eta_forms.py`)

Las matrices responden a «cuántos suscriptores hay por tecnología, persona y
entidad». Los formularios preguntan otra cosa: **una fila por producto
declarado**, con su velocidad, su renta y su consumo teórico. Son tres hojas
—internet, transporte de datos y televisión—, cada una con sus columnas, y se
descargan en un solo `.xlsx` desde la barra del reporte.

**De dónde sale cada fila.** Un plan del catálogo comercial se declara por su
**plan regulador** (`Plan.plan_regulador` → `catalogo_planes_reguladores`).
Varios planes comerciales colapsan en uno: la misma velocidad con dos tarifas es
un solo producto ante la reguladora, y declararla dos veces cuenta sus
suscriptores dos veces. El regulador lleva **sus propios** campos y no los hereda
del primer plan que le cuelgue: cuando dos planes del grupo difieren en precio o
velocidad, lo declarado tiene que ser una decisión explícita.

El internet dedicado y el transporte no están en el catálogo comercial —cada
contrato tiene su velocidad y su tarifa— así que su fila se **sintetiza**
agrupando las excepciones por orden que comparten velocidad: `Internet Dedicado
10 Mbps`, `Transporte de Datos 100 Mbps`. Su renta es el promedio de la columna
`precio` de esas excepciones. Registrar un plan regulador con ese mismo nombre
lo sustituye: es la forma de corregir a mano la renta o la tecnología de un
grupo entero.

Un plan **sin plan regulador asignado** sigue contando en las matrices pero no
aparece en el formulario; sale en `planes_sin_regulador` y el botón de exportar
lo avisa.

**Los precios viajan en divisa, sin convertir.** La renta básica en bolívares es
el precio por la tasa del BCV, y la tasa se aplica **al exportar**: así un
periodo bloqueado no queda congelado a la tasa que hubiera el día del cálculo, y
corregir la tasa no obliga a recalcular el mes.

### La tasa del BCV (`analytics/bcv.py`)

Se consulta a `ve.dolarapi.com/v1/historicos/dolares/oficial/{YYYY/MM/DD}`, que
sirve el histórico del dólar oficial. De la respuesta se lee **`promedio`**:
`compra` y `venta` llegan a `null` en el histórico.

**Se pide el día 1 del mes del reporte, pero ese día no siempre existe.** El BCV
no publica fines de semana ni feriados y la API responde **404**: entre 2025 y
2026 son ocho de veinticuatro meses, un tercio. Por eso no se pide una fecha
sino que se **avanza hasta el primer día publicado del mes**, con un tope de
siete días y sin salirse del mes. El día que respondió se guarda en
`tasa_fuente` —«BCV 2026-08-03 (ve.dolarapi.com)»— para que nadie se pregunte
por qué la tasa de agosto es del día 3.

**Se sale a la red una vez por periodo, no una por visita.** `asegurar_tasa_bcv`
solo consulta cuando no hay nada guardado: la tasa del primer día publicado de
un mes pasado ya no cambia. Eso hace, además, que una tasa escrita a mano no se
pise sola; para volver a la oficial está el botón de consultar, que llama a
`consultar_tasa_bcv`.

**Un fallo del servicio no rompe el reporte.** `asegurar_tasa_bcv` devuelve el
motivo como aviso en vez de propagarlo, y las rentas salen vacías, que es lo
mismo que pasaba antes de que hubiera consulta automática. El aviso se enseña
bajo la barra del reporte: si no, una tasa ausente parece una tasa de cero.

#### La tasa vigente, al lado de la del mes

`consultar_tasa_actual()` pregunta por `ve.dolarapi.com/v1/dolares/oficial`, que
devuelve la **última tasa publicada** sin pedir fecha, y la sirve
`GET api/eta-report/tasa/actual/` (`can_view_eta`, 10/m). Es otra pregunta que
la del mes: aquella es la que fija la declaración —el primer día publicado del
periodo— y esta es la que vale hoy.

**No se guarda en ninguna parte.** Cambia cada día, así que escribirla en
`analyzer_eta_reporte_mensual` solo serviría para pisar la tasa con la que se
declaró. Vive en la pantalla: el reporte la consulta una vez al abrirse —no una
por periodo hojeado, porque no depende del mes que se mire— y el botón de
recargar está para la página que lleva horas abierta.

**Al exportar se elige con cuál se convierte la renta.** El botón de
exportación es una cápsula partida —la misma que los filtros de la barra— con
la acción a la izquierda y un selector a la derecha: la tasa del mes por
defecto, la que se declara, o la de hoy, que responde a cuánto costaría hoy ese
mismo parque. Van juntos porque son la misma decisión, qué libro sale; en dos
controles sueltos parecían dos exportaciones distintas. Las filas son las mismas;
solo cambian las columnas en bolívares, y el archivo exportado a la tasa
vigente lleva «(tasa de hoy)» en el nombre para no confundirse con el que se
declaró. Si la consulta falló, el selector queda deshabilitado y lo dice: elegir una
tasa que no se pudo leer exportaría rentas vacías sin avisar, y esconder el
control haría cambiar de forma a la barra según responda un tercero.

Las fórmulas que pide la reguladora, y que están en `eta_forms.py`:

| Columna | Fórmula |
|---|---|
| Uplink / Downlink (Kbps) | `Mbps × 1000` |
| Velocidad promedio teórica (Kbps) | `Mbps × 0,5 × 1000` si es RF; `Mbps × 0,2 × 1000` si es FTTH |
| Promedio de consumo del plan (MB) | `((Mbps × 1000) / 8000) × 3600 × 24 × 90 × suscriptores` |
| Renta básica (Bs. sin IVA) | `precio × tasa_bcv`; vacía si la tasa no está fijada |

### El catálogo es el único sitio donde se clasifica un plan

El maestro de ETA llevaba una segunda copia —con prioridad— de tecnología,
persona, TV y Mbps en `analyzer_eta_config_planes`: el mismo plan podía estar
clasificado de dos formas y ganaba la que nadie miraba. **Esa capa ya no
existe**; la tabla sigue en la base de datos, vacía y sin leer.

Lo único que aportaba y el JSON no tenía es `Plan.declarar_en_eta`, que hoy es un
campo del catálogo.

El maestro conserva **solo sus excepciones por suscripción**
(`analyzer_eta_config_subs_individual`), que son genuinamente de cada contrato y
no tienen equivalente en el catálogo. La pestaña «planes por clasificar» sigue
existiendo —es donde se descubren los productos sin clasificar— pero **enlaza al
catálogo en vez de editar nada**.

Sus dos tablas son `DataTable`, como las del catálogo: búsqueda, orden y filtros
por columna. La de excepciones guardadas muestra la **renta** de cada contrato,
con un filtro «con renta / sin renta» — es el único sitio donde se ve que a un
dedicado le falta el precio con el que declararlo.

`es_transporte` / `es_dedicado` se derivan del nombre del plan
(`PLAN_TRANSPORTE`, `PLAN_DEDICADO`): son dos planes concretos, no un atributo
que se marque por plan.

`Cancelado` entra en el mapa de planes con una clasificación vacía. No está en el
catálogo —no es un producto contratable— pero lo llevan miles de suscripciones
que siguen apareciendo en un cierre; dejarlo fuera las convertiría en planes sin
clasificar y bloquearía el reporte entero.

---

## 7. Lectura de resultados (`analytics/queries.py`)

| Función | Devuelve |
|---|---|
| `get_cierre_churn(periodos=None)` | Las filas de `analyzer_cierre_historico`, tipadas y ordenadas de más reciente a más antigua |
| `get_dimensiones(periodos=None)` | `{periodo, dimensiones: {dim: [valores]}}` |
| `get_periodos()` | Las etiquetas de periodo disponibles |
| `get_dashboard_data()` / `get_analytics_data(periodos)` | Composiciones de las anteriores |
| `get_zonas_config()` | Mapa de zonas + `siteOrder` para que el cliente reagrupe sin ir al servidor |
| `get_sales_report_data(periodo, dia)` | Site → Tecnología → Nodos, con subtotales |
| `get_business_units_data(periodo, dia)` | Coordinador → Nodos, más el resumen FTTH global y el bloque RF |
| `calculate_aggregation_totals(nodos)` | Suma los absolutos y **recalcula** los porcentajes |
| `get_site_sort_index(site)` | Posición en el orden comercial del catálogo; lo desconocido va al final |

Dos detalles que importan:

- **`calculate_aggregation_totals` no promedia promedios.** Suma los valores
  absolutos y recalcula crecimiento y churn sobre esas sumas.
- **`_dimension_df(db, periodo, dia)`** es lo que hace que la barra de días
  funcione en los dos reportes: con `dia` la fuente es la fila precalculada de
  `analyzer_day_metrics`, una sola lectura, sin recalcular nada del pipeline;
  sin `dia`, la dimensión `zona_sucursal` del cierre del mes.

Una zona que no esté en el catálogo se agrupa en «Otros / Desconocido» con la
tecnología por defecto, en vez de perderse.

---

## 8. Los catálogos de referencia (`models.py`, `views_catalogos.py`)

### Los modelos

**Viven en `public`, sin cualificar con `DB_SCHEMA`**, igual que `auth_user`: el
catálogo comercial es uno por empresa, y darle a cada entorno el suyo solo
produce divergencias silenciosas.

| Modelo | Tabla | Notas |
|---|---|---|
| `Estado` | `catalogo_estados` | Entidad federal de una zona |
| `Site` | `catalogo_sites` | Sede regional. **`orden` no es decorativo**: es el orden comercial de presentación, antes la constante `CUSTOM_SITE_ORDER` |
| `Coordinador` | `catalogo_coordinadores` | Responsable comercial (reporte Business Units) |
| `Zona` | `catalogo_zonas` | Nodo de red. `site` y `estado` con `PROTECT`, `coordinador` con `SET_NULL` |
| `Plan` | `catalogo_planes` | Producto contratable |
| `ProductoIgnorado` | `catalogo_productos_ignorados` | Línea del export que nunca será un plan |

Sobre `Plan`:

- **El nombre no es único a propósito**: el catálogo original traía el mismo plan
  dos veces cuando cambiaba de tarifa (los de Puerto Cabello tienen otra
  velocidad de referencia). La pareja `(nombre, tarifa)` sí lo es.
- `ordering = ["nombre", "tarifa"]` importa: cuando dos filas comparten nombre,
  los consumidores construyen un mapa por nombre y **gana la última**. Ordenar
  por tarifa deja ganar a la variante con tarifa propia, que es la que ganaba en
  `Planes.json` por venir después en el fichero.
- `to_fixture()` emite los valores **como texto**, porque así los leía el JSON y
  así los convierten los consumidores.

Vocabulario de tecnologías: **son dos y solo dos** (`FTTH`, `RF`). Ante la
reguladora eso se colapsa a alámbrico o inalámbrico.

### La pantalla y su CRUD

`views_catalogos.py` sirve **todos los catálogos con un solo par de endpoints** en vez
de doce vistas casi iguales: lo único que cambia entre ellos es qué campos se
leen del cuerpo y cómo se serializa la fila, y eso lo declara el diccionario
`CATALOGOS`. Añadir un catálogo es añadir una entrada ahí y una pestaña en la
interfaz.

**Dos permisos, uno por mitad.** Cada entrada de `CATALOGOS` declara su
`permiso`: `can_manage_catalogo_comercial` para zonas, sites, estados y
coordinadores (cómo se reparte la red entre los equipos de venta), y
`can_manage_catalogo_operacional` para planes, planes reguladores e ignorados (y
la pestaña de productos por registrar). Los
mantienen equipos distintos, y las dos mitades no se referencian entre sí, así
que cada formulario se completa con lo que su permiso ya envía. La página abre
con cualquiera de los dos y solo envía las filas del que se tiene; los endpoints
de escritura comprueban el permiso del `tipo` concreto y responden **403** si es
de la otra mitad. La migración `config/0006` renombró el antiguo
`can_manage_catalogos` a comercial y copió su valor al operacional, así que nadie
perdió acceso con el cambio. Aquella migración nombró las dos mitades al revés;
`config/0007` intercambia los valores guardados para que cada cuenta conserve las
mismas pestañas con el nombre correcto.

- `GET /subscriptions/config/` — la página. Acepta `?nuevo_plan=<nombre>`, que
  abre el formulario de plan ya relleno; es a donde lleva el aviso de la
  importación. Incluye `pendientes` (lo ya importado que no está en el catálogo),
  y si esa consulta falla no rompe la página.
- `POST api/catalogos/guardar/` — alta o edición. Valida con `_texto`,
  `_numero`, `_opcion` y `_relacion`, que levantan `DatosInvalidos` → 400. Un
  duplicado responde **409**.
- `POST api/catalogos/eliminar/` — baja. Un site, estado o coordinador **con
  zonas colgando no se borra**: la zona los referencia con `PROTECT` y se
  responde 409 explicando cuál es el estorbo, en vez de un 500.

**Toda escritura llama a `fixtures.reset_cache()`.** Sin eso, una edición
tardaría hasta un minuto en verse, o no se vería nunca en el proceso que ya la
tenía leída (el worker es otro proceso).

### Los objetivos comerciales

La meta de crecimiento y el churn máximo **no alteran ningún análisis**: solo
deciden la meta y el cumplimiento de cada fila; el color lo pone aparte el
semáforo, con umbrales fijos. Por eso
no se guardan con las métricas calculadas ni exigen relanzar nada: viven en tres
tablas del catálogo (`ObjetivoComercial`, `ObjetivoMes`, `SemaforoObjetivos`),
`analytics/objetivos.get_objetivos_config()` los sirve en los props de
Dashboard, Analytics, Results, Sales Report y Business Units, y el cliente los
aplica al pintar (`web/src/features/subscriptions/lib/objetivos.ts`). Cambiar un
objetivo se ve al recargar la página. Si las tablas no existen (entorno sin
migrar), se sirve el 6% / 3% de siempre en vez de tumbar la página.

- **El general es uno solo y sin fecha** (restricción `objetivo_general_sin_fecha`):
  es el valor por defecto de la empresa y rige en todos los meses sin excepción,
  pasados incluidos. Para cambiar un mes concreto está `ObjetivoMes`, que lo
  sustituye solo en ese mes.
- **Vigencia por entidad.** Los tramos de zona, coordinador, site y estado valen
  desde su `desde` (`YYYY-MM`, nulo = siempre) hasta el siguiente de la misma
  entidad: cambiarlos no reescribe los meses que ya pasaron.
- **Manda el nivel más alto que tenga objetivo.** De más alto a más bajo:
  sucursal → estado → site → coordinador → zona → zona-sucursal (el nodo), con el
  general del mes como respaldo. El objetivo de un nivel solo rige si nada por
  encima fija uno: con la zona al 10% y su coordinador al 15%, la zona cumple
  contra el 15%; una sucursal al 8% manda sobre toda la geografía de sus nodos.
  La pestaña de objetivos avisa en «Rige hoy» en qué nodos queda anulado cada uno.
- **Sucursal y nodo.** La sucursal (`NETCOM`, `NYC`...) no es un catálogo: es el
  texto del export y se guarda en `ObjetivoComercial.sucursal`. Un nodo es su
  zona (clave ajena) más ese texto, y se cruza con la clave `"Zona - Sucursal"`
  de la dimensión `zona_sucursal`. Las que se ofrecen al elegir salen de
  `objetivos.nodos_conocidos()`, los nodos de los cierres calculados.
- **Los totales ignoran los niveles por debajo del grupo.** El de un coordinador
  mira coordinador, site, estado y sucursal (la excepción de una zona o de un
  nodo no lo mueve); el de un site mira site, estado y sucursal (ni el
  coordinador ni la zona lo mueven, porque un site reparte sus zonas entre varios
  coordinadores). Los totales globales —Analytics, Results, Dashboard,
  consolidado FTTH y bloque RF— usan el general del mes.
- **Un grupo tiene meta, no tasa**: la suma de la meta de cada zona resuelta
  desde el nivel del grupo. Si el grupo tiene objetivo propio eso es su base ×
  su tasa; si no, cada zona aporta la de su site o su estado.
- **Crecimiento y churn se resuelven por separado.** Un tramo puede fijar solo
  uno; dentro de una entidad gana su tramo más reciente que fije esa métrica, y
  entre niveles manda el más alto que la fije.
- **El semáforo tiene umbrales fijos**, iguales en todo el módulo y sin relación
  con el objetivo de la fila: crecimiento verde desde `crec_verde` y amarillo
  desde `crec_amarillo`; churn verde hasta `churn_verde` y amarillo hasta
  `churn_amarillo`; cumplimiento (% de la meta) verde desde `cumpl_verde`. Así el
  mismo porcentaje se pinta igual en Analytics, Results, el Dashboard y los
  reportes. Empezaron siendo distancias al objetivo; `subscriptions/0005` los
  convirtió a valores directos conservando los colores que se veían.

**En los reportes solo se ven.** En la tabla de nodos de Sales Report y Business
Units el objetivo es una insignia con el porcentaje, la meta y el nivel del que
sale, y junto al botón de exportar bajas de cada site o coordinador está el
objetivo de ese grupo. Editarlos es cosa del catálogo y de nadie más.

Se editan en la pestaña **Objetivos** del catálogo, con el permiso comercial:
el general y el semáforo como métricas (el semáforo dibujado como una barra
rojo/amarillo/verde), las excepciones por mes y los tramos por entidad como
tablas. El general no se puede borrar: es el que responde cuando nadie más lo
hace.

### `manage.py cargar_catalogos`

Siembra las tablas desde `data/Planes.json` y `data/Zonas.json`. **Es lo único
que sigue leyendo esos ficheros.** Idempotente: lo que ya existe no se toca
salvo que se pase `--actualizar`, para no pisar con el fichero una corrección
hecha desde la web.

- Los nombres de coordinador del fichero traen espacios sobrantes; se recortan,
  lo que los funde en un solo coordinador (es lo que la agrupación ya hacía).
- `Cancelado` no se siembra: no es un producto contratable.
- Al terminar llama a `reset_cache()`.

---

## 9. Vistas

### `views.py`

| Ruta | Página | Permiso |
|---|---|---|
| `/subscriptions/` y `/dashboard/` | `Subscriptions/Dashboard` | `can_view_subscriptions` |
| `/analytics/` | `Subscriptions/Analytics` | `can_view_subs_analytics` |
| `/results/` y `/results/<periodo>/` | `Subscriptions/Results` | `can_view_subs_results` |
| `/lifetime/` | `Subscriptions/Lifetime` | `can_view_subs_lifetime` |
| `/sales-report/` | `Subscriptions/SalesReport` | `can_view_subs_sales` |
| `/business-units/` | `Subscriptions/BusinessUnits` | `can_view_subs_sales` |

`analytics`, `sales_report` y `business_units` envían además `dayMetrics` (el mes
completo) en los props: **seleccionar un día es una lectura de cliente**.
`lifetime` blinda los datos a `{}` para que un fallo de lectura no reviente la
página.

`api_lifecycle_run` encola el análisis con `lanzar_analisis(request,
'subs_lifetime', requiere_periodo=False)`; se sigue con los endpoints de
`imports`, que son comunes a todos los módulos.

### `views_eta.py`

Ocho de las veintisiete vistas del módulo eran de ETA —casi la mitad del
archivo— y forman un bloque cerrado, así que viven aparte.

| Ruta | Qué hace | Permiso |
|---|---|---|
| `/eta-report/` | Calcula y renderiza el reporte | `can_view_eta` |
| `/eta-report/config/` | La pantalla de parametrización | `can_manage_eta` |
| `GET api/eta-report/data/` | Recarga sin refrescar; `?force=true` recalcula | `can_view_eta` |
| `POST api/eta-report/lock/` | Bloquea o desbloquea un periodo (al bloquear, recalcula y congela) | `can_manage_eta` |
| `POST api/eta-report/save-sub-config/` | Guarda una excepción individual | `can_manage_eta` |
| `POST api/eta-report/delete-sub-config/` | La borra | `can_manage_eta` |
