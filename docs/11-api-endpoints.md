# 11 · Referencia de endpoints

## API `/api/<módulo>/<servicio>/`

Una sola API para la SPA y para cualquier otro cliente. Cada vista se declara con
`@endpoint` (`services/config/api/endpoint.py`), que resuelve método,
autenticación, permisos, límite de peticiones, validación con pydantic y errores.
Cada módulo cuelga sus rutas de su `api_urls.py`, incluido en `api_patterns`
(`netowl_web/urls.py`) con un `app_name` en inglés: es el módulo que anota la
auditoría, y el nombre de la ruta es la acción.

**Autenticación**, en los mismos endpoints:

- **Sesión** (la SPA): cookie de sesión + cabecera `X-CSRFToken` en las escrituras.
  `GET /api/auth/me/` entrega la cookie CSRF.
- **Token** (otras apps): `Authorization: Bearer nwl_…`. Actúa con los permisos
  vigentes de la cuenta dueña, que además necesita `can_use_api`. No usa CSRF.
  Toda petición con token, también las lecturas, queda en auditoría (canal `api`,
  token y duración); un token inválido, revocado o caducado responde 401 y también
  se anota. Los tokens se gestionan en `/auth/tokens/`.

**Permisos**: `a o b` basta con uno; `a y b` exige los dos. Los superusuarios
pasan siempre. «Sesión o token» es cualquier cuenta autenticada; «sesión» y
«solo sesión» rechazan los tokens.

**Límites**: por token, por cuenta o por IP, según quién llame; responden 429.
Los endpoints que se sondean (jobs) van sin límite a propósito.

**Respuestas**: éxito → el JSON de datos (200/201) o 204 sin cuerpo. Error →
`{"error": {"message": "...", "details": ...}}` con 400 (parámetros), 401, 403,
404, 405, 409 (conflicto de negocio), 429, 500 o 502 (BCV caído). Una ruta
inexistente bajo `/api/` responde 404 JSON.

Los GET de página devuelven exactamente lo que pinta la página de la SPA; los
parámetros de la URL de la página (`?period=`, `?day=`) viajan tal cual al endpoint.

**Claves en inglés**: toda la API habla en inglés (claves del JSON, parámetros de
la query y campos de los cuerpos), aunque la analítica trabaje con sus columnas y
estructuras guardadas en español. Cada módulo declara un `KeyMap` en su
`api_keys.py` y `@endpoint(keys=...)` traduce la respuesta; un cuerpo con esa
misma estructura vuelve al español con `KEYS.back()` en la vista. No se traducen
las claves que también son valores guardados: dimensiones (`zona`, `sucursal`,
`municipio`, `campanna`, `producto`, `zona_sucursal`), métricas `react_*`, roles,
slugs de equipo, áreas y piezas de pago (`propia`, `equipo`, `factor`, `bono_*`…).

