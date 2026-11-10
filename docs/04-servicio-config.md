# 04 · `services/config/` — autenticación, perfiles y permisos

Es la app de infraestructura: no tiene dominio de negocio propio, pero todas las
demás dependen de ella (decoradores, matriz de permisos, subida de CSV).

| Fichero | Contenido |
|---|---|
| `models.py` | Matriz de permisos, `Profile`, `PermissionGroup`, `SesionEntorno` |
| `decorators.py` | `permission_required`, `permissions_all_required`, `LANDING_ROUTES` |
| `views.py` | Login, alta inicial, y el CRUD de usuarios y grupos |
| `urls.py` | Bajo el prefijo `/auth/` |
| `sessions.py` | Backend de sesiones que escribe en la tabla del entorno |
| `uploads.py` | Recepción de CSV compartida por todas las apps |
| `management/commands/copiar_desde_public.py` | Copia al esquema del entorno lo que antes se compartía en `public` (una vez por entorno) |

---

## La matriz de permisos

**Un único catálogo** en `models.py`, y todo lo demás lo recorre:

```python
VIEW_PERMISSION_FIELDS   = [...]   # lectura: por defecto True
ACTION_PERMISSION_FIELDS = [...]   # acción:  por defecto False
PERMISSION_FIELDS = VIEW_PERMISSION_FIELDS + ACTION_PERMISSION_FIELDS
```

### Permisos de lectura (abiertos por defecto)

| Permiso | Abre |
|---|---|
| `can_view_subscriptions` | Módulo de suscripciones (puerta exterior) |
| `can_view_crm` | Módulo CRM (puerta exterior) |
| `can_view_support` | Módulo de soporte (puerta exterior) |
| `can_view_subs_dashboard` / `can_view_crm_dashboard` / `can_view_support_dashboard` | El dashboard de cada módulo. Exige además el permiso del módulo. Antes lo abría el del módulo; `config/0012` lo concedió a quien ya lo tenía. La raíz del módulo (`/crm/`…) redirige a la primera página que el usuario pueda ver (`primera_pagina`) |
| `can_view_imports` | Módulo de importaciones (puerta exterior) |
| `can_view_subs_analytics` / `..._results` / `..._lifetime` / `..._sales` / `..._business_units` | Páginas de suscripciones. Sales Report es `can_view_subs_sales` y Business Units `can_view_subs_business_units`: compartían el primero hasta `config/0015`, que concedió el nuevo a quien tenía el de ventas |
| `can_view_eta` | Reporte ETA |
| `can_view_crm_analytics` / `can_view_crm_results` | Páginas de CRM |
| `can_view_support_analytics` / `can_view_support_results` | Páginas de soporte |
| `can_view_imports_subs` / `_crm` / `_support` / `can_view_import_history` | Una por pestaña de importaciones |
| `can_view_comisiones` | El informe de comisiones |
| `can_view_all_periods` | Todos los periodos evaluados de Suscripciones, CRM y Soporte. Sin él, solo el **último periodo calculado** de cada módulo (ver abajo). `config/0013` lo concedió a todas las cuentas existentes; una cuenta nueva nace sin él |
| `can_view_all_business_units` | Todas las unidades de negocio. Sin él, la página Unidades de negocio enseña solo las de `unidades_negocio` y el bloque RF si `unidad_rf` (ver abajo). `config/0014` lo concedió a todas las cuentas existentes |
| `can_view_users` | La pantalla de usuarios y grupos (solo verla) |
| `can_view_auditoria` | El registro de auditoría (`/auditoria/`) |

### Periodos visibles (`services/config/periodos.py`)

Sin `can_view_all_periods` una cuenta solo ve el último periodo calculado de cada módulo, y la restricción
se aplica en el servidor, no solo en el selector:

- Las páginas de varios periodos (dashboards, Analytics, Resultados, Reporte de ventas, Unidades de negocio,
  Ciclo de vida) reciben la lista recortada al último (`periodos_visibles`, `acotar_pedidos`), y un
  `?period=` antiguo se sustituye por el permitido (`periodo_visible`).
