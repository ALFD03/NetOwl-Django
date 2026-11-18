# 09 · Frontend (`frontend/src`)

> **`frontend/src/README.md` es la documentación normativa de esta capa** (reglas de
> capas, catálogo de UI, tokens de diseño y la discrepancia intencionada del KPI
> comercial). Este documento es el **inventario** y el **contrato con el
> backend**: qué hay, dónde, y cómo llega el dato.

## Stack

React 18 + TypeScript + Vite + Tailwind + Chart.js, como **SPA** (React Router +
TanStack Query) sobre la API `/api/`.

Dependencias notables: `react-router-dom`, `@tanstack/react-query`, `axios`,
`chart.js` + `react-chartjs-2` + `chartjs-plugin-datalabels`, `framer-motion`,
`lucide-react`, `clsx` + `tailwind-merge`, `write-excel-file`.

## Arranque

```
backend/templates/app.html   ← la única plantilla Django: <div id="app">
   ├─ meta csrf-token y csrf-cookie-name (el nombre de la cookie cambia por entorno)
   ├─ script en línea: pone `light`/`dark` en <html> antes de pintar (clave `netowl-tema`)
   ├─ dev:  http://localhost:5173/static/src/app/main.tsx  (+ react-refresh)
   └─ prod: {% static 'dist/assets/main.js' %} y main.css
             └─ frontend/src/app/main.tsx   (estilos globales y registro de Chart.js)
                  └─ app/spa.tsx
                       ├─ ThemeProvider
                       ├─ QueryClientProvider  (app/queryClient.ts)
                       ├─ AuthProvider         (GET /api/auth/me/)
                       └─ RouterProvider       (app/routes.tsx, una ruta lazy por página)
```

Cada ruta de página de Django (`page(*perms)` en `services/config/pages.py`) sirve
esa plantilla tras comprobar sesión y permiso; lo demás lo resuelve la SPA. Una
ruta que no está en `routes.tsx` (`/`, la raíz de un módulo) se abre con carga
completa y Django redirige a la primera página permitida.

### Cómo llega el dato a una página

`apiPage(endpoint, cargar)` (`app/apiPage.tsx`) monta la página con lo que
devuelve su endpoint como props, dentro de `AppLayout` mientras carga o si falla:

- Los parámetros de la URL (`?period=`, `?day=` y los de ruta como `:period`)
  viajan tal cual al endpoint.
- `useVisit()` cambia esos parámetros (cambiar de mes): se vuelve a pedir con
  `keepPreviousData`, sin desmontar la página, que conserva su estado.
- `remount: true` en `useVisit()` monta la página de nuevo, sin su estado, cuando
  llegan los datos (cambiar de periodo en Comisiones, volver tras borrar uno).
- Nada se recarga a mano: toda escritura correcta a `/api/` y todo análisis que
  termina (en esta pestaña o en otra) avisan con `notifyDataChanged()`; la SPA
  invalida la caché y lo que está en pantalla se vuelve a pedir conservando su
  estado. `useDayPayload` vacía su caché de días con el mismo aviso.
- El resultado de una escritura (error al guardar, aviso de éxito) se pinta con
  `ActionMessage`: si hay un modal abierto aparece arriba de él, si no, en la
  página. Nunca `alert()`. `useOnOpen(abierto, () => setError(null))` limpia el
  error anterior al abrir un formulario.
- `usePageProps()` lee los datos de la página desde cualquier componente (los
  objetivos de Subscriptions, por ejemplo).

Un 401 fuera del login (sesión caducada) lleva a `/auth/login/?next=` desde el
interceptor de `shared/lib/api/client.ts`.

### Añadir una página

1. En Django, la ruta de página en el `urls.py` del módulo con `page(...)`, y el
   endpoint de sus datos en su `api_urls.py` con `@endpoint`.
