# Reporte Técnico-Funcional del Módulo CRM Analytics

## 1. Arquitectura General

El módulo CRM Analytics procesa datos exportados desde **Odoo CRM** para calcular métricas de gestión comercial. El flujo completo es:

```
CSV Odoo  →  Loader (carga)  →  Analyzer (cálculo)  →  JSONB (BD PostgreSQL)  →  API REST  →  Frontend (Dashboard / Results / Analytics)
```

### Tablas involucradas

| Tabla | Propósito |
|---|---|
| `crm_clients` | Datos maestros de oportunidades (una fila por oportunidad). |
| `crm_logs` | Trazabilidad de cambios de etapa (entradas de tiempo). |
| `crm_metricas_globales` | Singleton con columnas JSONB, una por métrica global. |
| `crm_dimensiones_historico` | Desglose de métricas por dimensión (JSONB). |

---

## 2. Carga de Datos (Loader)

Origen: archivo CSV plano exportado de Odoo con estructura columnar.

### Columnas principales del cliente

| Campo Odoo | Campo interno | Descripción |
|---|---|---|
| ID | `id` | Identificador único de la oportunidad |
| Cliente | `cliente` | Nombre del cliente |
| Cliente/Municipio | `cliente_municipio` | Municipio |
| Campaña | `campana` | Campaña de origen |
| Sucursal | `sucursal` | Sucursal responsable |
| Vendedor | `vendedor` | Vendedor asignado |
| Equipo de ventas | `equipo_ventas` | Equipo comercial |
| Etapa | `etapa` | Etapa actual (texto Odoo) |
| Motivo de pérdida | `motivo_perdida` | Razón si la oportunidad se perdió |
| Devolver oportunidad | `devolver_oportunidad` | Motivo si se devolvió desde Etapa 8 |
| Ganado | `ganado` | Estado final: `ganado`, `perdido`, `pendiente` |
| Activo | `activo` | Booleano indicando si está activo |
| Creado el | `creado_el` | Fecha de creación |
| Fecha de cierre | `fecha_cierre` | Fecha de cierre |
| Duración Total (horas) | `duracion_total_horas` | Horas totales desde creación hasta instalación |
| Entradas de Tiempo/* | Varias | Datos de trazabilidad por cambio de etapa |

### Mapeo de etapas (Odoo → canónico)

Cada etapa en Odoo (texto largo) se normaliza a una clave canónica:

| Texto Odoo | Clave canónica |
|---|---|
| 1. Contacto inicial... | `etapa_1_contacto` |
| 2. Recepción de datos... | `etapa_2_recepcion` |
| 3. Evaluación de factibilidad... | `etapa_3_factibilidad` |
| 4. Adecuaciones de Red Óptica | `etapa_4_adecuaciones` |
| 5. Gestión y Planificación... | `etapa_5_gpi` |
| 6. Asignado a contratistas | `etapa_6_contratistas` |
| 7. Clientes instalados | `etapa_7_instalados` |
| 8. Prospectos devueltos | `etapa_8_devueltos` |
| 9. Disponibles en otra fecha | `etapa_9_disponibles` |
| 10. Potenciales para proyectos | `etapa_10_proyectos` |
| Perdido | `perdido` |

### Proceso de carga

1. **TRUNCATE** de tablas `crm_clients` y `crm_logs` (carga completa, no incremental).
2. Lectura del CSV en chunks de 50,000 filas.
3. Separación: filas con `ID` no vacío → clientes; filas con `Entradas de Tiempo/ID` → logs.
4. Las etapas se normalizan a claves canónicas usando `ETAPA_MAP`.
5. El campo `ganado` se normaliza a minúsculas: `perdido`, `ganado` o `pendiente`.
6. COPY masivo a PostgreSQL.

---

## 3. Métricas Calculadas

### 3.1 Totals (`totals`)

**Cálculo**: Conteos simples sobre `crm_clients`.

| Campo | Fuente |
|---|---|
| `total_clientes` | `COUNT(*)` |
| `ganados` | `COUNT(*) WHERE ganado = 'ganado'` |
| `perdidos` | `COUNT(*) WHERE ganado = 'perdido'` |
| `etapa_8_count` | `COUNT(*) WHERE etapa_actual = 'etapa_8_devueltos'` |
| `etapa_7_count` | `COUNT(*) WHERE etapa_actual = 'etapa_7_instalados'` |

### 3.2 Tiempo de Instalación (`tiempo_instalacion`)

**Cálculo**: Solo clientes con `ganado = 'ganado'` y `duracion_total_horas` no nulo.

| Campo | Cálculo |
|---|---|
| `total_instalados` | `COUNT(*)` |
| `horas_promedio` | `AVG(duracion_total_horas)` |
| `horas_mediana` | `PERCENTILE_CONT(0.5)` |
| `horas_p25` | `PERCENTILE_CONT(0.25)` |
| `horas_p75` | `PERCENTILE_CONT(0.75)` |
| `horas_min` | `MIN(duracion_total_horas)` |
| `horas_max` | `MAX(duracion_total_horas)` |
| `horas_std` | `STDDEV(duracion_total_horas)` |

**Interpretación**: Mide el tiempo total desde creación de la oportunidad hasta que llega a `etapa_7_instalados`. No incluye oportunidades no ganadas ni datos nulos.

### 3.3 Tiempo por Etapa (`tiempo_por_etapa`)

**Cálculo**: Agrupación de logs por `etapa_anterior`, usando `duracion_horas` de cada entrada de tiempo. Se excluyen logs donde `etapa_anterior = 'etapa_7_instalados'`.

| Campo | Cálculo |
|---|---|
| `etapa` | Nombre de la etapa canónica |
| `total_movimientos` | Número de entradas de tiempo en esa etapa |
| `tiempo_promedio_horas` | Media de duración |
| `tiempo_mediana_horas` | Mediana |
| `tiempo_min_horas` | Mínimo |
| `tiempo_max_horas` | Máximo |
| `tiempo_std_horas` | Desviación estándar |

**Interpretación**: Mide cuánto tiempo permanecen los clientes en cada etapa del pipeline antes de avanzar. No se calcula para `etapa_7_instalados`.

### 3.4 Efectividad por Etapa (`efectividad`)

Es la métrica más compleja. Mide qué porcentaje de los movimientos hacia adelante desde una etapa terminan en éxito (instalación) vs fracaso (pérdida o devolución).

#### 3.4.1 Algoritmo base: Forward Cycle Classification

Por cada etapa de ventas (`etapa_3_factibilidad`, `etapa_4_adecuaciones`, `etapa_5_gpi`, `ventas`), se analizan los movimientos hacia adelante de cada cliente.

**Definiciones**:

- **Forward move**: Un log donde `etapa_anterior = etapa_origen` y `nueva_etapa` está en la lista `forward` de la etapa.
- **Terminal**: La siguiente ocurrencia en el historial del cliente de una etapa considerada terminal para esa regla.

**Clasificación de outcomes**:

| Outcome | Significado |
|---|---|
| `success` | El siguiente terminal del cliente fue `etapa_7_instalados`. |
| `failure` | El siguiente terminal fue `perdido`. |
| `return` | El siguiente terminal fue la misma etapa de origen (el cliente retrocedió y volvió a pasar). |
| `devuelto` | El siguiente terminal fue `etapa_8_devueltos`. |

#### 3.4.2 Reglas por Etapa (EFECTIVIDAD_REGLAS)

```
etapa_3_factibilidad:
  forward:  → etapa_4, etapa_5, etapa_6, etapa_7
  success:  siguiente terminal = etapa_7
  devuelto: siguiente terminal = etapa_8
  failure:  siguiente terminal = perdido
  return:   siguiente terminal = etapa_3 (retrocede y repite)

etapa_4_adecuaciones:
  forward:  → etapa_5, etapa_6, etapa_7
  success:  siguiente terminal = etapa_7
  devuelto: siguiente terminal = etapa_8
  failure:  siguiente terminal = perdido o etapa_3 (retroceso grave)
  return:   siguiente terminal = etapa_4

etapa_5_gpi:
  forward:  → etapa_6, etapa_7
  success:  siguiente terminal = etapa_7
  devuelto: siguiente terminal = etapa_8 o etapa_3 o etapa_4
  failure:  siguiente terminal = perdido
  return:   siguiente terminal = etapa_5

ventas:
  forward:  → etapa_4, etapa_5, etapa_6, etapa_7
  success:  siguiente terminal = etapa_7
  devuelto: siguiente terminal = etapa_8
  failure:  siguiente terminal = perdido
  return:   siguiente terminal = etapa_3
```

#### 3.4.3 Post-procesamiento: Atribución de Etapa 8

Los `devuelto` (etapa_8_devueltos) se redistribuyen como **fallas** a etapas específicas según el motivo (`devolver_oportunidad`) del cliente y la ruta que tomó. Configurado en `ETAPA8_ATRIBUCION`:

| Motivo | Etapa atribuida | Requiere forward hacia |
|---|---|---|
| "No es factible por posteadura" | `etapa_3_factibilidad` | `etapa_5_gpi` |
| "No es factible por estar fuera del área de cobertura" | `etapa_3_factibilidad` | `etapa_5_gpi` |
| "No factible por línea de vista" | `etapa_3_factibilidad` | `etapa_5_gpi` |
| (mismos 3 motivos) | `etapa_4_adecuaciones` | `etapa_5_gpi` |
| "No cuenta con el dinero..." | `etapa_5_gpi` | `etapa_6_contratistas` |
| "Se requieren permisos..." | `etapa_5_gpi` | `etapa_6_contratistas` |
| "No desea el servicio" | `etapa_5_gpi` | `etapa_6_contratistas` |
| "No está disponible aún..." | `etapa_5_gpi` | `etapa_6_contratistas` |
| "Tiene dudas..." | `etapa_5_gpi` | `etapa_6_contratistas` |
| "El Router no es compatible" | `etapa_5_gpi` | `etapa_6_contratistas` |
| "Cambio de titular..." | `etapa_5_gpi` | `etapa_6_contratistas` |

**Excepciones**: Motivos en `ETAPA8_EXCEPTION_MOTIVOS` NO atribuyen a ninguna etapa (no penalizan):
- "No es factible por tuberías/tanquillas obstruidas"
- "No responde llamadas y/o mensajes"
- "Cliente en espera del Router"
- "Cliente no atiende las llamadas..."
- "Cliente no contesta..."

**Clientes no atribuibles**: Si un cliente en etapa_8 no coincide con ninguna regla ni excepción, se atribuye a `ventas`.

#### 3.4.4 Post-procesamiento: Retornos a failure

Configurado en `RETORNO_ATRIBUCION`: ciertos retornos se reclasifican como fallas:

| Origen | Forward hacia | Efecto |
|---|---|---|
| `etapa_3_factibilidad` | `etapa_5_gpi` | return → failure |
| `etapa_4_adecuaciones` | `etapa_5_gpi` | return → failure |

#### 3.4.5 Fórmula final

```
total_salidas    = exitosos + fallidos + retornan + perdida_directa
efectividad_pct  = exitosos / total_salidas × 100
```

Donde:
- `exitosos` = forward moves cuyo terminal fue `etapa_7_instalados`
- `fallidos` = forward moves cuyo terminal fue `perdido` + retornos reclasificados + devueltos atribuidos
- `retornan` = forward moves cuyo terminal fue la misma etapa (que NO fueron reclasificados)
- `perdida_directa` = movimientos directos desde la etapa origen hacia `perdido` (sin pasar por forward)

### 3.5 Probabilidad Etapa 8 y Pérdida

#### 3.5.1 Probabilidad Etapa 8 (`etapa8`)

```
total_clientes = COUNT(*) en crm_clients
count_etapa8   = COUNT(DISTINCT clientes que han estado en etapa_8_devueltos alguna vez)
pct            = count_etapa8 / total_clientes × 100
```

**Interpretación**: Porcentaje de clientes que han pasado o están en etapa 8 (devolución). Incluye tanto clientes actualmente en etapa_8 como aquellos que pasaron por ella históricamente.

#### 3.5.2 Probabilidad Pérdida (`perdido`)

```
count_perdido = COUNT(*) WHERE ganado = 'perdido'
pct           = count_perdido / total_clientes × 100
```

**Interpretación**: Porcentaje de clientes cuyo estado final es "perdido".

### 3.6 Rescate de Perdidos (`rescate`)

**Cálculo**: De los clientes marcados como `ganado = 'perdido'`, cuántos tienen al menos un log hacia `etapa_7_instalados`.

```
total_perdidos = COUNT(*) WHERE ganado = 'perdido'
rescatados     = COUNT(DISTINCT client_id) de perdidos que luego fueron a etapa_7
pct_rescate    = rescatados / total_perdidos × 100
```

**Interpretación**: Porcentaje de clientes perdidos que lograron ser instalados después. Mide la efectividad de recuperación comercial/técnica.

---

## 4. Dimensiones

Las métricas se calculan también desglosadas por las siguientes dimensiones:

### Dimensiones estándar (aplican a todas las métricas)

| Dimensión | Columna en BD |
|---|---|
| `municipio` | `cliente_municipio` |
| `campana` | `campana` |
| `sucursal` | `sucursal` |
| `vendedor` | `vendedor` |
| `equipo_ventas` | `equipo_ventas` |

Para cada combinación (dimensión, valor), se ejecutan todos los cálculos de métricas (tiempo, efectividad, probabilidad, rescate) filtrando por ese valor.

### Dimensiones especiales (aplican a métricas específicas)

| Dimensión | Aplica a | Propósito |
|---|---|---|
| `devolver_oportunidad` | `etapa8` | Desglose de % Etapa 8 por motivo de devolución |
| `motivo_perdida` | `perdido`, `rescate` | Desglose de % pérdida y % rescate por motivo |

---

## 5. API REST

### 5.1 Endpoints compuestos (frontend legacy, datos aplanados)

| Endpoint | Descripción | Datos que retorna |
|---|---|---|
| `GET /crm/api/dashboard-data/` | Dashboard | Periodos con métricas aplanadas al formato original |
| `GET /crm/api/analytics-data/` | Analytics | Periodos + dimensiones aplanadas |
| `GET /crm/api/results/` | Lista de períodos | Arreglo de períodos con métricas |
| `GET /crm/api/results/completo/` | Detalle completo | Summary anidado + dimensions |
| `GET /crm/api/periods/` | Períodos disponibles | Solo nombres de período |

### 5.2 Endpoints por métrica global (JSONB puro)

| Endpoint | Retorna |
|---|---|
| `GET /crm/api/metricas/totals/` | `{total_clientes, ganados, perdidos, etapa_8_count, etapa_7_count}` |
| `GET /crm/api/metricas/tiempo-instalacion/` | `{horas_promedio, horas_mediana, horas_p25, horas_p75, horas_min, horas_max, horas_std, total_instalados}` |
| `GET /crm/api/metricas/tiempo-por-etapa/` | `{"etapa_1_contacto": {tiempo_promedio_horas, ...}, ...}` |
| `GET /crm/api/metricas/efectividad/` | `[{etapa, efectividad_pct, total_salidas, exitosos, fallidos, retornan, perdida_directa, ...}]` |
| `GET /crm/api/metricas/etapa8/` | `{pct, count_etapa8, total_clientes}` |
| `GET /crm/api/metricas/perdido/` | `{pct, count_perdido, total_clientes}` |
| `GET /crm/api/metricas/rescate/` | `{pct_rescate, total_perdidos, rescatados}` |
| `GET /crm/api/metricas/all/` | Objeto con todas las métricas anteriores |

### 5.3 Endpoints por dimensión (JSONB puro por métrica)

| Endpoint | Retorna |
|---|---|
| `GET /crm/api/dimensiones/totals/` | `[{dimension, valor, data: {total_clientes, ...}}]` |
| `GET /crm/api/dimensiones/tiempo-instalacion/` | `[{dimension, valor, data: {horas_promedio, ...}}]` |
| `GET /crm/api/dimensiones/tiempo-por-etapa/` | `[{dimension, valor, data: {etapa: {...}, ...}}]` |
| `GET /crm/api/dimensiones/efectividad/` | `[{dimension, valor, data: [{etapa, efectividad_pct, ...}]}]` |
| `GET /crm/api/dimensiones/etapa8/` | `[{dimension, valor, data: {pct, count_etapa8, ...}}]` |
| `GET /crm/api/dimensiones/perdido/` | `[{dimension, valor, data: {pct, count_perdido, ...}}]` |
| `GET /crm/api/dimensiones/rescate/` | `[{dimension, valor, data: {pct_rescate, ...}}]` |

### 5.4 Endpoints de acción

| Endpoint | Método | Descripción |
|---|---|---|
| `POST /crm/api/import-crm/` | POST | Importar CSV de Odoo (autenticado + rate‑limited) |
| `POST /crm/api/run-analysis/` | POST | Ejecutar análisis completo (autenticado + rate‑limited) |

### 5.5 Seguridad

- Todos los endpoints requieren autenticación (`@login_required`).
- Los endpoints de importación y análisis requieren rol `admin` o `analyst` (`@analyst_or_admin_required`).
- Los endpoints de escritura tienen rate‑limit de 10 requests por minuto por IP (`django‑ratelimit`).
- Las vistas HTML requieren autenticación; los endpoints JSON retornan `403` si el usuario no tiene permiso.

---

## 6. Escenarios y Casos Frontera

### 6.1 Sin datos
- Si no hay registros en `crm_clients`, todas las métricas retornan valores vacíos/cero.
- El frontend muestra "Sin datos" en cada componente.

### 6.2 Sin clientes ganados
- `tiempo_instalacion` retorna `{}` (no hay datos de duración).
- `efectividad` para `ventas` = 0 exitosos → `efectividad_pct = 0%`.
- `rescate`: sin perdidos → `total_perdidos = 0` → `pct_rescate = 0%`.

### 6.3 Sin clientes perdidos
- `perdido`: `count_perdido = 0` → `pct = 0%`.
- `rescate`: sin base de perdidos → `pct_rescate = 0%`.

### 6.4 Sin etapa_8
- `etapa8`: `count_etapa8 = 0` → `pct = 0%`.
- En efectividad, no hay devueltos que atribuir → no se penalizan etapas extra.

### 6.5 Division by zero
- Todas las divisiones usan `NULLIF(denominador, 0)` a nivel SQL o `if total > 0` en Python.
- Nunca se produce Infinity ni NaN en BD.

### 6.6 NaN/Inf en JSONB
- El helper `_clean_nan()` convierte `NaN` e `Inf` a `None` antes de serializar a JSON.
- El frontend recibe `null` y lo trata como 0 con `|| 0`.

### 6.7 Efectividad sin movimientos forward
- Si una etapa no tiene movimientos hacia adelante registrados:
  - `total_salidas = 0` → `efectividad_pct = 100%` (por convención: sin datos = 100%).
  - `exitosos`, `fallidos`, `retornan`, `perdida_directa` todos en 0.

### 6.8 Retorno sin terminal posterior
- Si un cliente hace forward move pero no tiene ningún terminal después en su historial:
  - `outcome = NaN` en el DataFrame → no cuenta como exitoso, fallido, retorno ni devuelto.
  - Simplemente se ignora.

### 6.9 Múltiples devoluciones (etapa_8)
- La atribución de etapa_8 analiza si el cliente estuvo en etapa_8 **alguna vez**. Si un cliente entra y sale múltiples veces, se cuenta solo una vez en `count_etapa8`.
- En efectividad, cada forward move que terminó en `devuelto` se penaliza por separado.

### 6.10 Rescate de perdidos
- Un cliente puede tener el estado `ganado = 'perdido'` pero tener logs posteriores a `etapa_7_instalados`. Esto ocurre cuando:
  - Se dio de baja administrativamente como pérdida pero luego se instaló.
  - El rescate es por cualquier medio (aunque el cliente siga marcado como perdido en la tabla de clientes).

### 6.11 Conflictos de dimensión: motivo_perdida vs devolver_oportunidad
- `motivo_perdida`: solo se usa para el desglose de `perdido` y `rescate`.
- `devolver_oportunidad`: solo se usa para el desglose de `etapa8` y para la atribución de etapa_8 en efectividad.
- Estos campos pueden coexistir en un mismo cliente (un cliente perdido también pudo haber tenido devolución).

---

## 7. Parámetros Editables (Configuración)

## 8. Persistencia en Base de Datos

### 8.1 Tabla global (singleton): `crm_metricas_globales`

Una sola fila (`id = 1`) con columnas JSONB. Cada columna almacena el resultado completo de una métrica como documento JSON.

| Columna | Tipo | Contenido |
|---|---|---|
| `id` | `INTEGER PK` | Siempre 1 (restringido por `CHECK (id = 1)`) |
| `totals` | `JSONB` | `{"total_clientes": N, "ganados": N, "perdidos": N, "etapa_8_count": N, "etapa_7_count": N}` |
| `tiempo_instalacion` | `JSONB` | `{"horas_promedio": N, "horas_mediana": N, "total_instalados": N, ...}` |
| `tiempo_por_etapa` | `JSONB` | `{"etapa_1_contacto": {"tiempo_promedio_horas": N, ...}, ...}` |
| `efectividad` | `JSONB` | `[{"etapa": "etapa_3_factibilidad", "efectividad_pct": N, ...}, ...]` |
| `etapa8` | `JSONB` | `{"pct": N, "count_etapa8": N, "total_clientes": N}` |
| `perdido` | `JSONB` | `{"pct": N, "count_perdido": N, "total_clientes": N}` |
| `rescate` | `JSONB` | `{"pct_rescate": N, "total_perdidos": N, "rescatados": N}` |

### 8.2 Tabla de dimensiones: `crm_dimensiones_historico`

Una fila por combinación (dimensión, valor), con las mismas columnas JSONB que la tabla global.

| Columna | Tipo | Contenido |
|---|---|---|
| `id` | `BIGSERIAL PK` | Auto‑incremental |
| `dimension` | `TEXT` | `municipio`, `campana`, `sucursal`, `vendedor`, `equipo_ventas`, `devolver_oportunidad`, `motivo_perdida` |
| `valor` | `TEXT` | El valor concreto de la dimensión |
| `totals`…`rescate` | `JSONB` | Mismas 7 columnas que la tabla global |

**Ventaja del esquema JSONB**: se eliminaron ~10 tablas intermedias que antes almacenaban cada métrica en columnas fijas. Ahora agregar una nueva métrica solo requiere añadir una columna JSONB; el frontend legacy se mantiene gracias a los getters compuestos que aplanan los datos al formato original.

---

## 9. Autenticación y Permisos

- **Login requerido**: todas las vistas y APIs del CRM exigen autenticación (`django.contrib.auth`).
- **Roles**: `admin` y `analyst` pueden importar CSV y ejecutar análisis; los usuarios estándar solo ven datos.
- **Login page**: `/login/` vista personalizada en `frontend.config`.
- **Setup inicial**: `/setup/` para crear el primer usuario administrador.
- **Rate limiting**: endpoints de importación y análisis limitados a 10 req/min/IP vía `django-ratelimit`.

---

## 10. Parámetros Editables (Configuración)

| Parámetro | Tipo | Descripción |
|---|---|---|
| `ETAPA_MAP` | Dict | Mapeo texto Odoo → clave canónica |
| `ETAPA_ORDER` | List | Orden de visualización de etapas |
| `DIMENSIONES` | List | Dimensiones estándar para desglose |
| `PROB_DIM_E8` | List | Dimensiones especiales para % Etapa 8 |
| `PROB_DIM_PERDIDOS_RESCATE` | List | Dimensiones especiales para % pérdida y rescate |
| `DIMENSION_COL_MAP` | Dict | Mapeo nombre dimensión → columna BD |
| `EFECTIVIDAD_REGLAS` | Dict | Reglas de clasificación por etapa |
| `ETAPA8_ATRIBUCION` | List[Dict] | Reglas de atribución de etapa_8 a etapas |
| `ETAPA8_EXCEPTION_MOTIVOS` | List | Motivos que NO penalizan ninguna etapa |
| `RETORNO_ATRIBUCION` | List[Dict] | Retornos que se reclasifican a falla |
| `GANADO_STATES` | Set | Estados válidos para `ganado` |
| `CSV_COLUMN_MAP` | Dict | Mapeo columnas CSV → campos internos |
| `METRICAS` | List | Lista de métricas disponibles |