- Los endpoints JSON de un periodo concreto (detalle de resultados, dimensiones, drill-down, cortes diarios,
  tickets, detalle de lifetime) responden 403 si se pide otro (`periodo_denegado`, `mes_denegado`).
- Los dashboards de CRM y Soporte, que promedian todos los periodos, se construyen con el último y nada más,
  con las mismas funciones de promedio que el análisis (`crm.analytics.metrics.promediar_cierres`,
  `support.analytics.metrics.average_blocks`), para que la forma del bloque no cambie.
- El reporte ETA y Comisiones no se restringen: son de quien administra, no de lectura.

### Unidades de negocio por cuenta (`services/config/unidades.py`)

Una unidad de negocio es un `Coordinador` del catálogo, y el catálogo cambia, así que no hay un permiso por
unidad: `can_view_all_business_units` es el interruptor y, sin él, `Profile.unidades_negocio` (M2M a
`Coordinador`, por id: renombrar no quita nada) más `Profile.unidad_rf` (el bloque RF, que no es un coordinador).

**El interruptor es de la matriz, la lista es del usuario.** El interruptor puede venir del grupo, como cualquier
permiso; la lista se elige siempre por persona y el grupo ni la lleva ni la sincroniza (`config/0016` la quitó de
`PermissionGroup`). `Profile.alcance_unidades()` pregunta el interruptor con `has_permission` y, sin él, lee la
lista del perfil. Con el interruptor la lista no rige, pero se conserva.

- **Solo restringe la página Unidades de negocio** (y su `api/business-units/`). El Reporte de ventas, que
  tiene su propio permiso, no cambia.
- El recorte es del servidor (`subscriptions.analytics.queries.restringir_unidades`): el cliente reagrupa cada
  día desde `dayMetrics` y `zonasConfig`, así que los dos llegan recortados a las zonas visibles.
- **El consolidado FTTH se ve siempre**, el de toda la empresa. Como sus nodos ya no llegan, viaja sumado en
  `buData.ftth_consolidado` (un nodo por corte) y no sigue los filtros de sucursal, búsqueda o métrica.
- El techo de la administración vale también aquí: nadie escribe en la lista de otro unidades que no ve
  (`unidades_fuera_de_alcance`, que compara las listas guardadas aunque no rijan) ni toca una cuenta con
  unidades que no ve (`puede_actuar_sobre`).

### Permisos de acción (cerrados por defecto)

| Permiso | Permite |
|---|---|
| `can_import_data` | **Comodín heredado** de carga de CSV |
| `can_run_calculations` | **Comodín heredado** de ejecución de análisis |
| `can_import_subs` / `can_import_crm` / `can_import_support` | Carga por módulo |
| `can_run_subs_analysis` / `can_run_crm_analysis` / `can_run_support_analysis` | Ejecución por motor |
| `can_run_lifetime` | Análisis de ciclo de vida |
| `can_manage_eta` | Parametrizar y bloquear el reporte ETA |
| `can_create_users` | Crear cuentas |
| `can_edit_user_permissions` | Cambiar rol, grupo y matriz de una cuenta |
| `can_change_passwords` | Cambiar la contraseña de otra cuenta |
| `can_delete_users` | Eliminar cuentas |
| `can_manage_groups` | Crear, editar y eliminar grupos de permisos |
| `can_manage_catalogo_operacional` | Catálogos › Productos: planes, planes reguladores y los productos por registrar e ignorados |
| `can_manage_catalogo_comercial` | Catálogos › Estructura: zonas, sites, estados y las zonas por registrar e ignoradas |
| `can_manage_catalogo_ventas` | Catálogos › Ventas: directorio de ventas, unidades de negocio y objetivos comerciales |
| `can_manage_comisiones` | Comisiones: crear y cerrar periodos, revisar ventas, escribir cumplimientos; supervisores por UN y condiciones de pago |
| `can_reopen_comisiones` | Reabrir un periodo de comisiones cerrado (archiva el cierre) |
| `can_delete_comisiones` | Borrar un informe de comisiones en borrador, con lo decidido en él (no se deshace; `config/0019`, cerrado para todos) |

