# Reporte Técnico-Funcional del Módulo Subscriptions

## 1. Arquitectura General

El módulo Subscriptions analiza datos de suscripciones para calcular tasas de **churn**, **reactivaciones (winback)**, **ARPU**, **cortes por impago** y **tiempos de vida** con curvas **Kaplan-Meier**. El flujo completo es:

```
CSV Suscripciones + CSV Logs  →  Importer (carga)  →  Analyzer (churn)  +  Lifetime (KM)  →  BD  →  API REST  →  Frontend
```

### Subsistemas

| Subsistema | Propósito |
|---|---|
| **Churn Analyzer** (`MetricsAnalyzer`) | Análisis mensual de churn, reactivaciones, ARPU, cortes. |
| **Lifetime Analyzer** | Curvas de supervivencia Kaplan-Meier globales y por dimensión. |
| **Importer** | Carga de CSV de suscripciones y logs a tablas base. |
| **Data API** | Capa de lectura para el frontend (thin views). |

### Tablas involucradas

| Tabla | Propósito |
|---|---|
| `Subscripciones` | Suscripciones consolidadas (una fila por orden). |
| `Subscripciones-b` | Datos detallados por línea de orden. |
| `Subscripciones-logs` | Historial de cambios de estado (versión 1). |
| `Subscripciones-logs-v15` | Historial de cambios de estado (versión 15 con tipo/categoría). |
| `analyzer_cierre_historico` | Métricas de cierre de churn por período. |
| `analyzer_activos_cierre` | Cartera de activos al cierre del período. |
| `analyzer_reactivaciones` | Reactivaciones identificadas en cada período. |
| `analyzer_bajas_detalladas` | Suscripciones que causaron baja en el período. |
| `analyzer_corte_impagado` | Suscripciones con corte por factura impaga. |
| `analyzer_inactivos_detallados` | Suscripciones inactivas al inicio del período. |
| `analyzer_churn_dimensiones` | Métricas desglosadas por dimensión. |
| `lifetime_periodos` | Periodos de vida activo/cancelado por suscriptor. |
| `lifetime_metricas` | Curvas KM globales y estadísticas. |
| `lifetime_dimensiones` | Curvas KM por dimensión. |

---

## 2. Carga de Datos (Importer)

### 2.1 Importación de Suscripciones

Origen: archivo CSV con una fila por línea de orden (detalle).

**Mapeo de columnas** (`SUBSCRIPTIONS_COLUMN_MAPPING`):

| Columna CSV | Campo interno |
|---|---|
| `Líneas de la orden/Referencia de la orden` | `Orden_Producto` |
| `Líneas de la orden/Producto` | `Producto` |
| `Líneas de la orden/Cliente` | `Cliente` |
| `Sucursal` | `Sucursal` |
| `Zona` | `Zona` |
| `Líneas de la orden/Cliente/Municipio` | `Municipio` |
| `Estado de la Suscripción` | `Estado` |
| `Campaña` | `campanna` |
| `Fecha de inicio` | `fecha_inicio` |
| `Subtotal` | `Total` |

**Proceso**:
1. Renombrado de columnas según mapeo.
2. Eliminación de filas con encabezado duplicado.
3. Limpieza de cadenas vacías → NaN.
4. Forward-fill de metadatos dentro de cada grupo de `Orden_Producto`.
5. Consolidación: una fila por orden usando el primer valor de metadata y el primer plan coincidente (validado contra `Planes.json`).
6. TRUNCATE de tablas `Subscripciones` y `Subscripciones-b` + COPY masivo.

### 2.2 Importación de Logs

Origen: archivo CSV de cambios de estado.

**Mapeo de columnas** (`LOGS_COLUMN_MAPPING`):

| Columna CSV | Campo interno |
|---|---|
| `Logs de Cambios/Suscripción` | `orden` |
| `Logs de Cambios/Fecha de Cambio` | `fecha_log` |
| `Logs de Cambios/Nota` | `log` |
| `Logs de Cambios/Estado Interno de Suscripción` | `estado` |

**Proceso**: Validación de columnas requeridas, limpieza, TRUNCATE de `Subscripciones-logs` + COPY masivo.

---

## 3. Pipeline de Análisis de Churn (MetricsAnalyzer)

### 3.1 Flujo General

