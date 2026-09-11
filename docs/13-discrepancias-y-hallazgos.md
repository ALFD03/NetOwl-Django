# 13 · Discrepancias y hallazgos

Recogido al documentar el árbol de trabajo. Se separan tres cosas: lo que la
**documentación previa dice y el código no hace**, los **defectos latentes** y
las **fragilidades conocidas**. Nada de esto se ha modificado: es un inventario
para decidir.

---

## A. `CLAUDE.md` describe funcionalidad que no está en el código

`CLAUDE.md` dedica una sección larga —«The close of the month stores the plan it
had»— a un mecanismo completo que **no existe en el árbol actual**. Lo
comprobado, punto por punto:

| Lo que dice `CLAUDE.md` | Estado real |
|---|---|
| «`MetricsAnalyzer.persist` ahora escribe `producto` con el cierre» | `analyzer.py:301` guarda `act_fin[["orden", "f_dt", "estado"]]`. **No hay columna `producto`** |
| `_planes_al_cierre`, `plan_historico` | No existen |
| `ActivosConPlanCancelado` | No existe |
| `analyzer_planes_conocidos` y `_registrar_planes_vistos` | Ni la tabla en `TableNames` ni la función en `imports.py` |
| `analyzer_cierre_planes` y `analytics/cierre_planes.py` | El módulo no existe. Solo queda un `.pyc` huérfano en `analytics/__pycache__/cierre_planes.cpython-314.pyc` |
| `analyzer_cierre_pendientes`, `guardar_pendientes`, `pendientes_del_cierre` | No existen |
| Endpoints `api_cierre_pendientes` y `api_cierre_importar_planes` | No están en `urls.py` ni en las vistas |
| «leer la subida necesita `openpyxl`, que por eso está en `requirements.txt`» | **`openpyxl` no está en `requirements.txt`** |
| `onRunFailed` en la tarjeta de importaciones | No aparece en `web/src` |
| «`scripts/sesiones.py` lista las sesiones vivas del entorno» | **El fichero no existe**; `scripts/` solo contiene `dev.sh` |

**Lectura probable:** o esa funcionalidad se revirtió, o `CLAUDE.md` se escribió
por delante de la implementación. Los `.pyc` huérfanos apuntan a lo primero: el
módulo llegó a existir e importarse.

**Consecuencia práctica que sí está viva:** hoy el reporte ETA lee el plan de la
tabla de suscripciones —**la de hoy**— para los activos de un cierre antiguo
(`eta_report.py`, cruce con `subscriptions` y respaldo en `subscriptions-b`).
Una suscripción activa en enero y cancelada en marzo llega al reporte de enero
con el plan que tiene hoy, que es exactamente el problema que aquella sección
describía. Conviene decidir si se reimplanta o si se borra la sección de
`CLAUDE.md`.

### Otras imprecisiones menores de la documentación previa

- `CLAUDE.md` describe los catálogos como «cinco tablas» en algunos puntos y
  seis en otros; hoy son **seis** modelos (`Estado`, `Site`, `Coordinador`,
  `Zona`, `Plan`, `ProductoIgnorado`).
- El docstring de `_load_zone_info` (`services/support/analytics/queries.py`)
  dice «desde `Zonas.json`», pero lee `fixtures.zonas_por_nombre()`, es decir, la
  tabla del catálogo. *(Corregido en la pasada de docstrings.)*
- Varios encabezados conservan rutas de la estructura anterior
  (`# --- START OF FILE NetOwl-Django/frontend/config/decorators.py ---`,
  `# backend/support/loader.py`), que ya no existen.

---

## B. Defectos latentes

### B1 · Import inexistente en el cargador de CRM

`services/crm/analytics/loader.py:69`

```python
from ..utils import normalize_text
```

`services/crm/utils.py` **no existe**: el paquete `services.crm` solo tiene
`analytics/`, `apps.py`, `urls.py` y `views.py`. La línea vive dentro de
`map_stage_canonically`, en la rama final a la que solo se llega cuando el
nombre de la etapa **no** está en `ETAPA_MAP` **y** no empieza por un número.

- **Impacto:** `ModuleNotFoundError` en mitad de una importación de CRM, con
  todo lo anterior ya escrito en las tablas (que se truncan al empezar).
- **Probabilidad:** baja mientras Odoo exporte las etapas con su nombre completo
  o numeradas; alta el día que alguien renombre una etapa en Odoo.
- **Arreglo:** `from core.utils import normalize_text` —la misma función que usa
  el resto del proyecto— y subirlo a la cabecera del módulo.