2. En `app/routes.tsx`, la ruta con `apiPage('/api/…', () => import('@/pages/…'))`
   (o `page(...)` si la página pide sus datos por su cuenta).
3. En `shared/constants/navigation.ts`, su entrada en el menú.

| Ruta | Endpoint de datos | Fichero |
|---|---|---|
| `/auth/login/` | — | `pages/Config/Login.tsx` |
| `/auth/users/` | `/api/auth/users/` | `pages/Config/Management.tsx` |
| `/auth/tokens/` | `/api/auth/tokens/` (en la vista) | `pages/Config/Tokens.tsx` |
| `/subscriptions/dashboard/` | `/api/subscriptions/dashboard/` | `pages/Subscriptions/Dashboard.tsx` |
| `/subscriptions/analytics/` | `/api/subscriptions/analytics/` | `pages/Subscriptions/Analytics.tsx` |
| `/subscriptions/results/[<periodo>/]` | `/api/subscriptions/results/` | `pages/Subscriptions/Results.tsx` |
| `/subscriptions/lifetime/` | `/api/subscriptions/lifetime/` | `pages/Subscriptions/Lifetime.tsx` |
| `/subscriptions/sales-report/` | `/api/subscriptions/sales-report/` | `pages/Subscriptions/SalesReport.tsx` |
| `/subscriptions/business-units/` | `/api/subscriptions/business-units/` | `pages/Subscriptions/BusinessUnits.tsx` |
| `/subscriptions/eta-report/` | `/api/subscriptions/eta-report/` | `pages/Subscriptions/EtaReport.tsx` |
| `/subscriptions/eta-report/config/` | `/api/subscriptions/eta-report/config/` | `pages/Subscriptions/EtaManagement.tsx` |
| `/crm/dashboard|analytics|results/` | `/api/crm/…` | `pages/CRM/*.tsx` |
| `/support/dashboard|analytics|results|users/` | `/api/support/…` | `pages/Support/*.tsx` |
| `/support/etapas/` | `/api/support/stages/` | `pages/Support/Stages.tsx` |
| `/imports/subscriptions|crm|support|history/` | `/api/imports/…` | `pages/Imports/*.tsx` |
| `/catalogos/notificaciones|productos|estructura|ventas/` | `/api/catalogs/notifications|products|structure|sales/` | `pages/Catalogs/*.tsx` |
| `/comisiones/` | `/api/commissions/report/` | `pages/Commissions/Report.tsx` |
| `/comisiones/condiciones/` | `/api/commissions/conditions/` | `pages/Commissions/Conditions.tsx` |
| `/auditoria/` | `/api/audit/logs/` | `pages/Audit/Log.tsx` |
| `/auditoria/monitoreo/` | `/api/audit/health/` y `/api/audit/stats/` (en la vista) | `pages/Audit/Monitoring.tsx` |

---

## Las tres reglas (resumen)

1. **`pages/` son cascarones** sin lógica: reciben los datos del endpoint y eligen
   layout, cabecera y una vista de feature.
2. **La dependencia va en un solo sentido: `pages → features → shared`.**
   `shared/` nunca importa de `features/`; si necesita un tipo de un dominio, ese
   tipo pertenece a `shared/types`. Los features no se importan entre sí.
3. **Nada de componentes de un solo uso.** Antes de escribir marcado se mira
   `shared/ui`; si es una variante, se añade una prop.

Detalles de estilo: se compone con `cn()` (clsx + tailwind-merge, para que el
`className` del llamador pueda **sobrescribir** una clase base), los colores solo
salen de `shared/constants/design-tokens.json`, y las clases dinámicas deben
venir de un mapa escrito a mano porque **Tailwind no ve nombres interpolados**.

---

## `app/`

| Fichero | Contenido |
|---|---|
| `main.tsx` | Estilos globales, registro de Chart.js y arranque |
| `spa.tsx` | Proveedores y router |
| `routes.tsx` | Rutas de la SPA, cada una con su endpoint de datos |
| `apiPage.tsx` | `apiPage()` / `page()`: el `lazy` de cada ruta |
| `queryClient.ts` | Caché de datos; no reintenta 4xx |

