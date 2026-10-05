# 10 · Modelo de datos

Una única base de datos PostgreSQL, con **un esquema por entorno**
(`DB_SCHEMA`). Conviven tres familias de tablas:

| Familia | Quién la crea | Dónde vive |
|---|---|---|
| **ORM de Django** | Migraciones (`migrate`, por esquema) | `DB_SCHEMA` |
| **DDL explícito** | `ensure_*_schema` / `_ensure_tables_exist` en el código analítico | `DB_SCHEMA` |
| **Dinámicas** | `DBConnector.save_historico` / `copy_dataframe` sobre la marcha | `DB_SCHEMA` |

> **Las tablas dinámicas tienen todas sus columnas de tipo `text`.** Los lectores
> convierten explícitamente (`int(row.get(...) or 0)`). Una métrica nueva
> aparece sin migración: `save_historico` hace `ADD COLUMN IF NOT EXISTS`.

El catálogo canónico de nombres es `TableNames` en `core/config.py`. Todo el
código lo usa; **no se escriben literales de nombre de tabla**.

---

## 1. Tablas del ORM

Todas viven en el esquema del entorno (`DB_SCHEMA`): la conexión fija
`search_path` a él y nada se comparte a través de `public`.

### Usuarios, permisos y catálogos

| Tabla | Modelo | Contenido |
|---|---|---|
| `auth_user` | Django | Cuentas |
| `config_profile` | `services.config.Profile` | Rol, grupo y matriz de permisos por usuario |
| `config_permissiongroup` | `services.config.PermissionGroup` | Plantillas de permisos reutilizables |
| `catalogo_estados` | `Estado` | Entidad federal |
| `catalogo_sites` | `Site` | Sede regional + `orden` comercial |
| `catalogo_coordinadores` | `Coordinador` | Responsable comercial |
| `catalogo_zonas` | `Zona` | Nodo de red: site, estado, tecnología, coordinador |
| `catalogo_planes` | `Plan` | Producto contratable; único por `(nombre, tarifa)`. `plan_regulador` (FK, nullable) dice con qué fila se declara |
| `catalogo_planes_reguladores` | `PlanRegulador` | Producto **declarado** a la reguladora: nombre, tecnología, persona, Mbps, precio, TV y `es_transporte`. Varios planes comerciales colapsan en uno |
| `catalogo_productos_ignorados` | `ProductoIgnorado` | Líneas del export que nunca serán un plan |
| `catalogo_objetivos` | `ObjetivoComercial` | Objetivos por nivel (general, sucursal, estado, site, coordinador, zona, zona-sucursal); `sucursal` es el texto del export en los niveles que la usan: `desde` (`YYYY-MM`, nulo = siempre; el general es una sola fila y siempre nulo), `crecimiento_pct` y `churn_pct` (nulo = se hereda). Lo escribe la pestaña Objetivos del catálogo; lo lee `analytics/objetivos.py` y lo aplica el cliente |
| `catalogo_objetivos_mes` | `ObjetivoMes` | Excepción de un mes concreto al objetivo general |
| `catalogo_objetivos_semaforo` | `SemaforoObjetivos` | Fila única con los umbrales de color, fijos: crecimiento y cumplimiento "verde desde", churn "verde hasta" |
| `catalogo_departamentos` | `Departamento` | Área a la que pertenece un usuario de soporte |
| `catalogo_usuarios_soporte` | `UsuarioSoporte` | Directorio de soporte: `nombre_odoo` (el literal exacto del export, con el sufijo `(User)`), nombre, apellido, departamento vigente (FK obligatoria, `PROTECT`), `fecha_ingreso` y `fecha_egreso` (la baja: no se borra a nadie) |
| `catalogo_usuarios_soporte_historial` | `HistorialDepartamento` | Departamentos por los que ha pasado cada usuario: `desde` (nulo = desde el ingreso) y departamento. Decide el departamento de una persona en cada mes |
| `django_migrations` | Django | Propia de cada esquema |

### Sesiones e importaciones

| Tabla | Modelo | Contenido |
|---|---|---|
| `django_session` | `SesionEntorno` (`managed=False`) | Sesiones del entorno. La crea la migración de `django.contrib.sessions` |
| `import_action_logs` | `ImportActionLog` | Historial permanente de importaciones y cálculos |
| `analysis_jobs` | `AnalysisJob` | Estado vivo de cada ejecución. Índice `analysis_jobs_mod_est_idx` sobre `(module, status)` |

