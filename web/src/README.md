# Frontend architecture

React + TypeScript + Inertia, served by Django. Tailwind for styling, Chart.js for charts.

> El inventario de esta capa —paginas, features, kit compartido y como llega el
> dato— esta en `docs/09-frontend.md`. Este documento sigue siendo el normativo:
> las reglas de capas, el catalogo de UI y los tokens se deciden aqui.

## Layout

```
src/
├── app/          Bootstrap only: main.tsx, csrf
├── shared/       Reusable across every module. Knows nothing about any feature.
│   ├── ui/       The component kit, grouped by kind (see below)
│   ├── layout/   AppLayout, Sidebar (the navigation tree), UserMenu
│   ├── charts/   Chart.js wrappers, shared options, registration
│   ├── lib/      cn(), colour helpers, api client, http error handling, daySeries
│   ├── hooks/    usePermissions, useAsyncAction, useJobQueue, useDayCuts, useDayPayload, useTheme
│   ├── utils/    formatters
│   ├── constants/  navigation registry, permissions, design tokens
│   └── types/    cross-cutting types only
├── features/     Domain logic, one folder per module
│   └── <module>/{components,hooks,types.ts,index.ts}
└── pages/        Inertia entry points — thin shells, nothing else
```

## The day bar

All three Analytics pages have one, and **moving it never waits on the server**.
What the bar changes comes from two places, split by weight.

**The light half — always instant, in every module.** `dayMetrics.serie` carries
the global metric block of all 31 days (a few KB; the backend cuts it out of the
row with `-> 'global'`). From it, `shared/lib/daySeries` derives what the new
`DaySummary` block draws: what happened *that* day, what the month has
accumulated up to it, and how it compares with the previous computed day. Each
module declares its metrics in a `*DaySummary.ts` spec, and the `kind` there
(`flujo`, `stock`, `tasa`) is load-bearing — it says whether subtracting two days
means anything. Subscriptions builds the same series out of the month it already
receives.

**The heavy half — the dimensional breakdown.**

- **Subscriptions** gets the whole month in its props (`dayMetrics.dias`) and
  `features/subscriptions/hooks/useDayMetrics` picks a day out of it. Its
  breakdowns are small enough to travel.
- **CRM and Support** cannot: one of their days already carries the full metric
  block of every seller, branch, work group or zone. `shared/hooks/useDayPayload`
  serves it from an in-memory cache — a visited day repaints with no request, the
  neighbours are prefetched while the bar sits still, the last resolved day stays
  on screen while a new one travels, and the cache is capped because holding the
  whole month is the original problem. `shared/hooks/useDayCuts` owns the
  selected day and writes `?dia=` into the URL with `replaceState`, so a reload
  lands where you were without costing a visit.

Nothing on either half recomputes anything: every cut was written by the monthly
analysis. `shared/ui/inputs/DayProgressBar` is the same component in all three.

## The three rules

**1. `pages/` is a contract with Django.**
Django views name their component as a string (`inertia_render(request, "CRM/Dashboard")`),
and `app/main.tsx` resolves it against `import.meta.glob('../pages/**/*.tsx')`. A page file's
path is therefore fixed — renaming or moving one breaks the backend silently, at runtime.

Pages hold no logic. A page picks a layout and a feature view. It has no title: the
heading is the breadcrumb ("Module › Page"), derived from the URL, so the page declares
nothing about where it sits:

```tsx
export default function CrmDashboard(props: CrmDashboardProps) {
  const data = useCrmDashboard(props);
  return (
    <AppLayout>
      <CrmDashboardView data={data} />
    </AppLayout>
  );
}
```

**2. Dependencies point one way: `pages → features → shared`.**
`shared/` must never import from `features/` or `pages/`. If shared code needs a type
from a feature, the type belongs in `shared/types` instead. Features should not import
each other; promote the common part to `shared/`.

**3. No one-off components.**
Before writing markup, check `shared/ui`. If the thing you need is a variant of something
there, add a prop. If it's genuinely new but not domain-specific, add it to `shared/ui`.
Only compositions that mention a domain concept belong in `features/<module>/components`,
and those should be assembled from shared parts rather than raw `<div>`s.

Concretely, these already exist — do not re-inline them:

| Need | Use |
| --- | --- |
| Framed neutral box | `Panel` |
| Accent/gradient dashboard card | `NeonContainer` |
| Full-screen auth card | `AuthCard` |
| Label + value readout | `StatTile` |
| Row of headline figures | `SummaryStrip` |
| Titled cluster of compact metrics | `MetricGroup` |
| Ordered checkpoints on a rail | `MilestoneTimeline` |
| Accent-ruled section title | `SectionHeading` |
| "Nothing to show" / blocking state | `EmptyState` (`tone="warning"`) |
| Pending region | `LoadingState` |
| Form/action result banner | `StatusMessage` |
| Server execution log | `ConsoleOutput` |
| Labelled input with leading icon | `TextField` |
| Segmented view switch | `ToggleGroup` |
| On/off boolean, labelled | `Switch` |
| Filter capsule (label cap + control) | `FilterField` |
| Sortable/searchable/filterable table | `DataTable` |
| Download button (any file) | `ExportButton` |

**Filters look the way they look in Sales Report and Business Units**, and that
is not a convention but a component: `FilterField` is the capsule — a dark cap
naming *what* is being filtered, and flush against it the control saying *by
which value*. Put a `SelectMenu` inside with `FILTER_TRIGGER_CLASS`, a
`SearchInput` with `grow`, or a field of your own. It used to be copied into
`PeriodSelector` and three times into `SubscriptionReportFilters`, and every
new copy reinterpreted it slightly worse.

**Every dropdown is a `SelectMenu`, and long ones search.** From seven options up
it grows a search box on its own (`searchable` forces it either way): typing
filters case- and accent-insensitively, the arrows move the highlighted option,
Enter picks it without submitting the surrounding form, and Escape closes only
the list, not the modal around it. With the trigger focused, just typing opens
it already searching. Don't build a second combobox — pass the options to this
one.

**Anything that writes a file downloads through `ExportButton`.** It carries the
shape — the filter capsule, the brand-tinted icon — and the four states, said in
the button itself: idle, writing, nothing to export, failed. Exporting used to be
`Button variant="secondary"` in three places, which made the button that writes a
file look like the one that opens a panel, and each copy drifted. `ExcelExportButton`
(rows already on the page), `BajasExportButton` (fetches them, and has an icon-only
variant for table cells) and `EtaFormsExportButton` (with its rate selector welded
to its right) are all the same button underneath. Mounting it inside another capsule
takes `seamless`, so it doesn't draw a border of its own.

`DataTable` is the *only* table. Free-text search, click-to-sort and per-column
filters live in it, so a screen that hand-rolls `<table>` markup silently loses
all three — which is exactly what had happened to the ETA master screen. Mark a
column `filterable` to get a dropdown whose options are derived from the data;
add `filterValue` when the cell is rendered by a function and the raw field is
not what the reader would pick from a list (a boolean shown as `Sí`/`—` filters
as `Sí`/`No`, not `true`/`false`).

Import from the barrel (`@/shared/ui`), not the file. Components are function
declarations, never `React.FC`; only files under `pages/` use a default export.

## Styling

Class names are composed with `cn()` from `@/shared/lib/cn` — it merges conditional
classes and lets a caller's `className` actually override a base class, which plain
template strings cannot do.

Colours come from `shared/constants/design-tokens.json`, which is the single source
for both `tailwind.config.js` and the TypeScript side:

- In markup, use the generated class: `bg-surface-primary`, `text-brand`.
- On a canvas or an inline `style` (Chart.js, SVG), import the token:
  `import { SURFACE, METRIC_COLOR } from '@/shared/constants/theme'`.
- Chart chrome — axes, gridlines, tooltips, the stroke behind value labels —
  comes from `CHART_CHROME`. These are not series colours; they are the frame
  the data is drawn on, and they used to be hardcoded across eight files
  precisely because they had nowhere else to live.
- Never write a raw hex in a component. `npm run lint` will not catch this one,
  but a grep for `#` under `src/` should come back empty outside the token file.

Tailwind cannot see interpolated class names, so any dynamic class must come from a
written-out lookup map (see `COLUMNS` in `SummaryStrip`), never a template string.

### Light and dark theme

The UI was written dark-only, and it stays written that way: **do not add `dark:`
variants.** `tailwind.config.js` serves every palette (`slate`, `emerald`, `rose`…),
`white` and `surface` as CSS variables. Under `:root` they hold Tailwind's own values,
so the dark theme is exactly what it always was; under `.light` each shade takes its
mirror (50↔950, 100↔900, 400↔600, 500 stays). A class keeps its *role* in both themes:
`text-white` is the strongest text, `text-slate-400` muted text, `bg-slate-900/40` a
sunken fill, `bg-emerald-950/40` a tinted card. Write new markup for the dark theme and
it will read in the light one.