---

## `shared/`

### `lib/http`

- **`csrf.ts`** — lee el token **de la cookie primero** y del meta como
  respaldo: el meta queda congelado con el valor que tenía la página al
  renderizarse, y si el token rota después (otro login, otra pestaña) enviar el
  viejo produce un 403. El **nombre** de la cookie se lee del meta
  `csrf-cookie-name` porque cambia por entorno. Se pone la cabecera
  `X-CSRFToken` **explícitamente** en un interceptor: el mecanismo
  `xsrfCookieName` de axios solo actúa bajo ciertas condiciones de origen y
  credenciales.
- **`errors.ts`** — `extractApiError(error, fallback)` normaliza cualquier fallo
  a `{message, logOutput}`, y `JobFailedError` representa un análisis que
  terminó con `status: error` en el worker (la llamada HTTP fue bien, así que no
  hay error de axios que leer).

### `lib/api`

Un módulo por dominio (`config`, `crm`, `imports`, `jobs`, `subscriptions`,
`support`) sobre `apiClient`. Los tipos de respuesta viven en `shared/types`,
porque `shared` no puede depender de un feature; los features los reexportan.

**`jobs.ts` es el corazón del seguimiento de análisis:**

| Símbolo | Qué hace |
|---|---|
| `jobsApi.fetch(id)` / `.queue()` / `.active(module)` | Los tres endpoints de `imports` |
| `followJob(job, onProgress)` | Sondea cada **2 s** hasta que termina; **un fallo puntual del sondeo no se toma como muerte del análisis**, se reintenta en el siguiente ciclo. Al acabar en error lanza `JobFailedError` |
| `startAndFollow(path, body, onProgress)` | Lanza y espera. **Un 409 no es un error para el usuario**: es el mismo trabajo, así que se engancha al job que venía en la respuesta |

### `hooks`

| Hook | Qué hace |
|---|---|
| `useAuth()` (`shared/auth/AuthContext`) | La cuenta actual (`CurrentUser`, forma de `/api/auth/me/`), `login`, `logout` |
| `usePermissions()` | `can`, `canAny`, `canAll`, `isSuperuser`, sobre `useAuth()`. **Los componentes nunca leen la matriz directamente** |
| `useBreakpoint(bp)` | `true` si el viewport llega a ese breakpoint. Para lo que una clase no alcanza (opciones de Chart.js); para maquetar se usan las clases |
| `useScrollLock(activo)` | Congela el scroll del body y de `<main data-app-scroll>` mientras un modal o el cajón del menú tapan la página |
| `useTheme()` / `ThemeProvider` | Tema `claro`/`oscuro`/`sistema` por navegador (`localStorage`, `netowl-tema`); `sistema` sigue a `prefers-color-scheme`. Cómo cambian las clases y las gráficas: `frontend/src/README.md`, «Light and dark theme» |
| `useAsyncAction(action, options)` | Sustituye el triplete `isLoading` / `message` / `consoleLog` y el *narrowing* de errores de axios que cada página de importación repetía |
| `useJobQueue()` | Sondea la cola desde cualquier página: **4 s** si hay algo corriendo, **20 s** si no, y también 20 s con la pestaña en segundo plano. Detecta el final comparando los ids con el sondeo anterior y pide la ficha del que desapareció, para poder decir *cómo* terminó y no solo que «ya no está» |

### `layout` y `navigation`

- **`AppLayout`** — navegación + `<main>` con el scroll (es lo que convierte la
  barra superior en un `sticky` real), la zona `toolbar` y
  **`AnalysisQueueAlert`** montado siempre. Cambia de forma en `lg`: desde ahí
  sidebar fijo (plegable a iconos, recordado en `localStorage`) y `toolbar`
  pegajosa; por debajo, `MobileTopBar` con hamburguesa que abre
  `MobileNavDrawer` y la `toolbar` deja de ser fija. Las reglas de cada
  breakpoint están en `frontend/src/README.md` («Phones and breakpoints»).
