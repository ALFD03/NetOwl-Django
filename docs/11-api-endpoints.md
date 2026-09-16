# 11 · Referencia de endpoints

Todas las rutas exigen sesión (`@login_required`). La columna **Permiso** indica
lo que comprueba el decorador:

- `a, b` → basta con **uno** (`permission_required`, OR).
- `a` **y** `b` → se exigen **los dos** (`permissions_all_required`, AND).

Los superusuarios de Django pasan siempre.

Un acceso denegado responde **403 JSON** si la petición espera datos, o
**redirige** a la primera página que el usuario sí pueda abrir si es una
navegación. Ver [04 · Permisos](04-servicio-config.md).

Los límites de peticiones son por IP y devuelven **429** con un mensaje legible
(`RateLimitMiddleware`).

---

## Raíz

| Ruta | Qué hace |
|---|---|
| `GET /` | Redirige a `config:login` si no hay sesión; si la hay, a la primera página disponible (`resolve_landing_url`) y, en su defecto, al dashboard de suscripciones |

---

## `/auth/` — `services.config`

| Método | Ruta | Vista | Permiso | Notas |
|---|---|---|---|---|
| GET/POST | `/auth/login/` | `login_view` | — | `@ensure_csrf_cookie`. Acepta JSON y formulario. Sin usuarios, redirige a `setup` |
| GET | `/auth/logout/` | `logout_view` | — | |
| GET/POST | `/auth/setup/` | `setup_view` | — | Solo mientras no exista ningún usuario. Contraseña ≥ 8 caracteres |
| GET | `/auth/users/` | `user_management_view` | `can_manage_users` | Página `Config/Management` |
| POST | `/auth/api/users/create/` | `api_create_user` | `can_manage_users` | Body: `username`, `password`, `role`, `group_id`, `permissions` |
| POST | `/auth/api/users/update-role/` | `api_update_user_role` | `can_manage_users` | |
| POST | `/auth/api/users/update-permissions/` | `api_update_user_permissions` | `can_manage_users` | **No puedes modificar tus propios permisos** salvo superusuario |
| POST | `/auth/api/users/delete/` | `api_delete_user` | `can_manage_users` | **No puedes borrar tu propia cuenta** |
| POST | `/auth/api/users/change-password/` | `api_admin_change_password` | `can_manage_users` | ≥ 8 caracteres |
| POST | `/auth/api/groups/save/` | `api_save_permission_group` | `can_manage_users` | Al guardar, **resincroniza a todos los miembros** |
| POST | `/auth/api/groups/delete/` | `api_delete_permission_group` | `can_manage_users` | |
| POST | `/auth/api/users/assign-group/` | `api_assign_user_group` | `can_manage_users` | `group_id` vacío desvincula |

Respuesta uniforme: `{"status": "success"|"error", "message": "..."}`.

---

## `/subscriptions/` — `services.subscriptions`

### Páginas

| Ruta | Componente | Permiso |
|---|---|---|
| `/subscriptions/`, `/subscriptions/dashboard/` | `Subscriptions/Dashboard` | `can_view_subscriptions` |
| `/subscriptions/analytics/` | `Subscriptions/Analytics` | `can_view_subs_analytics` |
| `/subscriptions/results/`, `/results/<periodo>/` | `Subscriptions/Results` | `can_view_subs_results` |
| `/subscriptions/lifetime/` | `Subscriptions/Lifetime` | `can_view_subs_lifetime` |
| `/subscriptions/sales-report/` | `Subscriptions/SalesReport` | `can_view_subs_sales` |
| `/subscriptions/business-units/` | `Subscriptions/BusinessUnits` | `can_view_subs_sales` |
| `/subscriptions/eta-report/` | `Subscriptions/EtaReport` | `can_view_eta` |
| `/subscriptions/eta-report/config/` | `Subscriptions/EtaManagement` | `can_manage_eta` |
| `/subscriptions/config/` | `Subscriptions/Catalogos` | `can_manage_catalogos` |

Parámetros de query: `?period=YYYY-MM` (o la etiqueta completa en `results`),
`?dia=N` en los dos reportes, `?periods=a,b,c` en `analytics` y `results`,
`?nuevo_plan=<nombre>` en catálogos.

### Lectura

