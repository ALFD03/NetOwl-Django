# Frontend architecture

React + TypeScript + Inertia, served by Django. Tailwind for styling, Chart.js for charts.

> El inventario de esta capa —paginas, features, kit compartido y como llega el
> dato— esta en `docs/09-frontend.md`. Este documento sigue siendo el normativo:
> las reglas de capas, el catalogo de UI y los tokens se deciden aqui.

## Layout

```
src/
├── app/          Bootstrap only: main.tsx, csrf, providers
├── shared/       Reusable across every module. Knows nothing about any feature.
│   ├── ui/       The component kit, grouped by kind (see below)
│   ├── layout/   AppLayout, Sidebar, UserMenu
│   ├── navigation/  ModuleHeader
│   ├── charts/   Chart.js wrappers, shared options, registration
│   ├── lib/      cn(), colour helpers, api client, http error handling, daySeries
│   ├── hooks/    usePermissions, useAsyncAction, useJobQueue, useDayCuts, useDayPayload
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

Pages hold no logic. A page picks a layout, a header and a feature view:

```tsx
export default function CrmDashboard(props: CrmDashboardProps) {
  const data = useCrmDashboard(props);
  return (
    <AppLayout title="CRM Analytics Dashboard">
      <ModuleHeader module="crm" activeTab="dashboard" />
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
| Filter capsule (label cap + control) | `FilterField` |
| Sortable/searchable/filterable table | `DataTable` |
| Module tab bar | `ModuleHeader module="…"` |

**Filters look the way they look in Sales Report and Business Units**, and that
is not a convention but a component: `FilterField` is the capsule — a dark cap
naming *what* is being filtered, and flush against it the control saying *by
which value*. Put a `SelectMenu` inside with `FILTER_TRIGGER_CLASS`, a
`SearchInput` with `grow`, or a field of your own. It used to be copied into
`PeriodSelector` and three times into `SubscriptionReportFilters`, and every
new copy reinterpreted it slightly worse.

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

## Adding a module

1. Add its entry to `MODULE_NAVIGATION` in `shared/constants/navigation.ts`.
   `ModuleHeader` picks it up automatically; there is no per-module header component.
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
sits behind `can_manage_catalogos` and is the only place a plan is classified —
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


## Careful: the two reports disagree on completion

`features/subscriptions/lib/commercial.ts` holds the single `calcComercial`. It takes a
`clamp` option because Sales Report and Business Units have always computed
`tasaCumplimiento` differently — Sales Report clamps to `[0, 100]`, Business Units does
not, which is what lets its "Meta Cumplida" badge fire above 100%. Both behaviours are
preserved intentionally. Unifying them changes displayed commercial KPIs, so treat it as
a product decision, not a cleanup.
