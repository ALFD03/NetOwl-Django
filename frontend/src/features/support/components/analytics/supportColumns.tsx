/** Las columnas de las tablas de dimensión y de zona. */

import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils';
import type { SupportDepartmentRow, SupportDimensionRow, SupportZoneRow } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;
const hrs = formatOneDecimal;

/**
 * What a dimension value carries, in analysis order: weight, the two volumes
 * that act as denominators, the outcome rates, and the three clocks.
 *
 * Shared by the first-level axes (zone, branch, technician) and by the three
 * breakdowns inside a value — they are the same `compute_metrics_for_period`
 * block measured over a different slice, so they read with the same columns.
 *
 * Only the mean and the sample of each clock are shown, and only the headline
 * variant of each formula: the resolved / cancelled splits and the full
 * nine-statistic distribution live in the group overview, because putting them
 * here turns the table into a panel.
 */
export const SUPPORT_DIMENSION_COLUMNS: Column<SupportDimensionRow>[] = [
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.name}</StickyLabel>, sortKey: 'name', sticky: true },
  { header: '% del Total', accessor: (r) => <span className="font-bold text-brand">{dec(r.pctOfParent)}%</span>, align: 'right', sortKey: 'pctOfParent' },

  { header: 'Creados', accessor: (r) => int(r.tickets_created), align: 'right', sortKey: 'tickets_created' },
  { header: 'Cerrados', accessor: (r) => <span className="text-sky-400">{int(r.tickets_closed)}</span>, align: 'right', sortKey: 'tickets_closed' },
  { header: 'Resueltos', accessor: (r) => <span className="text-emerald-400">{int(r.tickets_resolved)}</span>, align: 'right', sortKey: 'tickets_resolved' },
  { header: 'Cancelados', accessor: (r) => <span className="text-rose-400">{int(r.tickets_cancelled)}</span>, align: 'right', sortKey: 'tickets_cancelled' },
  { header: 'Escalados', accessor: (r) => <span className="text-amber-300">{int(r.tickets_escalated)}</span>, align: 'right', sortKey: 'tickets_escalated' },
  { header: 'Llegados de ATC', accessor: (r) => <span className="text-slate-400">{int(r.tickets_received_escalated)}</span>, align: 'right', sortKey: 'tickets_received_escalated' },
  { header: 'Rezagados', accessor: (r) => <span className="text-amber-400">{int(r.tickets_lagging)}</span>, align: 'right', sortKey: 'tickets_lagging' },

  // Resolución y cancelación se leen sobre los cerrados del mes; el rezago,
  // sobre los creados. Los sufijos dicen de dónde salió cada cierre.
  { header: '% Resueltos', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.pct_resolved)}%</span>, align: 'right', sortKey: 'pct_resolved' },
  { header: '% Resueltos del Mes', accessor: (r) => <span className="text-emerald-400">{dec(r.pct_resolved_in_period)}%</span>, align: 'right', sortKey: 'pct_resolved_in_period' },
  { header: '% Resueltos Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_resolved_carryover)}%</span>, align: 'right', sortKey: 'pct_resolved_carryover' },
  { header: '% Cancelados', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.pct_cancelled)}%</span>, align: 'right', sortKey: 'pct_cancelled' },
  { header: '% Cancelados del Mes', accessor: (r) => <span className="text-rose-400">{dec(r.pct_cancelled_in_period)}%</span>, align: 'right', sortKey: 'pct_cancelled_in_period' },
  { header: '% Cancelados Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_cancelled_carryover)}%</span>, align: 'right', sortKey: 'pct_cancelled_carryover' },
  { header: '% Escalados', accessor: (r) => <span className="font-bold text-amber-300">{dec(r.pct_escalated)}%</span>, align: 'right', sortKey: 'pct_escalated' },
  { header: '% Rezago', accessor: (r) => <span className="font-bold text-amber-400">{dec(r.pct_lagging)}%</span>, align: 'right', sortKey: 'pct_lagging' },

  // Creación → cierre, sobre lo cerrado en el mes.
  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.time_mean_close_created_closed_hours), align: 'right', sortKey: 'time_mean_close_created_closed_hours' },
  { header: 'Cierre Total Mediana (h)', accessor: (r) => hrs(r.time_median_close_created_closed_hours), align: 'right', sortKey: 'time_median_close_created_closed_hours' },
  { header: 'Muestra Cierre', accessor: (r) => <span className="text-slate-500">{int(r.sample_close_created_closed)}</span>, align: 'right', sortKey: 'sample_close_created_closed' },

  // Asignación → cierre: sólo la gestión del técnico.
  { header: 'Gestión (h)', accessor: (r) => hrs(r.time_mean_close_assigned_closed_hours), align: 'right', sortKey: 'time_mean_close_assigned_closed_hours' },
  { header: 'Muestra Gestión', accessor: (r) => <span className="text-slate-500">{int(r.sample_close_assigned_closed)}</span>, align: 'right', sortKey: 'sample_close_assigned_closed' },

  // Creación → asignación, sobre lo creado en el mes: la espera ya ocurrió
  // aunque el ticket siga abierto.
  { header: 'Asignación (h)', accessor: (r) => hrs(r.time_mean_assignment_hours), align: 'right', sortKey: 'time_mean_assignment_hours' },
  { header: 'Muestra Asignación', accessor: (r) => <span className="text-slate-500">{int(r.sample_assignment)}</span>, align: 'right', sortKey: 'sample_assignment' },

  { header: 'Hasta Escalar (h)', accessor: (r) => hrs(r.time_mean_escalation_hours), align: 'right', sortKey: 'time_mean_escalation_hours' },
  { header: 'Hasta Escalar Mediana (h)', accessor: (r) => hrs(r.time_median_escalation_hours), align: 'right', sortKey: 'time_median_escalation_hours' },
];