### `/api/auth/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| POST | `/api/auth/login/` | pública · solo sesión | — | Abre la sesión del navegador. Los intentos fallidos se limitan por cuenta y por IP. |
| POST | `/api/auth/logout/` | sesión | — | Cierra la sesión del navegador. |
| GET | `/api/auth/me/` | sesión o token | — | La cuenta actual. Entrega además la cookie CSRF, también a un anónimo (401). |
| GET | `/api/auth/tokens/` | `can_manage_api_tokens` · solo sesión | — | GET: lista de tokens (opcionalmente de una cuenta). POST: crea uno. |
| POST | `/api/auth/tokens/` | `can_manage_api_tokens` · solo sesión | 30/m | GET: lista de tokens (opcionalmente de una cuenta). POST: crea uno. |
| POST | `/api/auth/tokens/<token_id>/revoke/` | `can_manage_api_tokens` · solo sesión | 30/m | Revoca un token: deja de valer al instante. |
| GET | `/api/auth/users/` | `can_view_users` | — | GET: la pantalla de administración. POST: crea una cuenta. |
| POST | `/api/auth/users/` | `can_create_users` | 10/m | GET: la pantalla de administración. POST: crea una cuenta. |
| DELETE | `/api/auth/users/<user_id>/` | `can_delete_users` | 10/m | Elimina una cuenta; nunca la propia ni una de más rango. |
| POST | `/api/auth/users/<user_id>/permissions/` | `can_edit_user_permissions` | 20/m | Rol, grupo, matriz y unidades de una cuenta. Asignar un grupo descarta la matriz individual. |
| POST | `/api/auth/users/<user_id>/password/` | `can_change_passwords` | 10/m | Fija la contraseña de otra cuenta: es poder entrar como ella, por eso exige rango. |
| POST | `/api/auth/groups/` | `can_manage_groups` | 20/m | Crea un grupo. |
| POST | `/api/auth/groups/<group_id>/` | `can_manage_groups` | 20/m | POST: actualiza el grupo y resincroniza a sus miembros. DELETE: lo elimina. |
| DELETE | `/api/auth/groups/<group_id>/` | `can_manage_groups` | 20/m | POST: actualiza el grupo y resincroniza a sus miembros. DELETE: lo elimina. |

### `/api/audit/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/audit/logs/` | `can_view_audit` | — | El registro filtrado: los `LIMIT` más recientes de lo que cumple los filtros. |
| GET | `/api/audit/logs/<log_id>/` | `can_view_audit` | — | Un registro con su `detail`. |
| GET | `/api/audit/health/` | `can_view_audit` | — | Estado de web, Postgres, Redis, worker de Celery y análisis. |
| GET | `/api/audit/stats/` | `can_view_audit` | — | Actividad, errores y latencia por endpoint de las últimas horas. |

### `/api/subscriptions/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/subscriptions/dashboard/` | `can_view_subscriptions` y `can_view_subs_dashboard` | — | Los cierres de todos los periodos visibles y sus zonas. |
| GET | `/api/subscriptions/analytics/` | `can_view_subs_analytics` | — | Cierres, dimensiones y el mes completo de métricas diarias (`?period=YYYY-MM`). |
| GET | `/api/subscriptions/results/` | `can_view_subs_results` | — | Los cierres para la tabla de resultados; `?period=` preselecciona uno. |
| GET | `/api/subscriptions/results/<period>/` | `can_view_subs_results` | — | El cierre y las dimensiones de un periodo. |
| GET | `/api/subscriptions/lifetime/` | `can_view_subs_lifetime` | — | Cuánto duraron activas las bajas de un mes (`?period=`, por defecto el último). |
| GET | `/api/subscriptions/lifetime/detail/` | `can_view_subs_lifetime` | — | Las bajas de un mes con sus duraciones, una por orden, para exportar. |
| POST | `/api/subscriptions/lifetime/run/` | `can_run_lifetime` | 2/m | Encola el lifetime de todos los meses; se sigue en `/api/imports/jobs/<id>/`. |
| GET | `/api/subscriptions/sales-report/` | `can_view_subs_sales` | — | Reporte de ventas: site → tecnología → nodos, con las coordinadoras de oficina. |
| GET | `/api/subscriptions/business-units/` | `can_view_subs_business_units` | — | Reporte por coordinador; quien no ve todas las unidades recibe solo las suyas. |
| GET | `/api/subscriptions/churn/detail/` | `can_view_subs_results` o `can_view_subs_sales` o `can_view_subs_business_units` | — | Las bajas de un periodo con la ficha de cada cliente, para exportar. |
| GET | `/api/subscriptions/eta-report/` | `can_view_eta` | — | El reporte de un periodo (`?period=YYYY-MM`, por defecto el último). |
| GET | `/api/subscriptions/eta-report/config/` | `can_manage_eta` | — | La parametrización: excepciones individuales y pendientes. |
| GET | `/api/subscriptions/eta-report/data/` | `can_view_eta` | 30/m | Recarga del reporte. `?force=true` recalcula todo y exige `can_manage_eta`. |
| POST | `/api/subscriptions/eta-report/lock/` | `can_manage_eta` | 5/m | Bloquea o desbloquea un periodo; al bloquear se recalcula una última vez. |
| POST | `/api/subscriptions/eta-report/orders/save/` | `can_manage_eta` | 30/m | Guarda la excepción individual de una orden. |
| POST | `/api/subscriptions/eta-report/orders/delete/` | `can_manage_eta` | 30/m | Borra la excepción de una orden: vuelve a clasificarse por su plan. |
| POST | `/api/subscriptions/eta-report/rate/` | `can_manage_eta` | 30/m | Fija a mano la tasa del BCV del periodo (0 = sin fijar). No recalcula el reporte. |
| POST | `/api/subscriptions/eta-report/rate/fetch/` | `can_manage_eta` | 10/m | Vuelve a pedirle al BCV la tasa del periodo y la guarda. 502 si el BCV falla. |
| GET | `/api/subscriptions/eta-report/rate/current/` | `can_view_eta` | 10/m | La última tasa publicada por el BCV, sin guardarla: sirve para exportar a precio de hoy. |