### Administración de cuentas: un permiso por acción y un techo

`can_manage_users` era un solo interruptor para todo, y con él cualquiera podía
darse a sí mismo —o a una cuenta cómplice— cualquier permiso. Se partió en los
seis de arriba (`config/0010` se los dio, junto con `can_view_auditoria`, a quien
lo tenía; `config/0011` lo quitó), y las vistas aplican además dos reglas:

- **Nadie concede lo que no tiene** (`permisos_fuera_de_alcance`): crear una
  cuenta, editar su matriz o guardar un grupo con un permiso que quien lo hace
  no tiene responde 403 con la lista. Lo que la matriz ya traía se puede
  quitar. Al asignar un grupo cuenta la matriz del grupo.
- **Nadie toca una cuenta con más permisos que la suya** (`puede_actuar_sobre`):
  la cuenta objetivo tiene que tener un subconjunto de los permisos de quien
  actúa; a un superusuario solo lo toca otro. La propia cuenta tampoco se
  edita, ni el propio grupo.

La pantalla recibe `editable` por usuario y grupo y `concedibles` (la matriz de
quien mira) para esconder lo que el servidor rechazaría; la comprobación real
es la del servidor.

> **Añadir un permiso** es añadir un campo booleano a `PermissionMatrix` y su
> nombre a una de las dos listas. A partir de ahí aparece solo en la interfaz de
> administración, en React (vía `InertiaShareMiddleware`) y en los decoradores.
> El espejo del lado TypeScript está en `web/src/shared/constants/permissions.ts`
> y hay que mantenerlo en paso a mano.

### `Profile` y `PermissionGroup`

Ambos heredan de `PermissionMatrix` (abstracta), así que comparten exactamente
los mismos campos.

- `Profile` cuelga de `User` (`OneToOne`, `related_name='profile'`) y tiene
  `role` (`admin` / `analyst` / `viewer`, **solo descriptivo**) y un `group`
  opcional.
- **Un perfil con grupo delega toda comprobación en el grupo**:
  `has_permission()` mira `self.group` antes que sus propios campos.
  `sync_permissions_from_group()` copia además los valores al perfil, y se
  vuelve a ejecutar sobre todos los miembros cada vez que el grupo se guarda.
- Los superusuarios de Django pasan siempre.

### Alta automática de perfil

Dos receptores de `post_save` sobre `User` crean el perfil si no existe. **El
primer usuario del sistema queda como `admin` con la matriz completa**
(`default_permissions(full_access=True)`); el resto nacen como `viewer` con la
lectura abierta y las acciones cerradas.

---

## Decoradores (`decorators.py`)

```python
from services.config.decorators import permission_required, permissions_all_required
```

| Decorador | Combinación |
|---|---|
| `permission_required(*perms)` | **OR** — basta con uno. Para endpoints que alimentan varias páginas |
| `permissions_all_required(*perms)` | **AND** — para páginas detrás de dos puertas: el permiso del módulo *y* el de la pestaña. Apagar el módulo sigue cerrando el acceso por URL directa |

### Qué recibe un usuario al que se le niega el acceso

`deny()` responde según el tipo de petición:

- **Petición de datos** (`X-Requested-With: XMLHttpRequest`, o la ruta contiene
  `/api/`) → JSON 403.
- **Navegación** → redirección a `resolve_landing_url()`, que recorre
  `LANDING_ROUTES` y devuelve **la primera página que el usuario sí pueda
  abrir**, nunca la misma URL que se acaba de denegar.
- **Sin ninguna página disponible** → 403 con un texto que dice que la cuenta no
  tiene ningún módulo asignado. Cortar ahí evita un bucle de redirecciones.