---

## 2. Datos de origen (cargados desde CSV)

| Tabla | La escribe | Contenido |
|---|---|---|
| `subscriptions` | `import_subscriptions_csv` | **Una fila por orden**, consolidada. `TRUNCATE` + `COPY` en cada carga |
| `subscriptions-b` | `import_subscriptions_csv` | El detalle línea a línea del mismo export. También se trunca |
| `subscriptions-logs` | `import_logs_csv` | `orden`, `fecha_log`, `log`, `estado` |
| `subscriptions-logs-v15` | **nadie, a propósito** | Formato antiguo de logs (`orden`, `tipo`, `categoria`, `fecha`). Se **lee** en el análisis mensual y en el de ciclo de vida; se carga por fuera de la aplicación, una sola vez, porque es un histórico cerrado que ya no crece. El análisis mensual la exige —sin ella sus cifras históricas estarían incompletas— y el de ciclo de vida la envuelve en `try/except` |
| `subscriptions_gratis` | `import_gratis_csv` | Desde cuándo es gratuita cada suscripción y con qué evidencia. `DROP` + `CREATE` + `COPY` |
| `crm_clients` | `import_crm_csv` | Una fila por oportunidad. `TRUNCATE` |
| `crm_logs` | `import_crm_csv` | Un movimiento entre etapas por fila. `TRUNCATE` |
| `support_tickets` | `import_support_csv` | Un ticket por fila. `DROP` + `CREATE` |

Columnas principales de `subscriptions` / `subscriptions-b`: `orden_producto`,
`producto`, `cliente`, `ci`, `sucursal`, `zona`, `municipio`, `tipo`, `estado`,
`campanna`, `fecha_factura`, `fecha_inicio`, `tarifa`, `total`, `telefono`,
`phone`, `phone2`, `vendedor`, `activo`.

`subscriptions_gratis`: `orden_producto`, `cliente`, `fecha_inicio`, `tarifa`,
`fecha_factura`, `fecha_gratuito`, `metodo`, `confianza`, `siempre_gratuito`,
`fecha_evidencia`.

`crm_clients` (DDL explícito): `id` (PK), `oportunidad`, `cliente`,
`cliente_municipio`, `campana`, `sucursal`, `vendedor`, `medio`,
`medio_supervisor`, `equipo_ventas`, `etapa`, `etapa_actual`, `motivo_perdida`,
`devolver_oportunidad`, `ganado`, `activo`, `creado_el`, `fecha_cierre`,
`ultima_actualizacion`, `duracion_total_horas`.

`crm_logs`: `id` (PK), `client_id`, `entrada_id`, `etapa_anterior`,
`nueva_etapa`, `duracion_horas`, `created_at_log`. **`entrada_id` es el id de la
oportunidad, no el del movimiento**: deduplicar por él dejaría una sola
transición por oportunidad.

`support_tickets`: `id` (PK), `ticket_sequence`, `cliente`, `etapa`,
`grupo_trabajo`, `asignado_a`, `creado_por`, `sucursal`, `zona`, `tipo_solicitud`,
`razon_falla`, `solucion_falla`, `creado_el`, `primera_fecha_asignada`,
`ultima_actualizacion_etapa`, `duracion_total_horas`.

---

## 3. Resultados de suscripciones (dinámicas)

Todas llevan `periodo_reporte` con la etiqueta `Periodo.label()`
(`"2025-03-01 al 2025-03-31"`) y las escribe `MetricsAnalyzer.persist`.