### `/api/crm/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/crm/dashboard/` | `can_view_crm` y `can_view_crm_dashboard` | — | El promedio global y su serie histórica. |
| GET | `/api/crm/analytics/` | `can_view_crm_analytics` | — | Las dimensiones del periodo y su global, al corte `?day=` o al último calculado. |
| GET | `/api/crm/results/` | `can_view_crm_results` | — | Los cierres de los periodos pedidos (`?periods=a,b`). |
| GET | `/api/crm/day-metrics/` | `can_view_crm_analytics` | — | El corte completo de un día: `{global, dimensiones}`. Lo escribe el análisis. |
| GET | `/api/crm/dimension-metrics/` | `can_view_crm_analytics` o `can_view_crm_results` | — | Las métricas de una dimensión y un periodo. |

### `/api/support/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/support/dashboard/` | `can_view_support` y `can_view_support_dashboard` | — | El promedio de los periodos evaluados y, con su permiso, los tickets abiertos hoy. |
| GET | `/api/support/analytics/` | `can_view_support_analytics` | — | El bloque de un periodo al corte `?day=` (o al último) y la serie ligera del mes. |
| GET | `/api/support/results/` | `can_view_support_results` | — | Los cierres por periodo y el detalle estructurado de un mes (`?period=`). |
| GET | `/api/support/breakdown/` | `can_view_support_analytics` o `can_view_support_results` | — | El drill-down de un valor dimensional: sus tipos, razones y soluciones. |
| GET | `/api/support/day-metrics/` | `can_view_support_analytics` | — | El corte completo de un día: `{global, grupos, incidencia_zonas}`. |
| GET | `/api/support/users/` | `can_manage_support_users` | — | El directorio, los nombres de los tickets que no reconoce y los tickets tras una baja. |
| POST | `/api/support/users/save/` | `can_manage_support_users` | 60/m | Alta o edición de un usuario o un departamento. |
| POST | `/api/support/users/delete/` | `can_manage_support_users` | 60/m | Baja de una fila. Un departamento referenciado no se borra (409). |
| POST | `/api/support/users/move/` | `can_manage_support_users` | 60/m | Cambio de departamento, baja o reactivación; las reglas viven en el modelo. |
| GET | `/api/support/stages/` | `can_manage_support_users` | — | El catálogo, lo que falta clasificar y las reglas fijas. |
| POST | `/api/support/stages/save/` | `can_manage_support_users` | 60/m | Alta o edición de una etapa (sin `id` es un alta). |
| POST | `/api/support/stages/delete/` | `can_manage_support_users` | 60/m | Baja de una etapa: sus tramos pasan a «sin clasificar» en el siguiente análisis. |