- **`Sidebar`** — **la única navegación de la app**: un árbol de módulos y sus
  páginas, agrupadas por `section` (Reportes, Configuración). Los módulos
  desplegados se recuerdan en `localStorage`, y el de la página actual llega
  siempre abierto. Plegado a iconos, cada módulo abre sus páginas en un panel al
  pasar por encima o al llegar con el teclado. `SidebarContent` es un solo
  contenido (logo, árbol, pie de usuario) montado en dos marcos: `Sidebar`
  (desde `lg`) y `MobileNavDrawer`.
- **Ruta de migas** — es el encabezado de toda página de un módulo: `AppLayout`
  pinta «Módulo › Página», resuelta de la URL con `resolveLocation`. Las páginas
  no llevan título ni declaran dónde están. `subpagina` añade un tercer tramo a
  una subruta (Reporte ETA › Maestro de planes); `title` queda solo para las
  pantallas fuera del registro (la gestión de usuarios).
- **`AnalysisQueueAlert`** — el aviso flotante que sigue la cola. Vive en
  `shared/layout` y no en `features/imports` porque lo monta `AppLayout` y
  **shared no puede importar de features**. No pinta nada si la cola está vacía.

### `constants`

| Fichero | Contenido |
|---|---|
| `navigation.ts` | `APP_NAVIGATION`: los módulos y sus páginas. `visibleNavigation(can)` filtra por permisos y oculta el módulo sin ninguna página visible (la misma resolución que hace `/imports/` en el servidor); `resolveLocation(url)` da el módulo y la página de una URL (gana el `href` que sea el prefijo más largo, así `eta-report/config/` cuelga de Reporte ETA) |
| `permissions.ts` | `PERMISSIONS` — **espejo manual** de `PERMISSION_FIELDS` del backend. También `IMPORT_ACTION_PERMISSIONS` y `ANALYSIS_ACTION_PERMISSIONS`, los pares granular + comodín |
| `design-tokens.json` | **La única fuente de color y de breakpoints** (`screens`), leída por `tailwind.config.js` (Node) y por `shared/constants/theme` y `breakpoints` (TS) |
| `breakpoints.ts` | `BREAKPOINTS` y `mediaFrom(bp)`, con el papel de cada breakpoint. Lo usa `useBreakpoint(bp)` (`shared/hooks`) |
| `labels.ts` | Etiquetas legibles de dimensiones y etapas |

Los tokens dan `surface.*`, `brand.*`, `metric.*` (slate, green, red, blue,
yellow, purple), `chartPalette` (11 colores) y `chart.*` (`CHART_CHROME`: ejes,
rejilla, tooltips y el trazo tras las etiquetas). **Nunca se escribe un hex en un
componente**; ESLint no lo detecta, pero un `grep` de `#` bajo `src/` debería
salir vacío fuera del fichero de tokens.

### `ui/` — el kit

Agrupado por tipo, todo se importa desde el barril `@/shared/ui`:

| Grupo | Componentes |
|---|---|
| `primitives/` | `Button`, `ExportButton`, `ProgressBar`, `PulseDot`, `SectionHeading` |
| `surfaces/` | `Panel`, `NeonContainer`, `Modal`, `AuthCard` |
| `data/` | `DataTable`, `StatGroup`, `SummaryStrip`, `MilestoneTimeline`, `StickyLabel`, `ExcelExportButton`, `tableClasses` |
| `inputs/` | `TextField`, `SelectMenu`, `SearchInput`, `ToggleGroup`, `MonthPicker`, `PeriodSelector`, `DayProgressBar`, `FileUploadZone`, `useAnchoredPanel` |
| `metrics/` | `MetricCard`, `StatTile`, `CompactMetric`, `MetricGroup`, `SparklineCard`, `MiniExceedRing`, `EquidistantTimeline` |
| `feedback/` | `EmptyState`, `LoadingState`, `StatusMessage`, `ActionMessage`, `ConsoleOutput` |
| `theme/` | `metricTheme` y las uniones a las que va indexado |

