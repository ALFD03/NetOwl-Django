# 10 · Modelo de datos

Una única base de datos PostgreSQL, con **un esquema por entorno**
(`DB_SCHEMA`). Conviven dos familias de tablas:

| Familia | Quién la crea | Dónde vive |
|---|---|---|
| **ORM de Django** | Migraciones (`migrate`, por esquema) | `DB_SCHEMA` |
| **Analítica** | Declaradas en `services/<dominio>/analytics/tables.py`; las pone al día `migrate` (`core.tables.sync_all`) | `DB_SCHEMA` |

> **Las tablas de la analítica tienen tipos.** Cada columna se declara con el
> suyo (`date`, `timestamp`, `bigint`, `numeric`, `boolean`, `jsonb`…) y lo que
> no está declarado se borra al sincronizar. Una métrica nueva es una columna
> más en su `tables.py`: `migrate` la añade. Ver [03 · Core](03-core.md).

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
| `config_profile_unidades_negocio` | M2M `Profile.business_units` | Las unidades de negocio (`Coordinator`) que ve un usuario sin `can_view_all_business_units`. Solo del usuario: los grupos no la llevan (`config/0016`) |
| `catalogo_estados` | `State` | Entidad federal |
| `catalogo_sites` | `Site` | Sede regional + `orden` comercial |
| `catalogo_coordinadores` | `Coordinator` | Unidad de negocio: el grupo de zonas por el que agrupa Unidades de negocio. `equipos` (M2M a `catalogo_equipos_ventas`) son los equipos que la trabajan. Quien la lleva no se guarda aquí: es la membresía que la tiene en `unidades` |
| `catalogo_personas_ventas` | `catalogos.SalesPerson` | La **identidad** de una persona de ventas: nombre, apellido y los literales de Odoo, todos opcionales —`medio` (`Medio`), `medio_supervisor` (`Oportunidad/Administrador` cuando Odoo lo escribe distinto; vacío es el mismo que `medio`) y `usuario_odoo` (`Vendedor`, con `(User)`)—. Cada uno es único sin distinguir mayúsculas y solo si no está vacío. Lo que cada rol exige lo valida `catalogos/teams.py:ROLES` |
| `catalogo_equipos_ventas` | `catalogos.SalesTeam` | Los cinco equipos (Verticalización, Carabobo, Nacional, Aragua, La Victoria), sembrados por `catalogos/0006` con su `slug`. No se crean ni se borran desde la web |
| `catalogo_alias_persona` | `catalogos.PersonAlias` | Otros nombres con los que Odoo escribe a una persona en una columna (`medio`, `supervisor`, `usuario`): la misma persona con y sin tilde. Únicos por (columna, nombre en minúsculas); entre personas lo comprueba la vista. Escribe la vista de personas, lee el cálculo de comisiones, el reporte de coordinadoras y Notificaciones |
| `catalogo_membresias_equipo` | `catalogos.TeamMembership` | El papel de una persona en un equipo (`persona`, `equipo`, `rol`; única por persona y equipo). `sites` (M2M a `catalogo_sites`: los de una coordinadora de oficina; la vista no deja borrar un site que alguna lleve), `superior` (a quién responde un supervisor) y `unidades` (M2M a `catalogo_coordinadores`: las que lleva un coordinador de UN, un jefe o un gerente) |
| `catalogo_condiciones_equipo` | `catalogos.TeamConditions` | Los valores de pago de un rol de un equipo (`parametros`, JSON validado por `teams.validate_parameters`). Solo hay fila si alguien las editó: sin ella el rol paga con `DEFAULT_PARAMETERS` |
| `catalogo_objetivos_ventas_oficina` | `catalogos.OfficeSalesTarget` | Objetivo de ventas de las coordinadoras de oficina: `persona` (FK `CASCADE` nullable a un `coord_oficina`; nula es el **general**), `desde` (`YYYY-MM`, nulo = desde siempre), `ventas` (cantidad al mes), `nota`. Manda el individual vigente sobre el general vigente; la unicidad de (persona, desde) la comprueba la vista |
| `catalogo_zonas` | `Zone` | Nodo de red: site, estado, tecnología, coordinador |
| `catalogo_planes` | `Plan` | Producto contratable; único por `(nombre, tarifa)`. `plan_regulador` (FK, nullable) dice con qué fila se declara |
| `catalogo_planes_reguladores` | `RegulatoryPlan` | Producto **declarado** a la reguladora: nombre, tecnología, persona, Mbps, precio, TV y `es_transporte`. Varios planes comerciales colapsan en uno |
| `catalogo_productos_ignorados` | `IgnoredProduct` | Nombres del export que no se registrarán, por `area` (`productos`, `estructura`, `ventas`); únicos por `(area, nombre)` |
| `catalogo_objetivos` | `CommercialTarget` | Objetivos por nivel (general, sucursal, estado, site, coordinador, zona, zona-sucursal); `sucursal` es el texto del export en los niveles que la usan: `desde` (`YYYY-MM`, nulo = siempre; el general es una sola fila y siempre nulo), `crecimiento_pct` y `churn_pct` (nulo = se hereda). Lo escribe la pestaña Objetivos del catálogo; lo lee `analytics/targets.py` y lo aplica el cliente |
| `catalogo_objetivos_mes` | `MonthTarget` | Excepción de un mes concreto al objetivo general |
| `catalogo_zonas_sin_objetivo` | `ZoneWithoutTarget` | Zonas apartadas del cumplimiento (las nuevas): `zona` (uno a uno, `CASCADE`), `desde`/`hasta` (`YYYY-MM`, incluidos, nulos = sin límite), `nota`. Lo aplica el cliente al pintar (`lib/targets.ts`) |
| `catalogo_objetivos_semaforo` | `TargetsTrafficLight` | Fila única con los umbrales de color, fijos: crecimiento y cumplimiento "verde desde", churn "verde hasta" |
| `catalogo_departamentos` | `Department` | Área a la que pertenece un usuario de soporte |
| `catalogo_usuarios_soporte` | `SupportUser` | Directorio de soporte: `nombre_odoo` (el literal exacto del export, con el sufijo `(User)`), nombre, apellido, departamento vigente (FK obligatoria, `PROTECT`), `fecha_ingreso` y `fecha_egreso` (la baja: no se borra a nadie) |
| `catalogo_usuarios_soporte_historial` | `DepartmentHistory` | Departamentos por los que ha pasado cada usuario: `desde` (nulo = desde el ingreso) y departamento. Decide el departamento de una persona en cada mes |
| `comisiones_condiciones` | `CommissionConditions` | Fila única: la **ventana de pago** —día promocional habitual, días de espera y `dia_corte` (el día del mes siguiente que se propone como corte de los pagos adelantados)—. Lo que cobra cada rol está en `catalogo_condiciones_equipo` |
| `comisiones_periodos` | `CommissionPeriod` | Un mes de comisiones: `inicio` e `inicio_promo` (la ventana llega al fin de mes; desde `inicio_promo` solo cuenta lo adelantado), `corte_adelantos` (nulo: el `dia_corte` habitual), `estado` (borrador/cerrado), `tasa_conatel` y `tasa_conatel_publicada` (el bolívar oficial del día 1 del mes siguiente, con que se paga) y, al cerrar, `condiciones` y `resumen` congelados |
| `comisiones_revisiones` | `CommissionReview` | Decisión sobre una venta en revisión: contarla en su periodo o no contarla (no se paga). En el primer periodo, también si lo instalado en los días promocionales del mes anterior ya se cobró allí (`ya_pagada`) o toca aquí (`normal`). Única por `(orden, periodo_origen)` |
| `comisiones_ventas_manuales` | `ManualSale` | Una venta agregada a mano a un periodo, con su nota: cuenta en él se instalara cuando se instalara. Única por `(orden, periodo)` |
| `comisiones_indicadores` | `CommissionIndicator` | Por periodo y persona: `cumplimiento_pct` propio (supervisor, coord. de oficina; sustituye al general) y `crecimiento_pct` a mano (coord. de UN) |
| `comisiones_ventas` | `CommissionSale` | Las ventas de un periodo cerrado con su clasificación (`orden`, `clasificacion` y el resto en `datos`). Incluye las `diferida` (días promocionales sin adelanto), solo informativas |
| `comisiones_pagos` | `CommissionPayment` | Lo que cobró cada persona en un periodo cerrado, con nombre y rol copiados (el equipo, en `datos`) |
| `surveys_survey`, `surveys_question`, `surveys_option` | `Survey`, `Question`, `Option` | Las dos encuestas con sus preguntas (tipo, obligatoria, activa, condición) y opciones. Se editan en Encuestas › Preguntas; con respuestas se desactivan, no se borran |
| `surveys_respondent` | `Respondent` | Un cliente en la encuesta de un mes: copia de su ficha al abrir el mes, estado y quién lo atendió. Único por `(survey, period, order)` |
| `surveys_answer` | `Answer` | Una fila por opción elegida o una con texto libre (ver [16](16-servicio-encuestas.md)) |
| `comisiones_cierres_archivados` | `ArchivedClose` | La copia de un cierre, guardada al reabrir el periodo: quién cerró y reabrió, cuándo, el motivo y en `copia` el cierre entero. Única por `(periodo, version)`; solo se añade |
| `auditoria_registro` | `AuditLog` | Quién hizo qué: cada escritura, los accesos (y los fallidos o bloqueados), algunas lecturas sensibles, **toda petición con token de API** y el desenlace de cada análisis. Usuario, IP, módulo, acción, resultado, canal (`web`/`api`/`worker`), token, duración y `detalle` (sin contraseñas ni tokens). Solo se añade. Índices `ix_auditoria_modulo_fecha`, `ix_auditoria_usuario_fecha` e `ix_auditoria_token_fecha` |
| `config_api_token` | `ApiToken` | Tokens de API: dueño, quién lo creó, nombre, `prefix` visible y hash SHA-256 (el valor en claro no se guarda). Caducidad, revocación y último uso. No se borran, se revocan |
| `django_migrations` | Django | Propia de cada esquema |