`is_ajax_or_api()` descarta primero las peticiones de Inertia
(`X-Inertia: true`): Inertia viaja sobre axios, que envía
`X-Requested-With: XMLHttpRequest` en **cada visita de página**, y sin ese
descarte una página denegada recibiría un JSON crudo y React reventaría con
*«All Inertia requests must receive a valid Inertia response»*.

> `LANDING_ROUTES` vive en `decorators.py`, no en `models.py`. Es la lista
> ordenada por prioridad de (ruta, permisos que exige).

---

## Vistas (`views.py`)

| Vista | Ruta | Notas |
|---|---|---|
| `login_view` | `/auth/login/` | Acepta JSON (Inertia/React) y formulario. Con `@ensure_csrf_cookie`. Si no hay ningún usuario, redirige a `setup` |
| `logout_view` | `/auth/logout/` | |
| `setup_view` | `/auth/setup/` | Alta del primer administrador; se cierra en cuanto existe un usuario. Exige 8 caracteres y confirmación |
| `user_management_view` | `/auth/users/` | Página Inertia `Config/Management` con usuarios, grupos y roles |

Endpoints (todos `POST`, cada uno con su permiso): crear usuario, actualizar rol,
actualizar permisos, borrar usuario, cambiar contraseña, guardar grupo, borrar
grupo, asignar grupo. Ver [11 · Endpoints](11-api-endpoints.md).

**El login** cuenta solo los intentos fallidos, por usuario (5 cada 5 min) y
por IP (20 cada 5 min), con el usuario leído del JSON o del formulario
(`netowl_web.ratelimit.usuario_login`). Antes el decorador leía `post:username`,
que con un cuerpo JSON estaba siempre vacío: todo el mundo compartía un mismo
cubo. Un anónimo solo puede escribir en login y logout, con un cuerpo de como
mucho `ANON_MAX_BODY_SIZE` (16 KB); cualquier otra escritura recibe 401 antes
de que se lea el cuerpo (`LimiteCuerpoAnonimoMiddleware`).

Dos ayudantes evitan duplicación:

- `serialize_permissions(target)` — matriz lista para React; con `None` devuelve
  **los valores por defecto del modelo**, para que la interfaz no invente
  permisos que el backend no concede.
- `apply_permissions(target, data)` — aplica el payload. Los acepta anidados en
  `"permissions"` y también en la raíz, por compatibilidad con llamadas
  antiguas.

Salvaguardas: un usuario no puede modificar sus propios permisos (salvo
superusuario) ni borrar su propia cuenta. Asignar un grupo **descarta** los
permisos individuales; quitarlo los vuelve a aceptar del payload.

---

## Sesiones por entorno

`SesionEntorno` + `services/config/sessions.py`. Hoy todo el entorno vive en su
esquema y la tabla la crea la migración de `django.contrib.sessions`; ver
[02 · Configuración](02-configuracion.md#db_schema-un-esquema-de-postgres-por-entorno).

---

## `uploads.py` — recepción de CSV

Estas dos funciones vivían duplicadas palabra por palabra en las vistas de
suscripciones y de CRM, y `services/imports` las importaba desde el módulo de
vistas de otra app. Viven aquí —y no en `core/`— porque dependen de Django:
reciben un `HttpRequest` y devuelven un `JsonResponse`.

| Función | Qué hace |
|---|---|
| `handle_csv_upload(request, required_headers=None)` | Comprueba que venga `csv_file`, que la extensión sea `.csv` y que no exceda `MAX_UPLOAD_SIZE`; lo vuelca a un temporal por trozos y valida las cabeceras. Devuelve `(ruta, None)` o `(None, respuesta_de_error)` |
| `cleanup_tempfile(ruta)` | Borra el temporal ignorando que ya no exista |

**El temporal es responsabilidad de quien llama**: las vistas de `imports` lo
cierran siempre en un `finally`.