`SelectMenu` es el único desplegable de la aplicación, y con siete opciones o más
lleva buscador (se fuerza con `searchable`): filtra sin distinguir mayúsculas ni
tildes, se maneja con flechas y Enter —sin enviar el formulario— y Escape cierra
solo la lista, no el modal que la contiene.

`tableClasses` cubre el caso contrario a `DataTable`: una tabla que solo muestra,
con cabecera pegajosa, montada a mano por varias vistas.

`ExportButton` es la forma que tiene descargar algo en toda la aplicación: la
cápsula de la barra de filtros, el icono en color de marca y los cuatro estados
—reposo, escribiendo, sin nada que exportar, falló— dichos en el propio botón y
no solo en el banner de al lado. Se hizo componente porque exportar era un
`Button variant="secondary"` repetido en tres sitios: el botón que escribe un
archivo se veía igual que el que abre un panel, y cada copia lo reinterpretaba
un poco distinto. Lo usan `ExcelExportButton` (filas de una tabla),
`ChurnExportButton` (las pide al servidor, y tiene variante de solo icono para
las celdas) y `EtaFormsExportButton`, que además lleva pegado el selector de
tasa con el que convierte las rentas. Quien lo monta dentro de otra cápsula
pasa `seamless` para que no ponga borde ni radio propios.

### `charts/` y `utils/`

`BarChart`, `LineChart`, `DoughnutChart` envuelven Chart.js; `chartOptions.ts`
centraliza las opciones y `plugins.ts` el texto central del *doughnut*.
`register.ts` registra los controladores una sola vez en el arranque.

`utils/distribution.ts` concentra el cálculo de distribuciones y rankings
(simple, ponderada, agrupando los menores) y su conversión a datos de gráfico.
`formatters/` tiene `toNumber`, `formatInteger`, `formatOneDecimal`,
`formatTwoDecimals`, `formatPercentage` y `formatPeriodLabel`.

`lib/excel.ts` exporta a `.xlsx` **en el navegador**: el libro se construye con
las filas que la vista ya tiene, así que exportar no cuesta una vuelta al
servidor y siempre coincide con lo que hay en pantalla. El escritor se carga con
`import()` dinámico, para que no entre en el bundle inicial.

---

## `features/`

### `imports`

| Pieza | Qué es |
|---|---|
| `CsvUploadCard` | Zona de subida + estado, compuesta sobre `useAsyncAction` |
| `AnalysisRunnerCard` | Selector de mes, botón, barra de progreso y consola. Usa `startAndFollow` y se reengancha a un job vivo con `jobsApi.active` |
| `RequirementsCard` | El texto de requisitos del CSV |
| `ImportHistoryView` | La tabla del historial |
| `CatalogBlockModal` | Se abre cuando la subida devuelve 409 de catálogo |
| `lib/catalog.ts` | `extractCatalogBlock(error)` |

`extractCatalogBlock` mira **`status: 'catalog'` en el cuerpo y no solo el
código HTTP**: un 409 también lo devuelve un catálogo vacío, que es un problema
de configuración distinto y se enseña como un error normal.

El modal ofrece las dos respuestas que el servidor no puede distinguir:
**registrar el producto como plan** (enlaza a
`/catalogos/productos/?new_plan=…`) o **marcarlo como ignorado** (POST a
`/api/catalogs/save/` con `kind: 'ignorados'` y `area: 'productos'`). Cuando aparece **no se escribió
nada**: la comprobación corre antes del truncate.