### Sesiones e importaciones

| Tabla | Modelo | Contenido |
|---|---|---|
| `django_session` | `SchemaSession` (`managed=False`) | Sesiones del entorno. La crea la migración de `django.contrib.sessions` |
| `import_action_logs` | `ImportActionLog` | Historial permanente de importaciones y cálculos (con su consola; la auditoría solo dice quién y cómo acabó) |
| `analysis_jobs` | `AnalysisJob` | Estado vivo de cada ejecución. Índice `analysis_jobs_mod_est_idx` sobre `(module, status)` |

---

## 2. Datos de origen (cargados desde CSV)

| Tabla | La escribe | Contenido |
|---|---|---|
| `subscriptions` | `imports.import_subscriptions` | **Una fila por orden**, consolidada. Se reemplaza en cada carga |
| `subscriptions-b` | `imports.import_subscriptions` | El detalle línea a línea del mismo export, en la misma transacción |
| `subscriptions-logs` | `imports.import_logs` | `orden`, `fecha_log`, `log`, `estado` |
| `subscriptions-logs-v15` | **nadie, a propósito** | Formato antiguo de logs (`orden`, `tipo`, `categoria`, `fecha`). Se **lee** en el análisis mensual y en el de ciclo de vida; se carga por fuera de la aplicación, una sola vez, porque es un histórico cerrado que ya no crece. El análisis mensual la exige —sin ella sus cifras históricas estarían incompletas— y el de ciclo de vida la envuelve en `try/except` |
| `subscriptions_gratis` | `free_plans.import_free_plans` | Desde cuándo es gratuita cada suscripción y con qué evidencia. Se reemplaza entera |
| `subscriptions-facturas` | `invoices.import_invoices` | **Una fila por línea de factura**, con los datos de su factura repetidos. Export global: se reemplaza entera |
| `crm_clients` | `loader.import_crm` | Una fila por oportunidad. Se reemplaza, por bloques, en una sola transacción |
| `crm_logs` | `loader.import_crm` | Un movimiento entre etapas por fila. Igual |
| `support_tickets` | `loader.import_tickets` | Un ticket por fila. Se reemplaza |
| `support_ticket_logs` | `logs.import_ticket_logs` | Un cambio de etapa por fila («Registros de tiempo»). **No se reemplaza nunca**: cada lote se suma con `INSERT … ON CONFLICT (log_id) DO NOTHING` |