| Tabla | Columnas propias |
|---|---|
| `analyzer_cierre_historico` | El resumen del mes: `activos_inicio`, `activos_final`, `nuevos_mes`, `crecimiento`, `bajas`, `churn_neto_pct`, `churn_bruto_pct`, `corte_impagado`, `porcentaje_suspensiones`, `total_inactivos`, `reactivaciones`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `react_4_p`, `react_4_h`, `react_val`, `tasa_winback_pct`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_netas`, `adiciones_brutas`, `total_billing`, `arpu`, `clientes_gratuitos`, `gratuitos_nuevos`, `gratuitos_retornados` |
| `analyzer_activos_cierre` | `orden`, `f_dt`, `estado` |
| `analyzer_reactivaciones` | `orden`, `fecha`, `estado_origen` |
| `analyzer_bajas_detalladas` | `orden`, `f_ini_dt`, `estado` |
| `analyzer_corte_impagado` | `orden`, `fecha_corte`, `motivo_corte` |
| `analyzer_inactivos_detallados` | `orden`, `fecha_evento`, `estado_inactivo` |
| `analyzer_clientes_gratuitos` | `orden`, `fecha_archivado`, `estado` |
| `analyzer_churn_dimensiones` | `dimension`, `valor` y las mismas métricas del cierre |
| `analyzer_day_metrics` | `periodo_reporte` (único), `activos_inicio`, `dia1`…`dia31` (JSON en texto) |

`analyzer_day_metrics` es la única de este bloque con un índice único explícito
(`ix_day_metrics_periodo`) y con *upsert*: el resto se reescriben con
`DELETE` + `INSERT` del periodo. `crm_day_metrics` y `support_day_metrics`
siguen el mismo patrón (las tres las escribe `DBConnector.save_day_metrics`),
con el índice nombrado a partir de la tabla.

### Ciclo de vida

Escritas con `metodo_calculo = "lifetime"`.

| Tabla | Contenido |
|---|---|
| `lifetime_bajas_mes` | Una fila por baja del mes, `periodo_reporte = "YYYY-MM"`: `orden`, `f_ini`, `f_baja`, `estado_cierre`, `dias_desde_instalacion`, las dimensiones (sin producto), `mes_en_curso` y `fecha_corte` |
| `lifetime_periodos`, `lifetime_metricas`, `lifetime_dimensiones` | Obsoletas: las curvas de supervivencia de la versión anterior. Ya no se escriben ni se leen |

### Reporte ETA

| Tabla | Cómo se crea | Contenido |
|---|---|---|
| `analyzer_eta_config_subs_individual` | DDL explícito | Excepciones por orden: `orden` (PK), `cliente`, `producto`, `reportar`, `tecnologia`, `tipo_persona`, `tiene_tv`, `datas_mbps`, `es_transporte`, `es_dedicado`, `precio`, `updated_at`. `precio` es la renta con que se declara ese enlace: el catálogo comercial no la tiene |
| `analyzer_eta_reporte_mensual` | DDL explícito | `periodo_reporte` (PK), `reporte_data` (JSONB), `esta_bloqueado`, `tasa_bcv`, `tasa_fuente`, `fecha_calculo`. `tasa_fuente` dice de dónde salió la cifra (el día que publicó el BCV, o «Escrita a mano»). La tasa vive **fuera** de `reporte_data`: los formularios guardan el precio en divisa y la conversión es del exportador, así que se corrige sin recalcular |
| `analyzer_eta_config_planes` | — | **Obsoleta.** Guardaba una segunda copia, con prioridad, de la clasificación de cada plan. Sigue en la base de datos, **vacía y sin leer**; el nombre se conserva en `TableNames` solo para poder identificarla |

---

## 4. Resultados de CRM (DDL explícito)

| Tabla | Contenido |
|---|---|
| `crm_cierre_historico` | Una fila por `periodo_reporte` (`YYYY-MM`, único) con los escalares declarados en `_COLUMNAS_CIERRE` más `efectividad` y `tiempo_por_etapa` como JSONB |
| `crm_dimensiones_historico` | `periodo_reporte`, `dimension`, `valor`, `metricas` (JSONB), `efectividad` (JSONB) |
| `crm_metricas_globales` | Fila única (`id = 1`): `resumen_global`, `tiempo_por_etapa`, `efectividad` |
| `crm_day_metrics` | `periodo_reporte` (`YYYY-MM`, único) y `dia1`…`dia31` (JSON en texto). Cada día es `{"global": {...}, "dimensiones": [...]}`: el corte acumulado del mes hasta ese día, con la misma forma que el cierre y sus dimensiones. `global` se lee aparte de los 31 días a la vez (`-> 'global'` en SQL) para la barra de días |

Bloques de columnas de `crm_cierre_historico`:

- **Volúmenes y tasas**: `total_oportunidades`, `ganados`, `perdidos`,
  `pendientes`, `pct_instalacion`, `pct_perdida`, `pct_pendientes`.
- **Devoluciones a la etapa 8**: `count_devueltos_e8`, `pct_devueltos_e8`,
  `count_devueltos_e8_bruto`, `pct_devueltos_e8_bruto`, `e8_devueltos_excepcion`,
  `e8_devueltos_con_motivo`, `e8_devueltos_sin_motivo`, `e8_devueltos_estimados`,
  `e8_clientes_devueltos`, `e8_reincidentes`, `total_en_riesgo`.
- **Tiempos**: los ocho estadísticos × tres sufijos (`_inst`, `_perd`,
  `_cierre`).

Las columnas se fueron añadiendo con **migraciones en caliente**
(`ADD COLUMN IF NOT EXISTS`) dentro de `_create_tables_if_not_exist`.

Índices: sobre `crm_logs(client_id)`, `(created_at_log)`, `(nueva_etapa)`,
`(etapa_anterior, nueva_etapa)`; sobre `crm_clients(etapa_actual)`, `(ganado)`,
`(creado_el)`, `(campana, sucursal, vendedor)`; y sobre los periodos de cierre y
dimensiones.

---

## 5. Resultados de soporte (DDL explícito)

| Tabla | Contenido |
|---|---|
| `support_cierre_historico` | `periodo_reporte` (`YYYY-MM`, único) y **todo el bloque como un único JSONB `metricas`** |
| `support_dimensiones_historico` | `periodo_reporte`, `grupo_trabajo`, `dimension`, `valor`, `metricas` (JSONB) |
| `support_metricas_globales` | Fila única (`id = 1`): `resumen_global`, `por_grupo_trabajo`, `periodos_evaluados` |
| `support_day_metrics` | `periodo_reporte` (`YYYY-MM`, único) y `dia1`…`dia31` (JSON en texto). Cada día es `{"global": {...}, "global_grupos": {...}, "grupos": {...}, "incidencia_zonas": {...}}`: el corte acumulado del mes hasta ese día. `grupos` e `incidencia_zonas` tienen la forma del bloque del periodo; `global` (la cohorte completa) y `global_grupos` (la misma por equipo) se leen aparte de los 31 días a la vez para las tarjetas del día |

Dentro del JSONB, las claves siguen `SUPPORT_VOLUME_FIELDS`,
`SUPPORT_RATE_FIELDS` y, por cada medida de tiempo, once columnas
(`tiempo_<stat>_<medida>_horas`, `pct_excede_promedio_<medida>`,
`muestra_<medida>`). `queries.get_support_cierre_historico` las aplana antes de
servirlas.

---

## 6. Quién escribe y quién lee

| Tabla | Escribe | Lee |
|---|---|---|
| `subscriptions`, `subscriptions-b` | Importación de suscripciones | Análisis mensual, ciclo de vida, ETA, catálogos |
| `subscriptions-logs`, `-logs-v15` | Importación de logs / — | Análisis mensual, ciclo de vida |
| `subscriptions_gratis` | Importación de gratuitos | Análisis mensual (solo si falta el log real) |
| `analyzer_*` | `MetricsAnalyzer`, `build_day_metrics` | Dashboard, Analytics, Results, Sales Report, Business Units, ETA, **e incidencia por zona de soporte** |
| `lifetime_bajas_mes` | `run_lifecycle_analysis` | Página Lifetime |
| `analyzer_eta_*` | `ETAReportManager` | Reporte ETA y su pantalla de parametrización |
| `crm_*` | Importación CRM + `run_crm_analysis` | Páginas de CRM |
| `support_*` | Importación de soporte + `run_support_analysis` | Páginas de soporte |
| `catalogo_*` (planes, zonas, sites…) | Pantalla de catálogos, `cargar_catalogos` | **Solo `core/fixtures.py`** |
| `catalogo_departamentos`, `catalogo_usuarios_soporte`, `catalogo_usuarios_soporte_historial` | Pantalla `/support/users/` | `usuarios_fuera_del_directorio`, `tickets_tras_la_baja`, `anotar_departamentos` |
| `analysis_jobs` | Vistas de lanzamiento y worker | Sondeo de la interfaz |
| `import_action_logs` | `register_import_log` | Página de historial |

## 7. Ciclo de vida de los datos

```
Export de Odoo (CSV)
     │  importación (TRUNCATE o DROP + COPY)   ← la tabla de origen se reemplaza entera
     ▼
Tablas de origen  ──┐
                    │  análisis (worker de Celery)
                    ▼
Tablas de resultado ──┐   DELETE del periodo + INSERT   ← recalcular un mes lo sustituye
                      │
                      ▼
Vistas de lectura → props Inertia → React
```

**Consecuencia a tener presente:** las tablas de origen no son un histórico. Se
truncan en cada importación, así que solo contienen el último export. Todo lo
que haya que conservar de un mes tiene que estar en una tabla de resultado antes
de la siguiente carga.