### `/api/imports/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/imports/subscriptions/` | `can_view_imports` y `can_view_imports_subs` | — | Las columnas de Odoo que espera la carga de suscripciones. |
| GET | `/api/imports/crm/` | `can_view_imports` y `can_view_imports_crm` | — | Las columnas de Odoo que espera la carga de CRM. |
| GET | `/api/imports/support/` | `can_view_imports` y `can_view_imports_support` | — | Las columnas de Odoo de tickets y logs, y si ya hay logs cargados. |
| GET | `/api/imports/history/` | `can_view_imports` y `can_view_import_history` | — | Las 200 últimas importaciones y cálculos. |
| POST | `/api/imports/subscriptions/upload/` | `can_import_subs` o `can_import_data` | 5/m | El export de suscripciones. 409 `catalog` si hay productos fuera del catálogo. |
| POST | `/api/imports/subscriptions/logs/upload/` | `can_import_subs` o `can_import_data` | 5/m | Carga el CSV de logs de suscripciones. |
| POST | `/api/imports/subscriptions/free-plans/upload/` | `can_import_subs` o `can_import_data` | 5/m | El export de planes gratuitos: detecta desde cuándo lo son. |
| POST | `/api/imports/subscriptions/invoices/upload/` | `can_import_subs` o `can_import_data` | 5/m | El export global de facturas (lo usa Comisiones). Las cabeceras las valida el importador. |
| POST | `/api/imports/crm/upload/` | `can_import_crm` o `can_import_data` | 5/m | El export de CRM: oportunidades y movimientos. |
| POST | `/api/imports/support/upload/` | `can_import_support` o `can_import_data` | 5/m | Carga el CSV de tickets de soporte. |
| POST | `/api/imports/support/logs/upload/` | `can_import_support` o `can_import_data` | 5/m | Suma un lote de logs de etapa; cada log entra una sola vez por su id. |
| POST | `/api/imports/subscriptions/run/` | `can_run_subs_analysis` o `can_run_calculations` | 2/m | Encola el análisis mensual de churn. |
| POST | `/api/imports/crm/run/` | `can_run_crm_analysis` o `can_run_calculations` | 2/m | Encola el análisis mensual de CRM. |
| POST | `/api/imports/support/run/` | `can_run_support_analysis` o `can_run_calculations` | 2/m | Encola el análisis mensual de soporte. |
| GET | `/api/imports/jobs/queue/` | sesión o token | — | Lo que calcula o espera turno, para el aviso flotante. Sin límite: se sondea. |
| GET | `/api/imports/jobs/active/` | sesión o token | — | La ejecución abierta de un módulo, para reengancharse tras recargar. |
| GET | `/api/imports/jobs/<job_id>/` | sesión o token | — | Estado vivo de una ejecución. Se sondea cada pocos segundos: sin límite. |
| POST | `/api/imports/jobs/<job_id>/cancel/` | sesión o token | 10/m | Cancela una ejecución abierta; el worker se detiene en su siguiente punto de control. |

### `/api/catalogs/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/catalogs/notifications/` | `can_manage_operational_catalog` o `can_manage_commercial_catalog` o `can_manage_sales_catalog` | — | Lo que falta en cada área administrada, lo ignorado y las opciones para registrarlo aquí. |
| GET | `/api/catalogs/products/` | `can_manage_operational_catalog` | — | Planes y planes reguladores. `?new_plan=` abre el alta ya rellena. |
| GET | `/api/catalogs/structure/` | `can_manage_commercial_catalog` | — | Zonas y estados (con sites y unidades para el formulario). `?new_zone=` abre el alta. |
| GET | `/api/catalogs/sales/` | `can_manage_sales_catalog` | — | Estructura de ventas, equipos con su gente y condiciones, y objetivos. |
| POST | `/api/catalogs/save/` | `can_manage_operational_catalog` o `can_manage_commercial_catalog` o `can_manage_sales_catalog` | 60/m | Alta o edición de una fila de cualquier catálogo. |
| POST | `/api/catalogs/save-batch/` | `can_manage_operational_catalog` o `can_manage_commercial_catalog` o `can_manage_sales_catalog` | 20/m | Alta de varias filas de un catálogo; cada una en su savepoint. |
| POST | `/api/catalogs/delete/` | `can_manage_operational_catalog` o `can_manage_commercial_catalog` o `can_manage_sales_catalog` | 60/m | Baja de una fila. Lo que otra fila referencia con `PROTECT` responde 409 con el motivo. |