Columnas principales de `subscriptions` / `subscriptions-b`: `orden_producto`,
`producto`, `cliente`, `ci`, `sucursal`, `zona`, `municipio`, `tipo`, `estado`,
`campanna`, `fecha_factura`, `fecha_inicio`, `tarifa`, `total`, `telefono`,
`phone`, `phone2`, `vendedor`, `activo`, `medio`, `medio_supervisor`, `estado_factura`.
Las tres últimas (para Comisiones) y `activo` son opcionales en el export: si no
vienen, la columna queda vacía. `fecha_inicio` y `fecha_factura` son `date`,
`total` es `double precision` y `activo` es `boolean` (vacío en el export es
`false`, archivada; un valor desconocido cuenta como activa y se avisa).

`subscriptions-facturas`: `orden`, `numero`, `estado_factura_sub` (el estado de la
factura de la suscripción, solo para contrastar), `estado` (Registrado, Borrador,
Cancelado), `estado_pago`, `creado_el`, `fecha_pago` («Fecha del último pago») y
`actualizado_el` («Última actualización el»), las tres `timestamp` (las dos
últimas, opcionales: vacías si el export no las trae),
`producto` (tal cual, con la referencia `[...]` si la trae) e `importado_el`. Una
factura se identifica por `orden` + `numero` + `creado_el`: los borradores pueden
compartir número («/»). Qué línea es el plan se resuelve al leer
(`invoices.read_invoices`), contra el catálogo de ese momento.