- `brand` is not mirrored — it is the brand. Text on a `bg-brand` surface stays real
  white through an override in `styles/global.css`; on any other solid colour,
  `text-white` turns dark, which is what a mirrored (lighter) fill needs.
- The light values that are not a mirror (surfaces, chart chrome, the dark ink that
  `white` becomes) live in `design-tokens.json` under `light`.
- Charts draw on a canvas and cannot read CSS variables. `BarChart`, `LineChart` and
  `DoughnutChart` pass their options and data through `shared/charts/tema.ts`, which swaps
  every `CHART_CHROME`/`SURFACE` value for its light pair; series colours are untouched.
  So keep using the tokens in chart options — a raw hex would not be translated — and go
  through the wrappers rather than `react-chartjs-2` directly. Colours resolved at draw
  time (plugins, scriptable options) call `colorDelTema()`.
- The choice (`claro` / `oscuro` / `sistema`, the default, which follows
  `prefers-color-scheme` live) is per browser, in `localStorage` (`netowl-tema`), set from
  the sidebar footer. `shared/hooks/useTheme` owns it; an inline script in
  `templates/app.html` applies it before the first paint, so the two must agree on the key
  and the rule.
- Images with white lettering have `_light` variants in `web/static/img/`
  (`logo_sidebar_light.png`, `isotipo_sidebar_light.png`), derived from `logo_light.png`
  the same way as the dark ones.

Changing `tailwind.config.js` needs a restart of Vite (`make dev`): the running server
keeps the config it loaded.

## Phones and breakpoints

Every screen has to be readable on a phone. Layouts are written **mobile first**:
the unprefixed class is the phone, and each prefix adds what fits from that width.
The five breakpoints are declared in `design-tokens.json` (`screens`), which
`tailwind.config.js` uses as the *whole* set — not `extend` — and which
`shared/constants/breakpoints.ts` reads for JS. The values are Tailwind's defaults,
so existing classes kept their meaning; what is new is that each one has a job:

| Prefix | From | Screen | What changes in the shell |
| --- | --- | --- | --- |
| — | 0 | Phone, portrait | Menu in a drawer, filters full width, modal as a bottom sheet |
| `sm:` | 640px | Phone, landscape | Filters back to natural width, modal centred |
| `md:` | 768px | Tablet, portrait | Card grids at 3–4 columns |
| `lg:` | 1024px | Tablet landscape / laptop | **Fixed sidebar, sticky toolbar** |
| `xl:` | 1280px | Desktop | Wide grids, charts side by side |
| `2xl:` | 1536px | Large desktop | Density only |

`lg` is the one that matters. Below it `AppLayout` has no sidebar: `MobileTopBar`
shows a hamburger that opens `MobileNavDrawer`, the same `SidebarContent` in a
drawer. From `lg` the sidebar is fixed and can be folded to an icon rail
(remembered per browser in `localStorage`); folded, hovering or focusing a module's
icon opens its pages in a flyout. The toolbar (breadcrumb, filters, day bar) is
sticky only from `lg` too: on a phone, filters plus the day bar pinned
on top would leave a third of the screen for the data.

What the shared kit already does, so a view does not have to:

- `ToggleGroup` is a horizontally scrolling strip below `lg` and wraps from `lg`. Don't pass
  `flex-wrap` to a `ToggleGroup`: it would undo the strip. A wrapper around one
  needs `min-w-0 max-w-full`, or the strip cannot shrink and the page overflows.
- `FilterField` is full width below `sm` and its control stretches inside it
  (`FILTER_TRIGGER_CLASS` carries `flex-1`). A custom control inside a capsule
  should do the same (`min-w-0 flex-1 sm:flex-none`).
- `Modal` is a bottom sheet below `sm`; its `size` only applies from `sm`.
- `Panel`, `NeonContainer` pad `p-4` on a phone and `p-6` from `sm`.
- `BarChart`, `LineChart`, `DoughnutChart` shrink their value labels, let the
  X axis rotate to vertical and move the doughnut legend below the ring under
  `sm` (`shared/charts/compacto.ts`). Build options as usual; the wrapper adapts them.