```
1. load_data()           → Carga 3 tablas en paralelo (3 hilos)
2. build_clean_data()    → Normaliza columnas, combina logs v1 + v15
3. _apply_log_rules()    → Corrige anomalías (6 casos)
4. get_active_at(inicio) → Foto de activos al inicio del período
5. get_active_at(final)  → Foto de activos al final del período
6. Nuevos del período    → Suscripciones con f_ini dentro del rango
7. Inactivos al inicio   → Último estado antes del período
8. Reactivaciones        → Identificadas por texto o transición de estado
9. Corte impagado        → Eventos de "corte automatico por factura impaga"
10. Cálculo de KPIs      → Churn neto/bruto, winback, ARPU, aporte, reemplazo
11. Dimensiones          → Desglose por zona, sucursal, municipio, campaña, producto
12. Persistencia         → save_historico() a tablas de salida
```

### 3.2 Limpieza y Normalización (cleaner.py)

- Columnas de suscripciones se pasan a minúsculas.
- `orden_producto` → `orden`, `fecha_inicio` → `f_ini`, `f_ini_dt` (datetime).
- `Estado` se normaliza mediante `SUBS_STATE_TO_LOG_MAP`:

| Texto Odoo | Estado interno |
|---|---|
| `en progreso` | `3_progress` |
| `cancelado` | `6_churn` |
| `en pausa` | `4_paused` |
| `mas de 30 dias suspendidos` | `8_30days` |
| `cotizacion`, `instalacion` | `0_other` (excluido) |

- Logs v1 y v15 se combinan en un solo DataFrame con columnas: `orden`, `f_dt`, `estado`, `log_norm`, `estado_origen`.

### 3.3 Reglas de Anomalías (rules.py)

Se corrigen 6 casos de inconsistencia entre logs y estado real de la suscripción:

| Caso | Problema | Solución |
|---|---|---|
| **1** | Suscripción sin logs en ninguna versión | Se crea un log sintético con estado `3_progress` en su `f_ini_dt` (excepto si es `0_other`). |
| **2** | Último log es inactivo, pero la suscripción está activa | Se inserta un log sintético activo 1 segundo después. |
| **3** | (no implementado explícitamente) | — |
| **4** | Último log es activo, pero la suscripción está inactiva (no `0_other`) | Se inserta un log sintético con el estado real de la suscripción 1 segundo después. |
| **5** | Primer log registrado es un corte por impago | Se inserta un log sintético activo en `f_ini_dt` antes del corte. |
| **6** | Log inactivo seguido inmediatamente de un corte por impago | Se inserta un log sintético activo 1 segundo después del log inactivo (antes del corte). |

### 3.4 Fotos de Cartera (Activos)

```python
get_active_at(target_date, strictly_before=False)
```

- Filtra logs con `f_dt < target_date` (strict) o `f_dt <= target_date`.
- Toma el último log de cada orden.
- Retorna solo órdenes cuyo último estado es `3_progress`.

**Variables resultantes**:

| Variable | Origen |
|---|---|
| `act_ini` | `get_active_at(fecha_inicio, strictly_before=True)` |
| `act_fin` | `get_active_at(fecha_final)` |
| `nuevos` | Suscripciones con `f_ini_dt` dentro del período Y con al menos un log activo |
| `set_ini`, `set_fin`, `set_nue` | Conjuntos de IDs de las anteriores |

### 3.5 Inactivos al Inicio

Se toma el último log **antes** de `fecha_inicio` para cada orden. Si el estado está en `INACTIVE_STATES` (`4_paused`, `6_churn`, `8_30days`), se considera inactivo.

```
total_inactivos = len(df_inactivos)
```

### 3.6 Reactivaciones

Se identifican mediante dos mecanismos combinados:

1. **Texto**: Logs cuyo `log_norm` contiene "reactivacion".
2. **Transición de estado**: Logs donde `estado_origen ∈ VALID_REACT_ORIGINS` y `estado = '3_progress'`.

**Filtros adicionales**:
- Deben ocurrir dentro del período (`[fecha_inicio, fecha_final]`).
- Se deduplica por orden, priorizando el origen más severo: `6_churn > 8_30days > 4_paused`.
- Se excluyen órdenes que son nuevas en el período.
- Solo cuentan si la orden está **activa al cierre** (`act_fin`).

**Segmentación por origen**:

| Origen | Descripción |
|---|---|
| `6_churn` | Reactivación desde cancelado |
| `8_30days` | Reactivación desde suspendido >30 días |
| `4_paused` | Reactivación desde pausa |
| `reactivacion_sin_origen` | Detectada por texto pero sin origen conocido |

**Reglas de segmentación**:
- `6_churn` y `8_30days`: solo cuentan si la orden **no** estaba en `set_ini` (son históricas).
- `4_paused`: se divide en:
  - `react_4_P`: orden estaba en `set_ini` (pausa dentro del mismo período).
  - `react_4_H`: orden no estaba en `set_ini` (histórica).
- `reactivacion_sin_origen`: solo histórica (no en `set_ini`), se suma a `6_churn`.

```
n_react_val = react_6_churn + react_8_30days + react_4_H
```

### 3.7 Corte por Factura Impaga

Se identifican logs cuyo `log_norm` contiene el texto exacto: `"corte automatico por factura impaga"`.

- Se deduplica por `(orden, minuto)`.
- Se filtran solo los del período.

### 3.8 Cálculo de Bajas

```
sobrevivientes    = activos_final - nuevos
bajas_fin_netas   = activos_inicio - sobrevivientes
bajas_netas       = max(0, len(act_ini) - (len(act_fin) - len(set_nue)))

reactivos_fuera   = reactivaciones donde orden ∉ set_ini
bajas_brutas      = bajas_netas + reactivos_fuera
```

### 3.9 Fórmulas de KPIs

| Métrica | Fórmula | Descripción |
|---|---|---|
| **Churn Neto (Financiero)** | `bajas_netas / activos_inicio × 100` | % de base inicial que se perdió neto. |
| **Churn Bruto (Auditoría)** | `bajas_brutas / activos_inicio × 100` | % de base inicial que se perdió bruto (incluye reemplazos). |
| **ARPU** | `total_billing / activos_final` | Ingreso promedio por suscriptor activo. |
| **Total Billing** | `sum(Total)` de suscriptores en `act_fin` | Facturación total de la cartera activa. |
| **Tasa Winback** | `reactivaciones_unicas / total_inactivos × 100` | % de inactivos que regresaron. |
| **Tasa Aporte Reactivaciones** | `react_val / (nuevos + react_val) × 100` | Qué % del crecimiento vino de reactivaciones. |
| **Índice Reemplazo Reactivaciones** | `react_val / bajas_netas × 100` | Qué % de las bajas fueron reemplazadas por reactivaciones. |
| **Adiciones Brutas** | `(nuevos + react_not_in_ini) - bajas_netas` | Crecimiento bruto. |
| **Adiciones Netas** | `nuevos - bajas_netas` | Crecimiento neto. |
| **Corte Impagado** | `len(set_corte_impagado)` | Conteo absoluto de cortes. |
| **% Suspensiones** | `corte_impagado / activos_inicio × 100` | % de base inicial afectada por corte. |

### 3.10 Dimensiones (Churn)

Se calculan los mismos KPIs desglosados por 5 dimensiones:

| Dimensión | Columna en BD |
|---|---|
| `zona` | `Zona` |
| `sucursal` | `Sucursal` |
| `municipio` | `Municipio` |
| `campana` | `campanna` |
| `producto` | `Producto` |

Para cada combinación (dimensión, valor), se asignan las órdenes de cada conjunto (`act_ini`, `act_fin`, `nuevos`, `bajas`, etc.) a su valor de dimensión mediante un mapa de suscripción → valor, usando `"Sin {dim}"` como default.

---

## 4. Pipeline de Análisis de Tiempos de Vida (Lifetime)

### 4.1 Flujo General

```
1. load_data()                    → Carga suscripciones y logs
2. build_clean_logs()             → Normaliza y combina logs v1 + v15
3. build_lifecycle_periods()      → Construye periodos activo/cancelado por orden
4. compute_metrics()              → Curvas KM globales + estadísticas
5. compute_dimension_metrics()    → Curvas KM por dimensión
6. Persistencia                   → lifetime_periodos, lifetime_metricas, lifetime_dimensiones
```

### 4.2 Construcción de Periodos de Vida

Algoritmo que recorre el historial de logs de cada orden y genera segmentos de tipo `activo` o `cancelado`:

- **Inicio**: `f_ini_dt` de la suscripción.
- **Transición activo → cancelado**: cuando el estado cambia de `3_progress` a `INACTIVE_STATES`.
- **Transición cancelado → activo**: cuando el estado cambia de `INACTIVE_STATES` a `3_progress`.
- **Censura**: el último periodo (activo o cancelado) se censura al final del timeline global si no tiene un evento de cierre.

Cada periodo tiene:
- `orden`, `tipo` (`activo`/`cancelado`), `f_inicio`, `f_fin`, `duracion` (días), `evento` (1 = evento completo, 0 = censurado), `periodo_idx`.

### 4.3 Curvas Kaplan-Meier

Se utiliza `lifelines.KaplanMeierFitter` para calcular la función de supervivencia.

**Entrada**:
- `durations`: vector de duraciones en días.
- `events`: vector booleano (1 = evento ocurrió, 0 = censurado).

**Salida**:

| Campo | Descripción |
|---|---|
| `curva` | `[{tiempo, sup, ci_low, ci_high, n_riesgo, n_eventos}]` |
| `mediana` | Día donde `S(t) ≤ 0.50` |
| `p25` | Día donde `S(t) ≤ 0.75` |
| `p75` | Día donde `S(t) ≤ 0.25` |
| `n_total` | Número total de sujetos |
| `n_evento` | Número de eventos no censurados |
| `n_censurado` | Número de sujetos censurados |

**Intervalos de confianza**: Fórmula de Greenwood (implementada por lifelines).

### 4.4 Curva Activo (Vida Activa)

Se toma el **primer periodo activo** de cada orden. Evento = la orden pasó a inactivo (churn). Censura = la orden sigue activa al final del timeline.

### 4.5 Curva Reactivación (Tiempo en Cancelado)

Se toman los periodos cancelados con `duracion ≥ 15` días y `evento = 1` (la orden se reactivó). Evento = la orden se reactivó. Censura = la orden sigue cancelada al final.

### 4.6 Métricas Adicionales

| Métrica | Descripción |
|---|---|
| `promedio_activo` | Media de duración del primer periodo activo |
| `promedio_reactivacion` | Media de duración en cancelado antes de reactivar |
| `ciclos_por_suscriptor` | `{min, max, mediana, promedio}` de ciclos activo por orden |
| `suscriptores_nunca_inactivos` | Órdenes que nunca tuvieron un periodo cancelado |
| `suscriptores_totales` | Total de órdenes analizadas |

### 4.7 Dimensiones (Lifetime)

Mismas 5 dimensiones que churn (`Zona`, `Sucursal`, `Municipio`, `campanna`, `Producto`). Para cada valor de dimensión se calculan curvas KM completas (activo + reactivación) con sus estadísticas.

---

## 5. API REST

### 5.1 Endpoints de Churn

| Endpoint | Descripción |
|---|---|
| `GET /subscriptions/api/dashboard-data/` | Períodos con todas las métricas de churn |
| `GET /subscriptions/api/analytics-data/?periods=...` | Períodos + dimensiones (filtro opcional) |
| `GET /subscriptions/api/periods/` | Lista de períodos disponibles |
| `GET /subscriptions/api/results/` | Lista de resultados de churn |
| `GET /subscriptions/api/results/<periodo>/` | Detalle de un período + dimensiones |
| `POST /subscriptions/api/run-analysis/` | Ejecutar análisis de churn (rate‑limited) |
| `POST /subscriptions/api/import-subscriptions/` | Importar CSV de suscripciones (rate‑limited) |
| `POST /subscriptions/api/import-logs/` | Importar CSV de logs (rate‑limited) |

### 5.2 Endpoints de Lifetime

| Endpoint | Descripción |
|---|---|
| `GET /subscriptions/api/survival-data/?dim=...` | Curvas KM globales + por dimensión |
| `POST /subscriptions/api/lifecycle/run/` | Ejecutar análisis de ciclo de vida |
| `GET /subscriptions/api/lifecycle/results/` | Resultados del análisis de ciclo de vida |

### 5.3 Seguridad

- Todos los endpoints requieren `@login_required`.
- Importación y análisis requieren rol `admin` o `analyst`.
- Endpoints de escritura tienen rate‑limit de 10 req/min/IP.

---

## 6. Parámetros Editables (Configuración)

Los siguientes parámetros están definidos en `backend/config.py` y pueden modificarse:

| Parámetro | Tipo | Descripción |
|---|---|---|
| `ACTIVE_STATE` | `str = "3_progress"` | Estado que identifica una suscripción activa |
| `INACTIVE_STATES` | `set` | `{"4_paused", "6_churn", "8_30days"}` |
| `VALID_REACT_ORIGINS` | `set` | Orígenes válidos para reactivación |
| `CORTE_IMPAGADO_EVENT` | `str` | Texto exacto del evento de corte |
| `EXCLUDED_STATE` | `str = "0_other"` | Estado excluido del análisis |
| `SUBS_STATE_TO_LOG_MAP` | `dict` | Mapeo texto Odoo → estado interno |
| `DB_SCHEMA` | `str` | Esquema de base de datos |
| `DATE_FORMATS` | `list` | Formatos de fecha para parseo |

---

## 7. Casos Frontera

### 7.1 Sin datos
- Si no hay suscripciones o logs, `get_active_at` retorna DataFrame vacío → todos los KPIs en 0.
- Si no hay lifetime data, la API retorna curvas vacías y stats null.

### 7.2 Sin activos al inicio
- `churn_neto_pct = 0`, `churn_bruto_pct = 0`, `porcentaje_suspensiones = 0`.
- `tasa_winback_pct = 0` (división por 0).

### 7.3 Sin activos al final
- `ARPU = 0.0` (división por 0).

### 7.4 Sin nuevos en el período
- `tasa_aporte_react_pct = 100%` (denominador = `react_val` solo).
- `adiciones_netas = -bajas_netas`.

### 7.5 Sin bajas netas
- `indice_reemplazo_react_pct = 0` (división por 0).
- `adiciones_brutas = nuevos + react_not_in_ini`.

### 7.6 Sin inactivos al inicio
- `tasa_winback_pct = 0` (división por 0).

### 7.7 Sin reactivaciones
- `react_6_churn = react_8_30days = 0`.
- `react_val = 0`.
- `tasa_aporte_react_pct = 0%`.

### 7.8 Datos incompletos en logs
- El cleaner asigna `0_other` como estado por defecto si no hay columna `Estado` en suscripciones.
- Logs sin `f_dt` válida se eliminan (`dropna`).
- Logs sin orden válida se eliminan.

### 7.9 Anomalías de logs (6 casos)
- Ver sección 3.3. Si no se aplicaran, órdenes sin logs o con logs inconsistentes quedarían excluidas del análisis activo.

### 7.10 Kaplan-Meier con pocos datos
- Si `n < 2` o `eventos = 0`, la función retorna `mediana = None`, `curva = []`.
- Esto evita errores de lifelines con muestras insuficientes.

### 7.11 Kaplan-Meier: censura total
- Si ninguna orden experimentó el evento, todas se censuran → `mediana = None`.
- La curva muestra la función de supervivencia plana en 1.0.

### 7.12 Duplicados en reactivaciones
- Se prioriza el origen más severo (`6_churn > 8_30days > 4_paused`).
- Una orden solo cuenta una vez como reactivación por período.

### 7.13 Corte impagado sin logs de corte
- Si no hay texto exacto "corte automatico por factura impaga" en ningún log, `corte_impagado = 0`.
- Sensible a cambios en la redacción del log.

### 7.14 Dimensiones sin datos
- Cuando una dimensión no existe en la tabla `Subscripciones`, se omite completamente.
- Para valores sin asignación, se usa el default `"Sin {dimensión}"`.

### 7.15 Tiempo de reactivación mínimo (lifetime)
- Las duraciones de cancelado menores a 15 días se excluyen del análisis de reactivación por considerarse ruido.

---

## 8. Notas Técnicas

- La importación hace **TRUNCATE + COPY** (carga completa, no incremental).
- El análisis de churn es **por período mensual** (requiere selección de mes).
- El análisis de lifetime es **global** (sobre todo el histórico).
- Los datos duplicados por período se evitan vía `DELETE + INSERT` en `save_historico()`.
- Las curvas KM se serializan como JSON para almacenamiento eficiente en columnas texto.
- Las reactivaciones solo cuentan si la suscripción está **activa al cierre del período**.
- `react_6_8` = `react_6_churn + react_8_30days` (excluye `4_paused`).
- Los logs v1 y v15 se fusionan; v15 tiene prioridad donde hay superposición.