| Método | Ruta | Permiso | Devuelve |
|---|---|---|---|
| GET | `api/dashboard-data/` | `can_view_subscriptions` | `{periodos: [...]}` |
| GET | `api/analytics-data/?periods=` | `can_view_subs_analytics` | `{periodos, dimensiones}` |
| GET | `api/periods/` | `can_view_subscriptions` | `{periods: [...]}` |
| GET | `api/results/` | `can_view_subs_results` | `{periods: [...]}` (cierres completos) |
| GET | `api/results/<periodo>/` | `can_view_subs_results` | `{periodo, summary, dimensions}` |
| GET | `api/survival/global/?dim=` | `can_view_subs_lifetime` | Curvas, estadísticos y curvas por dimensión |
| GET | `api/lifecycle/results/` | `can_view_subs_lifetime` | `{status, data, dimensiones}` o `status: "empty"` |
| GET | `api/sales-report/?period=&dia=` | `can_view_subs_sales` | Site → Tecnología → Nodos |
| GET | `api/business-units/?period=&dia=` | `can_view_subs_sales` | Coordinador → Nodos + resumen FTTH + bloque RF |
| GET | `api/bajas/detalle/?period=&nodo=&nodo=` | `can_view_subs_results` **o** `can_view_subs_sales` | `{status, period, periods, total, bajas: [...]}`. `nodo` repetido (`"Zona - Sucursal"`, como la dimensión) acota a esos nodos (máx. 300); sin él, el periodo entero. Filtra por el par, no por la zona sola, que puede estar repartida entre varias sucursales. No admite `dia`: el detalle nominal solo existe por cierre mensual |

### Escritura

| Método | Ruta | Permiso | Límite | Notas |
|---|---|---|---|---|
| POST | `api/lifecycle/run/` | `can_run_lifetime` | 2/m | Encola; **202** con el job. Sin periodo |
| GET | `api/eta-report/data/?period=&force=` | `can_view_eta` | — | `force=true` recalcula aunque esté bloqueado |
| POST | `api/eta-report/lock/` | `can_manage_eta` | — | `{period, lock}`. Al bloquear, recalcula y congela |
| POST | `api/eta-report/tasa/` | `can_manage_eta` | 30/m | `{period, tasa}`. Escribe la tasa a mano; no recalcula nada |
| POST | `api/eta-report/tasa/consultar/` | `can_manage_eta` | 10/m | `{period}`. Vuelve a pedirla al BCV y pisa la guardada. **502** si el tercero falla |
| POST | `api/eta-report/save-sub-config/` | `can_manage_eta` | — | Excepción individual: `orden` obligatorio |
| POST | `api/eta-report/delete-sub-config/` | `can_manage_eta` | — | `{orden}` |
| POST | `api/catalogos/guardar/` | `can_manage_catalogos` | 60/m | `{tipo, id?, …campos}`. **409** si duplicado, **400** si inválido |
| POST | `api/catalogos/eliminar/` | `can_manage_catalogos` | 60/m | `{tipo, id}`. **409** si tiene zonas asociadas |

`tipo` ∈ `planes`, `zonas`, `sites`, `estados`, `coordinadores`, `ignorados`.

---

## `/crm/` — `services.crm`

| Método | Ruta | Permiso | Devuelve |
|---|---|---|---|
| GET | `/crm/`, `/crm/dashboard/` | `can_view_crm` | Página `CRM/Dashboard` |
| GET | `/crm/analytics/?period=&dia=` | `can_view_crm_analytics` | Página `CRM/Analytics`. `dia` (1-31) elige el corte acumulado del mes, leído de `crm_day_metrics`; sin él, el último calculado |
| GET | `/crm/results/?periods=` | `can_view_crm_results` | Página `CRM/Results` |
| GET | `api/periods/` | `can_view_crm` | `{periods}` |
| GET | `api/global-metrics/?period=` | `can_view_crm` | Promedio global + tiempos + efectividad + serie |
| GET | `api/cierre-historico/?periods=` | `can_view_crm_results` | `{historico}` |
| GET | `api/dimension-metrics/?period=&dimension=` | `can_view_crm_analytics` **o** `can_view_crm_results` | `{dimensiones}` |
| GET | `api/day-metrics/?period=&dia=` | `can_view_crm_analytics` | `{dia, global, dimensiones}` — el corte de un día de `crm_day_metrics`. Lo pide y cachea la barra de días; 404 si ese día no está calculado |

---

## `/support/` — `services.support`

| Método | Ruta | Permiso | Devuelve |
|---|---|---|---|
| GET | `/support/`, `/support/dashboard/` | `can_view_support` | Página `Support/Dashboard` |
| GET | `/support/analytics/?period=&dia=` | `can_view_support_analytics` | Página `Support/Analytics`. `dia` (1-31) elige el corte acumulado del mes, leído de `support_day_metrics`; sin él, el último calculado |
| GET | `/support/results/?periods=` | `can_view_support_results` | Página `Support/Results` |
| GET | `api/periods/` | `can_view_support` | `{periods}` |
| GET | `api/cierre-historico/?periods=` | `can_view_support` | `{historico}` aplanado |
| GET | `api/global-metrics/` | `can_view_support` | Promedio de todos los periodos |
| GET | `api/dimension-metrics/?period=` | `can_view_support_analytics` | `{dimensiones}`. **400** sin `period` |
| GET | `api/day-metrics/?period=&dia=` | `can_view_support_analytics` | `{dia, global, grupos, incidencia_zonas}` — el corte de un día de `support_day_metrics`. Lo pide y cachea la barra de días; 404 si ese día no está calculado |
| GET | `api/breakdown/?period=&dimension=&valor=&grupo=` | `can_view_support_analytics` | Drill-down calculado al vuelo. **400** si falta alguno de los tres primeros |
| GET | `api/tickets/?limit=&grupo=&period=` | `can_view_support_results` | Listado crudo; `limit` con techo de 5 000 |