`subscriptions_gratis`: `orden_producto`, `cliente`, `fecha_inicio`, `tarifa`,
`fecha_factura`, `fecha_gratuito`, `metodo`, `confianza`, `siempre_gratuito`,
`fecha_evidencia`.

`crm_clients`: `id` (PK), `oportunidad`, `cliente`,
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
`ultima_actualizacion_etapa`, `duracion_total_horas`. Es el export tal cual: lo
que ATC escaló dice el grupo de Soporte, y el reparto entre los dos grupos se hace
al leer (`escalation.add_escalation`), no se guarda.

`support_ticket_logs`: `log_id` (PK, el
ID del registro en Odoo, único entre todos los tickets), `ticket_sequence`,
`creado_el`, `etapa_anterior` (vacía en el log de creación), `etapa_nueva`,
`duracion_horas` (la de Odoo; se guarda pero no se usa para medir) e
`importado_en`. Índices por `(ticket_sequence, creado_el)` y por `creado_el`.

---

## 3. Resultados de suscripciones

Todas llevan `periodo_reporte` con la etiqueta `Period.label()`
(`"2025-03-01 al 2025-03-31"`) y las escribe `MetricsAnalyzer.persist`, todas en
una sola transacción con `core.tables.replace(..., periodo_reporte=…)`.

| Tabla | Columnas propias |
|---|---|
| `analyzer_cierre_historico` | El resumen del mes: `activos_inicio`, `activos_final`, `nuevos_mes`, `crecimiento`, `bajas`, `churn_neto_pct`, `churn_bruto_pct`, `corte_impagado`, `porcentaje_suspensiones`, `total_inactivos`, `reactivaciones`, `react_6_churn`, `react_8_30days`, `react_4_paused`, `react_4_p`, `react_4_h`, `react_val`, `tasa_winback_pct`, `tasa_aporte_react_pct`, `indice_reemplazo_react_pct`, `adiciones_netas`, `adiciones_brutas`, `total_billing`, `arpu`, `clientes_gratuitos`, `gratuitos_nuevos`, `gratuitos_retornados` |
| `analyzer_activos_cierre` | `orden`, `f_dt`, `estado` |
| `analyzer_reactivaciones` | `orden`, `fecha`, `estado_origen` |
| `analyzer_bajas_detalladas` | `orden`, `f_ini_dt`, `estado` |
| `analyzer_corte_impagado` | `orden`, `cutoff_date`, `motivo_corte` |
| `analyzer_inactivos_detallados` | `orden`, `fecha_evento`, `estado_inactivo` |
| `analyzer_clientes_gratuitos` | `orden`, `fecha_archivado`, `estado` |
| `analyzer_churn_dimensiones` | `dimension`, `valor` y las mismas métricas del cierre |
| `analyzer_day_metrics` | `periodo_reporte` (único), `activos_inicio`, `dia1`…`dia31` (`jsonb`) |

`analyzer_day_metrics` es la única de este bloque con clave única y *upsert*: el
resto se reescriben enteras para su periodo. `crm_day_metrics` y
`support_day_metrics` siguen el mismo patrón (las tres las escribe
`core.day_metrics.save_days`).