### `subscriptions`

Vistas: `SubscriptionResultsView`, `SubscriptionPeriodDetail`, `LifetimeView`,
`SalesReportView`, `BusinessUnitsView`, `NodePerformanceTable`,
`CommercialSummaryStrip`, `SubscriptionReportFilters`, `EtaReportView`,
`EtaReportToolbar`, `EtaSpeedTable`, `EtaManagementView`, `CatalogosView`, y los
bloques de `analytics/` y `dashboard/`.

Hooks: `useSubscriptionDashboard`, `useSubscriptionsAnalyticsData`,
`useSubscriptionResults`, `useSubscriptionEtaReport`, `useEtaManagement`,
`useSalesReportData`, `useBusinessUnitsData`, `useDayMetrics`, `useCatalogs`.

`lib/`:

- **`commercial.ts`** — `calcCommercial`. **Los cumplimientos no se recortan**:
  Sales Report y Business Units enseñan el valor real, también por encima del
  100 % y por debajo de 0 (y el faltante negativo, que es lo que sobra). Sales
  Report los recortaba a `[0, 100]`; se quitó a petición del usuario. Solo el
  ancho de las barras se detiene en 100 %.
- `dayReports.ts` — reagrupa en cliente el payload del día elegido en
  `buildSalesSites` y `buildBusinessUnitGroups`, usando `zonesConfig`. Es lo que
  hace que mover la barra de días no dispare ninguna petición.
- `analyticsDistribution.ts`, `formClasses.ts`.

### `crm`

Vistas de dashboard, analytics (filtros, gráficos, tabla, sección de tiempos por
etapa) y results. Hooks `useCrmDashboard`, `useCrmAnalytics`, `useCrmStageTime`,
`useCrmPeriodDimensions`. En `lib/`, `crmStageTime.ts` es el más denso: compone
las tarjetas y las filas dimensionales de tiempo por etapa a partir del JSON que
manda el backend.

### `support`

Vistas de dashboard, analytics (filtros, panel dimensional, resumen por grupo,
tabla de incidencia, modal de drill-down) y results. `lib/supportMetrics.ts`
concentra la lectura de los bloques de métricas y las etiquetas de las medidas
(`CLOSE_TOTAL`, `HANDLING`, `ASIGNACION`).

### `config`

`AuthForm` y `ManagementView` (con `UsersTable`, `GroupsGrid` y
`PermissionEditor`).

---

## Cómo llega el dato

| Caso | Camino |
|---|---|
| Carga inicial de una página | El GET de su endpoint (`apiPage`), con la URL de la página como parámetros |
| Cambio de periodo / dimensión / día | **En cliente**, sobre los props que ya llegaron (`dayMetrics`, `dimensionsData`, `zonesConfig`) |
| Cambio de mes | `useVisit()`: nueva URL, nuevo GET del endpoint, la página sigue montada |
| Drill-down puntual | Su endpoint de `/api/` desde `shared/lib/api` |
| Lanzar un análisis | `startAndFollow` → 202 → sondeo de `/api/imports/jobs/<id>/` |
| Cola de análisis | `useJobQueue` → `/api/imports/jobs/queue/` desde cualquier página |
| Exportar | `.xlsx` generado en el navegador |

## Añadir un módulo

1. Añadir su entrada, con sus `pages`, a `APP_NAVIGATION` en
   `shared/constants/navigation.ts`. El sidebar y la ruta de migas salen de ahí;
   no hay nada más que registrar.
2. Crear `features/<module>/` con `types.ts`, `hooks/`, `components/` e
   `index.ts`.
3. Crear las páginas bajo `pages/<Module>/` y registrarlas en `app/routes.tsx`
   con su endpoint (ver «Añadir una página»).
4. Si trae permisos nuevos, añadirlos al backend (`services/config/models.py`) y
   al espejo `shared/constants/permissions.ts`.