/**
 * Los departamentos: las mismas columnas de la tabla de personas menos las que
 * no se pueden sumar, más cuánta gente entra en cada fila.
 *
 * La mediana de cierre no está, y su ausencia es el punto: la mediana de un
 * departamento no se puede reconstruir desde las medianas de su gente, hacen
 * falta los tickets uno a uno. Los promedios sí están, porque la media
 * ponderada por la muestra es exactamente la media del conjunto. Para la
 * distribución completa de alguien, su fila sigue estando en la vista por
 * persona.
 */
export const SUPPORT_DEPARTMENT_COLUMNS: Column<SupportDepartmentRow>[] = [
  { header: 'Departamento', accessor: (r) => <StickyLabel>{r.name}</StickyLabel>, sortKey: 'name', sticky: true },
  { header: 'Personas', accessor: (r) => int(r.people), align: 'right', sortKey: 'personas' },
  ...SUPPORT_DIMENSION_COLUMNS.filter(
    (col) => col.header !== 'Valor' && !col.header.includes('Mediana (h)'),
  ),
] as Column<SupportDepartmentRow>[];

export const SUPPORT_ZONE_COLUMNS: Column<SupportZoneRow>[] = [
  { header: 'Zona', accessor: (r) => <StickyLabel>{r.zona}</StickyLabel>, sortKey: 'zona', sticky: true },
  { header: 'Site', accessor: (r) => r.site, sortKey: 'site' },
  { header: 'Tecnología', accessor: (r) => <span className="text-slate-400">{r.technology}</span>, sortKey: 'technology' },
  { header: 'Tickets', accessor: (r) => int(r.totalTickets), align: 'right', sortKey: 'totalTickets' },
  { header: 'Activos', accessor: (r) => (r.withoutPopulation ? <span className="text-slate-600">Sin datos</span> : int(r.totalSubscribers)), align: 'right', sortKey: 'totalSubscribers' },
  {
    header: 'Incidencia %',
    accessor: (r) =>
      r.withoutPopulation
        ? <span className="text-slate-600">—</span>
        : <span className="font-bold text-amber-400">{dec(r.incidenceRate)}%</span>,
    align: 'right',
    sortKey: 'incidenceRate',
  },
  { header: '% Resueltos', accessor: (r) => <span className="text-emerald-400">{dec(r.pctResolved)}%</span>, align: 'right', sortKey: 'pctResolved' },
  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.mttrAverage), align: 'right', sortKey: 'mttrAverage' },
];