### B2 · `subscriptions-logs-v15` se lee y nadie la escribe

`analyzer/loader.py:33` y `lifetime/loader.py:41` leen esa tabla, pero **ninguna
ruta de la aplicación la crea ni la rellena**: es un remanente del formato
antiguo, cargado por fuera.

La diferencia entre los dos lectores importa:

| Lector | Comportamiento si la tabla falta |
|---|---|
| `lifetime/loader.py` | Envuelto en `try/except`: registra y sigue con un DataFrame vacío |
| `analyzer/loader.py` | **Sin protección**: `read_table` levanta y el análisis mensual completo falla |

En un entorno nuevo, donde esa tabla nunca se creó, **el análisis mensual no
puede llegar a ejecutarse**. Merece el mismo `try/except` que el otro, o una
comprobación con `db.tabla_existe()`.

### B3 · Los loggers `frontend` y `backend` no los usa nadie

`settings.LOGGING` configura dos loggers con nombre —`frontend` y `backend`— con
su manejador a `logs/app.log` y a consola. Pero **los veinte módulos que crean un
logger usan `logging.getLogger(__name__)`**, cuyos nombres empiezan por
`services.` o `core.`, así que no caen bajo ninguno de los dos: propagan al
logger raíz, que no tiene manejador configurado.

En la práctica, los `logger.exception(...)` del código propio **no llegan a
`logs/app.log`**, que es justo lo que esa configuración pretendía arreglar.

Arreglo mínimo: renombrar los dos loggers a `services` y `core`, o añadir una
entrada `"": {...}` para el raíz.

---

## C. Fragilidades conocidas (por diseño, pero hay que saberlas)

1. **Renombrar un fichero de `pages/` rompe la vista en tiempo de ejecución**, sin
   error de compilación. El nombre que pasa `render_inertia` es la ruta del
   fichero.
2. **La ordenación `["orden", "f_dt"]` del frame de logs es una invariante.**
   `last_log_per_orden` y `EstadoAcumulado` dependen de ella; cambiarla rompe las
   dos en silencio, devolviendo métricas plausibles pero incorrectas.
3. **El espejo de permisos es manual.** `PERMISSION_FIELDS` (backend) y
   `PERMISSIONS` (`web/src/shared/constants/permissions.ts`) hay que mantenerlos
   en paso a mano; nada lo comprueba.
4. **Todas las columnas de las tablas dinámicas son `text`.** Una comparación o
   un `ORDER BY` directos en SQL ordenan alfabéticamente.
5. **Las tablas de origen no son un histórico**: cada importación las trunca. Lo
   que haya que conservar de un mes debe estar en una tabla de resultado antes de
   la siguiente carga.
6. **Las permanencias de CRM envejecen.** Las estancias sin cerrar se miden
   contra `ahora`, así que **reanalizar un mes antiguo no devuelve el mismo
   número** que la vez anterior. Es deliberado, pero sorprende al comparar.
7. **La discrepancia comercial es intencionada.** `calcComercial` recorta
   `tasaCumplimiento` a `[0, 100]` en Sales Report y no en Business Units.
   Unificarlo cambia KPIs mostrados: es una decisión de producto.
8. **`analyzer_eta_config_planes` sigue en la base de datos**, vacía y sin leer.
   Su nombre se conserva en `TableNames` solo para poder identificarla.
9. **`data/Planes.json` y `data/Zonas.json` ya no son la fuente**: solo los lee
   `manage.py cargar_catalogos`. Editarlos no cambia nada en una instalación ya
   sembrada.
10. **`vite.config.ts` usa `strictPort`** porque `app.html` apunta a
    `localhost:5173` de forma fija: arrancar en otro puerto serviría 404
    silenciosos.

---

## D. Sugerencias, por orden de coste/beneficio

| # | Acción | Coste |
|---|---|---|
| 1 | Corregir B1 (`from core.utils import normalize_text`) | Minutos |
| 2 | Proteger B2 con `try/except` o `tabla_existe()` en `analyzer/loader.py` | Minutos |
| 3 | Corregir B3 renombrando los loggers de `settings.LOGGING` | Minutos |
| 4 | Decidir sobre A: reimplantar el histórico de plan al cierre, o borrar esa sección de `CLAUDE.md` | Horas o días |
| 5 | Añadir una comprobación automática del espejo de permisos backend↔frontend | Horas |
| 6 | Borrar los `.pyc` huérfanos de módulos que ya no existen | Minutos |