---

## `/imports/` — `services.imports`

### Páginas

| Ruta | Componente | Permiso |
|---|---|---|
| `/imports/` | *(redirección a la primera pestaña visible)* | `can_view_imports` |
| `/imports/subscriptions/` | `Imports/Subscriptions` | `can_view_imports` **y** `can_view_imports_subs` |
| `/imports/crm/` | `Imports/Crm` | `can_view_imports` **y** `can_view_imports_crm` |
| `/imports/support/` | `Imports/Support` | `can_view_imports` **y** `can_view_imports_support` |
| `/imports/history/` | `Imports/History` | `can_view_imports` **y** `can_view_import_history` |
| `GET api/history/` | JSON, últimos 200 | `can_view_imports` **y** `can_view_import_history` |

### Carga de CSV

Todos: `POST`, `multipart/form-data` con el campo **`csv_file`**, límite **5/m**.

| Ruta | Permiso (OR con el comodín) | Tabla destino |
|---|---|---|
| `api/import-subscriptions/` | `can_import_subs`, `can_import_data` | `subscriptions` + `subscriptions-b` |
| `api/import-logs/` | `can_import_subs`, `can_import_data` | `subscriptions-logs` |
| `api/import-gratis/` | `can_import_subs`, `can_import_data` | `subscriptions_gratis` |
| `api/import-crm/` | `can_import_crm`, `can_import_data` | `crm_clients` + `crm_logs` |
| `api/import-support/` | `can_import_support`, `can_import_data` | `support_tickets` |

Respuestas:

| Código | Cuerpo | Cuándo |
|---|---|---|
| 200 | `{status: "success", message}` | Carga correcta |
| 400 | `{status: "error", message}` | Falta el archivo, no es `.csv`, excede el tamaño o le faltan cabeceras |
| **409** | `{status: "catalogo", message, productos: [{nombre, ordenes}], ordenes}` | Solo suscripciones: hay productos sin catalogar. **No se escribió nada** |
| **409** | `{status: "error", message}` | Solo suscripciones: el catálogo de planes está vacío |
| 500 | `{status: "error", message}` | Cualquier otro fallo |
| 429 | `{status: "error", message}` | Límite de peticiones |

### Lanzamiento de análisis

Todos: `POST` con `{"month": "YYYY-MM"}`, límite **2/m**.

| Ruta | Permiso (OR con el comodín) | Módulo |
|---|---|---|
| `api/run-analysis/` | `can_run_subs_analysis`, `can_run_calculations` | `subs_analysis` |
| `api/run-crm-analysis/` | `can_run_crm_analysis`, `can_run_calculations` | `crm_analysis` |
| `api/run-support-analysis/` | `can_run_support_analysis`, `can_run_calculations` | `support_analysis` |

*(El ciclo de vida se lanza en `/subscriptions/api/lifecycle/run/`, sin mes.)*

| Código | Cuerpo | Significado |
|---|---|---|
| **202** | `{status: "queued", message, job}` | Encolado |
| **409** | `{status: "running", message, job}` | Ya hay uno abierto **del mismo módulo y periodo**. El job adjunto es al que hay que engancharse |
| 400 | `{status: "error", message}` | JSON inválido o periodo distinto de `YYYY-MM` |

### Seguimiento

Sin `@ratelimit` a propósito: son endpoints de sondeo continuo.

| Método | Ruta | Visibilidad | Devuelve |
|---|---|---|---|
| GET | `api/jobs/<uuid>/` | Quien lo lanzó, quien puede ver el historial, o superusuario | La ficha completa del job (estado, mensaje, `log_output`, `progress`, `result`) |
| GET | `api/jobs/queue/` | Igual, filtrado | `{jobs: [...], en_ejecucion, en_cola}` |
| GET | `api/jobs/active/?module=` | Igual | `{job}` o `{job: null}`. **400** si el módulo no es válido |

Forma de un job:

```json
{
  "id": "…uuid…",
  "module": "subs_analysis",
  "module_display": "Subscriptions - Calculo de metricas",
  "periodo": "2025-03",
  "status": "running",
  "status_display": "En ejecucion",
  "message": "",
  "log_output": "…lo que el análisis ha impreso…",
  "progress": { "done": 12, "total": 31, "label": "Dia 12 de 31" },
  "result": { "periodo_label": "…", "dias_calculados": 31 },
  "created_at": "2025-03-01 10:00:00",
  "finished_at": null
}
```
