/** Las columnas de las tablas de dimensión y de zona. */

import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils';
import type { SupportDepartamentoRow, SupportDimensionRow, SupportZoneRow } from '../../types';

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
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.nombre}</StickyLabel>, sortKey: 'nombre', sticky: true },
  { header: '% del Total', accessor: (r) => <span className="font-bold text-brand">{dec(r.pctDelPadre)}%</span>, align: 'right', sortKey: 'pctDelPadre' },

  { header: 'Creados', accessor: (r) => int(r.tickets_creados), align: 'right', sortKey: 'tickets_creados' },
  { header: 'Cerrados', accessor: (r) => <span className="text-sky-400">{int(r.tickets_cerrados)}</span>, align: 'right', sortKey: 'tickets_cerrados' },
  { header: 'Resueltos', accessor: (r) => <span className="text-emerald-400">{int(r.tickets_resueltos)}</span>, align: 'right', sortKey: 'tickets_resueltos' },
  { header: 'Cancelados', accessor: (r) => <span className="text-rose-400">{int(r.tickets_cancelados)}</span>, align: 'right', sortKey: 'tickets_cancelados' },
  { header: 'Rezagados', accessor: (r) => <span className="text-amber-400">{int(r.tickets_rezagados)}</span>, align: 'right', sortKey: 'tickets_rezagados' },

  // Resolución y cancelación se leen sobre los cerrados del mes; el rezago,
  // sobre los creados. Los sufijos dicen de dónde salió cada cierre.
  { header: '% Resueltos', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.pct_resueltos)}%</span>, align: 'right', sortKey: 'pct_resueltos' },
  { header: '% Resueltos del Mes', accessor: (r) => <span className="text-emerald-400">{dec(r.pct_resueltos_periodo)}%</span>, align: 'right', sortKey: 'pct_resueltos_periodo' },
  { header: '% Resueltos Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_resueltos_arrastre)}%</span>, align: 'right', sortKey: 'pct_resueltos_arrastre' },
  { header: '% Cancelados', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.pct_cancelados)}%</span>, align: 'right', sortKey: 'pct_cancelados' },
  { header: '% Cancelados del Mes', accessor: (r) => <span className="text-rose-400">{dec(r.pct_cancelados_periodo)}%</span>, align: 'right', sortKey: 'pct_cancelados_periodo' },
  { header: '% Cancelados Arrastre', accessor: (r) => <span className="text-purple-400">{dec(r.pct_cancelados_arrastre)}%</span>, align: 'right', sortKey: 'pct_cancelados_arrastre' },
  { header: '% Rezago', accessor: (r) => <span className="font-bold text-amber-400">{dec(r.pct_rezagados)}%</span>, align: 'right', sortKey: 'pct_rezagados' },

  // Creación → cierre, sobre lo cerrado en el mes.
  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_creado_cerrados_horas), align: 'right', sortKey: 'tiempo_medio_cierre_creado_cerrados_horas' },
  { header: 'Cierre Total Med (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_creado_cerrados_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_creado_cerrados_horas' },
  { header: 'Muestra Cierre', accessor: (r) => <span className="text-slate-500">{int(r.muestra_cierre_creado_cerrados)}</span>, align: 'right', sortKey: 'muestra_cierre_creado_cerrados' },

  // Asignación → cierre: sólo la gestión del técnico.
  { header: 'Gestión (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_asignado_cerrados_horas), align: 'right', sortKey: 'tiempo_medio_cierre_asignado_cerrados_horas' },
  { header: 'Muestra Gestión', accessor: (r) => <span className="text-slate-500">{int(r.muestra_cierre_asignado_cerrados)}</span>, align: 'right', sortKey: 'muestra_cierre_asignado_cerrados' },

  // Creación → asignación, sobre lo creado en el mes: la espera ya ocurrió
  // aunque el ticket siga abierto.
  { header: 'Asignación (h)', accessor: (r) => hrs(r.tiempo_medio_asignacion_horas), align: 'right', sortKey: 'tiempo_medio_asignacion_horas' },
  { header: 'Muestra Asignación', accessor: (r) => <span className="text-slate-500">{int(r.muestra_asignacion)}</span>, align: 'right', sortKey: 'muestra_asignacion' },
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
export const SUPPORT_DEPARTAMENTO_COLUMNS: Column<SupportDepartamentoRow>[] = [
  { header: 'Departamento', accessor: (r) => <StickyLabel>{r.nombre}</StickyLabel>, sortKey: 'nombre', sticky: true },
  { header: 'Personas', accessor: (r) => int(r.personas), align: 'right', sortKey: 'personas' },
  ...SUPPORT_DIMENSION_COLUMNS.filter(
    (col) => col.header !== 'Valor' && col.header !== 'Cierre Total Med (h)',
  ),
] as Column<SupportDepartamentoRow>[];

export const SUPPORT_ZONE_COLUMNS: Column<SupportZoneRow>[] = [
  { header: 'Zona', accessor: (r) => <StickyLabel>{r.zona}</StickyLabel>, sortKey: 'zona', sticky: true },
  { header: 'Site', accessor: (r) => r.site, sortKey: 'site' },
  { header: 'Tecnología', accessor: (r) => <span className="text-slate-400">{r.tecnologia}</span>, sortKey: 'tecnologia' },
  { header: 'Tickets', accessor: (r) => int(r.totalTickets), align: 'right', sortKey: 'totalTickets' },
  { header: 'Activos', accessor: (r) => (r.sinPoblacion ? <span className="text-slate-600">Sin datos</span> : int(r.totalSuscriptores)), align: 'right', sortKey: 'totalSuscriptores' },
  {
    header: 'Incidencia %',
    accessor: (r) =>
      r.sinPoblacion
        ? <span className="text-slate-600">—</span>
        : <span className="font-bold text-amber-400">{dec(r.tasaIncidencia)}%</span>,
    align: 'right',
    sortKey: 'tasaIncidencia',
  },
  { header: '% Resueltos', accessor: (r) => <span className="text-emerald-400">{dec(r.pctResueltos)}%</span>, align: 'right', sortKey: 'pctResueltos' },
  { header: 'Cierre Total (h)', accessor: (r) => hrs(r.mttrPromedio), align: 'right', sortKey: 'mttrPromedio' },
];