- `DataTable` scrolls horizontally. Mark the row's label column `sticky: true`
  so it stays pinned while the figures slide past (`StickyLabel` only sets its
  width and style — a `sticky` *inside* a `<td>` cannot leave its cell).
  A hand-written `<table>` goes inside an `overflow-x-auto` wrapper.

When a class is not enough — Chart.js options, whether to draw something at all —
use `useBreakpoint('sm')` from `shared/hooks`. Write grids as
`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, never a bare `grid-cols-4`, and
prefer `dvh` to `vh`/`h-screen`: on a phone `100vh` includes the address bar.

## Adding a module

1. Add its entry, with its `pages`, to `APP_NAVIGATION` in `shared/constants/navigation.ts`.
   That is the only navigation there is: the sidebar draws it as a tree (pages with a
   `section` are grouped under it) and `AppLayout` derives the breadcrumb from the URL.
   A page's sub-routes (`eta-report/config/`) hang from the page whose `href` is their
   longest prefix.
2. Create `features/<module>/` with `types.ts`, `hooks/`, `components/`, `index.ts`.
3. Create the page shells under `pages/<Module>/`, matching the names the Django
   views pass to `inertia_render`.

## Async actions

`useAsyncAction` wraps an API call and tracks its pending flag, its status message and
any server log, using `extractApiError` to normalise failures. Prefer it over
hand-rolling `isLoading` / `message` / `consoleLog` state triples.

The import pages compose it through `CsvUploadCard` and `AnalysisRunnerCard`
(`features/imports/components/`), so a new import screen supplies only the endpoint
and the copy.

## The reference catalogues

`pages/Subscriptions/Catalogos.tsx` edits the plan / zone / site / state /
coordinator tables that used to be `data/Planes.json` and `data/Zonas.json`. It
sits behind two permissions — `can_manage_catalogo_comercial` (zones, sites,
states, coordinators) and `can_manage_catalogo_operacional` (pending products,
plans, regulator plans, ignored); the page opens with either and shows only the tabs
of the one held — and it is the only place a plan is classified —
the ETA screen no longer keeps a second, overriding copy of that classification,
only its per-subscription exceptions.

Its first tab is not a catalogue but what is *missing*: products already
imported that no plan recognises. That list is what blocks an import or an
analysis, and each row offers the two answers the server cannot tell apart —
register it as a plan, or mark it as a product that never will be one.

The same pair of answers appears in `CatalogoBloqueoModal`
(`features/imports/`), which opens when an upload comes back 409. Nothing was
written when it does: the check runs before the truncate, so the previous data
is intact and the file can be re-uploaded once the decisions are made.


## Commercial objectives are applied here, not stored

The growth target and the maximum churn (6% / 3% by default) are catalogue data served in
the `objetivos` prop of the subscriptions pages. `features/subscriptions/lib/objetivos.ts`
is the only place that resolves them — meta, completion and colour — and
`hooks/useObjetivos` reads them from the page. Never hardcode a target or a colour threshold
again: that is how the app ended up with the 6% written in eight files and three different
"green" cut-offs.

The highest level that sets an objective wins: sucursal → state → site → coordinator → zone →
node (zone - sucursal), then the month's general. A zone's own objective applies only if nothing above it sets one. Totals
ignore the levels below the group: a coordinator total resolves from the coordinator up, a
site total from the site up, and global totals use the month's general objective. Group metas are the sum of their zones'
metas resolved from the group's level, so a group never contradicts its parts. The report
hooks (`useSalesReportData`, `useBusinessUnitsData`) attach a `meta` to every node and group;
components only paint.

## Careful: the two reports disagree on completion

`features/subscriptions/lib/commercial.ts` holds the single `calcComercial`. It receives the
absolute growth meta (`Meta.metaCrecimiento`) and takes a
`clamp` option because Sales Report and Business Units have always computed
`tasaCumplimiento` differently — Sales Report clamps to `[0, 100]`, Business Units does
not, which is what lets its "Meta Cumplida" badge fire above 100%. The node table shows the
three completions — ingreso (net growth), ventas (installations) and cierre (final base against
the expected one) — next to each row's objective, and the clamp applies to all three in Sales
Report. Both behaviours are preserved intentionally. Unifying them changes displayed commercial KPIs, so treat it as
a product decision, not a cleanup.