### `/api/commissions/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/commissions/report/` | `can_view_commissions` | — | El informe de un periodo (`?period=YYYY-MM`); sin él, el más reciente o el que toca crear. |
| GET | `/api/commissions/sales/` | `can_view_commissions` | — | El detalle venta a venta de un periodo, para el desglose y la exportación. |
| POST | `/api/commissions/periods/save/` | `can_manage_commissions` | 30/m | Crea un periodo en borrador o cambia sus días promocionales. |
| POST | `/api/commissions/periods/close/` | `can_manage_commissions` | 10/m | Cierra el periodo: congela ventas, pagos y condiciones. 409 si queda algo pendiente. |
| POST | `/api/commissions/periods/reopen/` | `can_reopen_commissions` | 10/m | Devuelve un periodo cerrado a borrador archivando su cierre. Exige `reason` y `confirmation`. |
| POST | `/api/commissions/periods/delete/` | `can_delete_commissions` | 10/m | Borra un informe en borrador con lo decidido en él. 409 si está o estuvo cerrado. |
| GET | `/api/commissions/archives/<archive_id>/` | `can_view_commissions` | — | La copia completa de un cierre archivado, para descargarla. |
| POST | `/api/commissions/reviews/save/` | `can_manage_commissions` | 60/m | Decide ventas por facturar; `decision` vacía deshace y `orders` decide varias. |
| POST | `/api/commissions/manual/add/` | `can_manage_commissions` | 30/m | Agrega ventas a mano (`orders`, `note` obligatoria). Todo o nada. |
| POST | `/api/commissions/manual/remove/` | `can_manage_commissions` | 30/m | Quita una venta agregada a mano. |
| POST | `/api/commissions/indicators/save/` | `can_manage_commissions` | 60/m | El % de cumplimiento o de crecimiento a mano de una persona; vacío vuelve al calculado. |
| GET | `/api/commissions/current-rate/` | `can_view_commissions` | 30/m | La tasa oficial del BCV de hoy, como referencia (no se guarda). 502 si falla. |
| GET | `/api/commissions/conditions/` | `can_manage_commissions` | — | La ventana de pago y los % PYME de cada plan. |
| POST | `/api/commissions/conditions/save/` | `can_manage_commissions` | 30/m | Guarda la ventana de pago. Solo afecta a lo que se calcule después. |

### `/api/surveys/`

| Método | Ruta | Permiso | Límite | Qué hace |
|---|---|---|---|---|
| GET | `/api/surveys/installed/`, `/api/surveys/churned/` | `can_view_surveys` | — | La encuesta de un mes (`?period=YYYY-MM`; sin él, el último cerrado): avance por mes, preguntas activas y permisos. |
| GET | `/api/surveys/settings/` | `can_manage_surveys` | — | Las preguntas y opciones de las dos encuestas, con lo desactivado y sus conteos. |
| GET | `/api/surveys/respondents/` | `can_view_surveys` | — | La lista de un mes (`?survey=&period=`) y sus resultados. Se audita. |
| GET | `/api/surveys/answers/` | `can_view_surveys` | — | Lo que contestó un encuestado (`?id=`). |
| POST | `/api/surveys/periods/open/` | `can_answer_surveys` | 10/m | Abre o actualiza la lista del mes desde Suscripciones. 409 si el mes no cerró o no hay lista. |
| POST | `/api/surveys/periods/delete/` | `can_delete_surveys` | 10/m | Borra un mes con sus respuestas. Exige `confirmation` (el mes escrito a mano). |
| POST | `/api/surveys/answers/save/` | `can_answer_surveys` | 120/m | Guarda las respuestas de un cliente y lo da por completado. 400 si faltan obligatorias. |
| POST | `/api/surveys/status/save/` | `can_answer_surveys` | 120/m | Pendiente, «no contesta» o «rechazó». |
| POST | `/api/surveys/questions/save/`, `…/delete/`, `…/move/` | `can_manage_surveys` | 60/m | Alta, edición, baja y orden de preguntas. Con respuestas no se borra (409). |
| POST | `/api/surveys/options/save/`, `…/delete/`, `…/move/` | `can_manage_surveys` | 60/m | Lo mismo para las opciones. |