### Ciclo de vida

Escritas con `metodo_calculo = "lifetime"`.

| Tabla | Contenido |
|---|---|
| `lifetime_bajas_mes` | Una fila por baja del mes, `periodo_reporte = "YYYY-MM"`: `orden`, `f_ini`, `f_baja`, `estado_cierre`, `dias_desde_instalacion`, las dimensiones (sin producto), `mes_en_curso` y `cutoff_date` |

### Reporte ETA

| Tabla | Cómo se crea | Contenido |
|---|---|---|
| `analyzer_eta_config_subs_individual` | `tables.ETA_ORDER_CONFIG` | Excepciones por orden: `orden` (PK), `cliente`, `producto`, `reportar`, `tecnologia`, `tipo_persona`, `tiene_tv`, `datas_mbps`, `es_transporte`, `es_dedicado`, `precio`, `updated_at`. `precio` es la renta con que se declara ese enlace: el catálogo comercial no la tiene |
| `analyzer_eta_reporte_mensual` | `tables.ETA_MONTHLY_REPORT` | `periodo_reporte` (PK), `reporte_data` (JSONB), `esta_bloqueado`, `tasa_bcv`, `tasa_fuente`, `fecha_calculo`. `tasa_fuente` dice de dónde salió la cifra (el día que publicó el BCV, o «Escrita a mano»). La tasa vive **fuera** de `reporte_data`: los formularios guardan el precio en divisa y la conversión es del exportador, así que se corrige sin recalcular |

---

## 4. Resultados de CRM

| Tabla | Contenido |
|---|---|
| `crm_cierre_historico` | Una fila por `periodo_reporte` (`YYYY-MM`, único) con los escalares declarados en `_CLOSE_COLUMNS` más `efectividad` y `tiempo_por_etapa` como JSONB |
| `crm_dimensiones_historico` | `periodo_reporte`, `dimension`, `valor`, `metricas` (JSONB), `efectividad` (JSONB) |
| `crm_metricas_globales` | Fila única (`id = 1`): `resumen_global`, `tiempo_por_etapa`, `efectividad` |
| `crm_day_metrics` | `periodo_reporte` (`YYYY-MM`, único) y `dia1`…`dia31` (`jsonb`). Cada día es `{"global": {...}, "dimensiones": [...]}`: el corte acumulado del mes hasta ese día, con la misma forma que el cierre y sus dimensiones. `global` se lee aparte de los 31 días a la vez (`-> 'global'` en SQL) para la barra de días |

Bloques de columnas de `crm_cierre_historico`:

- **Volúmenes y tasas**: `total_oportunidades`, `ganados`, `perdidos`,
  `pendientes`, `pct_instalacion`, `pct_perdida`, `pct_pendientes`.
- **Devoluciones a la etapa 8**: `count_devueltos_e8`, `pct_devueltos_e8`,
  `count_devueltos_e8_bruto`, `pct_devueltos_e8_bruto`, `e8_devueltos_excepcion`,
  `e8_devueltos_con_motivo`, `e8_devueltos_sin_motivo`, `e8_devueltos_estimados`,
  `e8_clientes_devueltos`, `e8_reincidentes`, `total_en_riesgo`.
- **Tiempos**: los ocho estadísticos × tres sufijos (`_inst`, `_perd`,
  `_cierre`).

Índices: sobre `crm_logs(client_id)`, `(created_at_log)`, `(nueva_etapa)`,
`(etapa_anterior, nueva_etapa)`; sobre `crm_clients(etapa_actual)`, `(ganado)`,
`(creado_el)`, `(campana, sucursal, vendedor)`; y sobre los periodos de cierre y
dimensiones.

---

## 5. Resultados de soporte

