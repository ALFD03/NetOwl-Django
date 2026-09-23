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
| `management/commands/preparar_sesiones.py` | Crea la tabla de sesiones del esquema |

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
| `can_view_subscriptions` | Módulo de suscripciones y su dashboard |
| `can_view_crm` | Módulo CRM y su dashboard |
| `can_view_support` | Módulo de soporte y su dashboard |
| `can_view_imports` | Módulo de importaciones (puerta exterior) |
| `can_view_subs_analytics` / `..._results` / `..._lifetime` / `..._sales` | Páginas de suscripciones (Sales Report **y** Business Units usan `can_view_subs_sales`) |
| `can_view_eta` | Reporte ETA |
| `can_view_crm_analytics` / `can_view_crm_results` | Páginas de CRM |
| `can_view_support_analytics` / `can_view_support_results` | Páginas de soporte |
| `can_view_imports_subs` / `_crm` / `_support` / `can_view_import_history` | Una por pestaña de importaciones |

### Permisos de acción (cerrados por defecto)

| Permiso | Permite |
|---|---|
| `can_import_data` | **Comodín heredado** de carga de CSV |
| `can_run_calculations` | **Comodín heredado** de ejecución de análisis |
| `can_import_subs` / `can_import_crm` / `can_import_support` | Carga por módulo |
| `can_run_subs_analysis` / `can_run_crm_analysis` / `can_run_support_analysis` | Ejecución por motor |
| `can_run_lifetime` | Análisis de ciclo de vida |
| `can_manage_eta` | Parametrizar y bloquear el reporte ETA |
| `can_manage_users` | Administrar usuarios y grupos |
| `can_manage_catalogo_comercial` | Editar zonas, sites, estados y coordinadores |
| `can_manage_catalogo_operacional` | Editar planes, planes reguladores, ignorados y resolver los productos por registrar |

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
| `admin_required` / `analyst_or_admin_required` | Compatibilidad: delegan en `can_manage_users` y `can_import_data` |

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

Endpoints (todos `POST`, con `can_manage_users`): crear usuario, actualizar rol,
actualizar permisos, borrar usuario, cambiar contraseña, guardar grupo, borrar
grupo, asignar grupo. Ver [11 · Endpoints](11-api-endpoints.md).

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

`SesionEntorno` + `services/config/sessions.py` + `preparar_sesiones`. El porqué
completo está en [02 · Configuración](02-configuracion.md#sesiones-aisladas-y-por-qué-las-cookies-no-bastaban).

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