---

## Rutas de página

Todas sirven la misma plantilla (`templates/app.html`) con la SPA; la vista
`page(*perms)` de `services/config/pages.py` exige sesión y el permiso de la
página. Sin sesión redirige a `/auth/login/?next=`; sin permiso, a la primera
página que la cuenta sí puede abrir (`LANDING_ROUTES`).

| Ruta | Permiso |
|---|---|
| `/` | Redirige a la primera página permitida |
| `/auth/login/` | Pública |
| `/auth/users/` | `can_view_users` |
| `/auth/tokens/` | `can_manage_api_tokens` |
| `/subscriptions/` | Redirige a su primera página permitida |
| `/subscriptions/dashboard/` | `can_view_subscriptions` y `can_view_subs_dashboard` |
| `/subscriptions/analytics/` | `can_view_subs_analytics` |
| `/subscriptions/results/`, `/subscriptions/results/<periodo>/` | `can_view_subs_results` |
| `/subscriptions/lifetime/` | `can_view_subs_lifetime` |
| `/subscriptions/sales-report/` | `can_view_subs_sales` |
| `/subscriptions/business-units/` | `can_view_subs_business_units` |
| `/subscriptions/eta-report/` | `can_view_eta` |
| `/subscriptions/eta-report/config/` | `can_manage_eta` |
| `/crm/` | Redirige a su primera página permitida |
| `/crm/dashboard/` | `can_view_crm` y `can_view_crm_dashboard` |
| `/crm/analytics/` | `can_view_crm_analytics` |
| `/crm/results/` | `can_view_crm_results` |
| `/support/` | Redirige a su primera página permitida |
| `/support/dashboard/` | `can_view_support` y `can_view_support_dashboard` |
| `/support/analytics/` | `can_view_support_analytics` |
| `/support/results/` | `can_view_support_results` |
| `/support/users/`, `/support/etapas/` | `can_manage_support_users` |
| `/imports/` | Redirige a su primera página permitida |
| `/imports/subscriptions/` | `can_view_imports` y `can_view_imports_subs` |
| `/imports/crm/` | `can_view_imports` y `can_view_imports_crm` |
| `/imports/support/` | `can_view_imports` y `can_view_imports_support` |
| `/imports/history/` | `can_view_imports` y `can_view_import_history` |
| `/catalogos/` | Redirige a Notificaciones |
| `/catalogos/notificaciones/` | Cualquiera de los tres permisos de catálogo |
| `/catalogos/productos/` | `can_manage_operational_catalog` |
| `/catalogos/estructura/` | `can_manage_commercial_catalog` |
| `/catalogos/ventas/` | `can_manage_sales_catalog` |
| `/comisiones/` | `can_view_commissions` |
| `/comisiones/condiciones/` | `can_manage_commissions` |
| `/encuestas/` | Redirige a la primera página permitida del módulo |
| `/encuestas/instalados/`, `/encuestas/bajas/` | `can_view_surveys` |
| `/encuestas/configuracion/` | `can_manage_surveys` |
| `/auditoria/`, `/auditoria/monitoreo/` | `can_view_audit` |