| Tabla | Contenido |
|---|---|
| `support_cierre_historico` | `periodo_reporte` (`YYYY-MM`, único) y **todo el bloque como un único JSONB `metricas`** |
| `support_dimensiones_historico` | `periodo_reporte`, `grupo_trabajo`, `dimension`, `valor`, `metricas` (JSONB) |
| `support_metricas_globales` | Fila única (`id = 1`): `resumen_global`, `por_grupo_trabajo`, `periodos_evaluados` |
| `support_ticket_flujo` | Una fila por ticket con logs, **rehecha entera** en cada análisis (`flow._persist_flow`): `creado` (su primer log), `completa` (el primer log es la creación), `origen` (`atc`/`soporte`), `escalado_el`, `ultimo_log`, `etapa_actual`/`equipo_actual`/`tipo_actual`, `primer_cierre`, `reaperturas`, `transferencia_sin_escalar`, entrada y salida de la cola de cada equipo y `h_<equipo>_<tipo>`: horas en cola, pausa, gestión y sin clasificar de ATC y de Soporte. Lo leen las cohortes (de aquí sale cuándo escaló cada ticket) y los tickets abiertos |
| `catalogo_etapas_soporte` | ORM (`SupportStage`): `nombre` (único sin caja), `equipo` (`atc`/`soporte`/`compartida`), `tipo` (`cola`/`pausa`/`gestion`). Las de cierre no van aquí |
| `support_day_metrics` | `periodo_reporte` (`YYYY-MM`, único) y `dia1`…`dia31` (`jsonb`). Cada día es `{"global": {...}, "global_grupos": {...}, "grupos": {...}, "incidencia_zonas": {...}}`: el corte acumulado del mes hasta ese día. `grupos` e `incidencia_zonas` tienen la forma del bloque del periodo; `global` (la cohorte completa) y `global_grupos` (la misma por equipo) se leen aparte de los 31 días a la vez para las tarjetas del día |

Dentro del JSONB, las claves siguen `SUPPORT_VOLUME_FIELDS`,
`SUPPORT_RATE_FIELDS` y, por cada medida de tiempo, once columnas
(`tiempo_<stat>_<medida>_horas`, `pct_excede_promedio_<medida>`,
`muestra_<medida>`), más la composición del tiempo
(`composicion_<tipo>_horas` y `muestra_composicion`). Los volúmenes y tasas
incluyen el escalamiento (`tickets_escalados[_periodo|_arrastre]`,
`tickets_recibidos_escalados`, `pct_escalados*`, `pct_recibidos_escalados`) y las
medidas de tiempo, `escalamiento`. `queries.get_support_close_history` las
aplana antes de servirlas.

---

## 6. Quién escribe y quién lee

| Tabla | Escribe | Lee |
|---|---|---|
| `subscriptions`, `subscriptions-b` | Importación de suscripciones | Análisis mensual, ciclo de vida, ETA, catálogos |
| `subscriptions-logs`, `-logs-v15` | Importación de logs / — | Análisis mensual, ciclo de vida |
| `subscriptions_gratis` | Importación de gratuitos | Análisis mensual (solo si falta el log real) |
| `subscriptions-facturas` | Importación de facturas | Comisiones (la primera mensualidad de cada venta) |
| `analyzer_*` | `MetricsAnalyzer`, `build_day_metrics` | Dashboard, Analytics, Results, Sales Report, Business Units, ETA, **e incidencia por zona de soporte** |
| `lifetime_bajas_mes` | `run_lifetime_analysis` | Página Lifetime |
| `analyzer_eta_*` | `ETAReportManager` | Reporte ETA y su pantalla de parametrización |
| `crm_*` | Importación CRM + `run_crm_analysis` | Páginas de CRM |
| `support_*` | Importación de soporte + `run_support_analysis` | Páginas de soporte |
| `catalogo_*` (planes, zonas, sites…) | Módulo de Catálogos, `load_catalogs` | **Solo `core/fixtures.py`** |
| `catalogo_personas_ventas` | Catálogos › Ventas | `people_outside_directory` (Notificaciones), Comisiones |
| `catalogo_objetivos_ventas_oficina` | Catálogos › Ventas › Objetivos | Sales Report (`office_coordinators.get_office_coordinators`) |
| `comisiones_*` | Módulo de Comisiones | Módulo de Comisiones |
| `catalogo_departamentos`, `catalogo_usuarios_soporte`, `catalogo_usuarios_soporte_historial` | Pantalla `/support/users/` | `users_outside_directory`, `tickets_after_churn`, `annotate_departments` |
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
Endpoints de lectura (/api/) → React
```

**Consecuencia a tener presente:** las tablas de origen no son un histórico. Se
truncan en cada importación, así que solo contienen el último export. Todo lo
que haya que conservar de un mes tiene que estar en una tabla de resultado antes
de la siguiente carga.
