import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils/formatters';
import type { SupportBreakdownRow, SupportSolutionRow, SupportZoneRow } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;
const hrs = formatOneDecimal;

/**
 * Every measure a breakdown value carries, in analysis order: weight, volume,
 * outcome rates, closure times.
 *
 * Shared by failure reasons, request types and branches — they are the same
 * `compute_metrics_for_period` block measured over a different slice.
 */
export const SUPPORT_BREAKDOWN_COLUMNS: Column<SupportBreakdownRow>[] = [
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.nombre}</StickyLabel>, sortKey: 'nombre' },

  { header: '% del Grupo', accessor: (r) => <span className="font-bold text-brand">{dec(r.pctDelGrupo)}%</span>, align: 'right', sortKey: 'pctDelGrupo' },
  { header: 'Tickets', accessor: (r) => int(r.total_tickets), align: 'right', sortKey: 'total_tickets' },
  { header: 'Resueltos', accessor: (r) => <span className="text-emerald-400">{int(r.tickets_resueltos)}</span>, align: 'right', sortKey: 'tickets_resueltos' },
  { header: 'Cancelados', accessor: (r) => <span className="text-rose-400">{int(r.tickets_cancelados)}</span>, align: 'right', sortKey: 'tickets_cancelados' },
  { header: 'Rezagados', accessor: (r) => <span className="text-amber-400">{int(r.tickets_rezagados)}</span>, align: 'right', sortKey: 'tickets_rezagados' },

  { header: 'Resueltos %', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.pct_resueltos)}%</span>, align: 'right', sortKey: 'pct_resueltos' },
  { header: 'Cancelados %', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.pct_cancelados)}%</span>, align: 'right', sortKey: 'pct_cancelados' },
  { header: 'Rezagados %', accessor: (r) => <span className="text-amber-400">{dec(r.pct_rezagados)}%</span>, align: 'right', sortKey: 'pct_rezagados' },

  { header: 'Asig.→Cierre (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_horas), align: 'right', sortKey: 'tiempo_medio_cierre_horas' },
  { header: 'Asig. Med (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_horas' },
  { header: 'Asig. P75 (h)', accessor: (r) => hrs(r.tiempo_p75_cierre_horas), align: 'right', sortKey: 'tiempo_p75_cierre_horas' },
  { header: 'Asig. Máx (h)', accessor: (r) => hrs(r.tiempo_max_cierre_horas), align: 'right', sortKey: 'tiempo_max_cierre_horas' },
  { header: 'Muestra Asig.', accessor: (r) => <span className="text-slate-500">{int(r.muestra_cierre)}</span>, align: 'right', sortKey: 'muestra_cierre' },

  { header: 'Creac.→Cierre (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_total_horas), align: 'right', sortKey: 'tiempo_medio_cierre_total_horas' },
  { header: 'Creac. Med (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_total_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_total_horas' },
  { header: 'Creac. Máx (h)', accessor: (r) => hrs(r.tiempo_max_cierre_total_horas), align: 'right', sortKey: 'tiempo_max_cierre_total_horas' },

  { header: '1ª Resp. (h)', accessor: (r) => hrs(r.tiempo_medio_primera_respuesta_horas), align: 'right', sortKey: 'tiempo_medio_primera_respuesta_horas' },
  { header: '1ª Resp. Med (h)', accessor: (r) => hrs(r.tiempo_mediana_primera_respuesta_horas), align: 'right', sortKey: 'tiempo_mediana_primera_respuesta_horas' },
  { header: 'Muestra 1ª Resp.', accessor: (r) => <span className="text-slate-500">{int(r.muestra_primera_respuesta)}</span>, align: 'right', sortKey: 'muestra_primera_respuesta' },

  // Variantes globales: los mismos relojes contando también los cancelados.
  { header: 'Asig.→Cierre Glob. (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_global_horas), align: 'right', sortKey: 'tiempo_medio_cierre_global_horas' },
  { header: 'Asig. Glob. Med (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_global_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_global_horas' },
  { header: 'Muestra Asig. Glob.', accessor: (r) => <span className="text-slate-500">{int(r.muestra_cierre_global)}</span>, align: 'right', sortKey: 'muestra_cierre_global' },

  { header: 'Creac.→Cierre Glob. (h)', accessor: (r) => hrs(r.tiempo_medio_cierre_total_global_horas), align: 'right', sortKey: 'tiempo_medio_cierre_total_global_horas' },
  { header: 'Creac. Glob. Med (h)', accessor: (r) => hrs(r.tiempo_mediana_cierre_total_global_horas), align: 'right', sortKey: 'tiempo_mediana_cierre_total_global_horas' },
  { header: 'Muestra Creac. Glob.', accessor: (r) => <span className="text-slate-500">{int(r.muestra_cierre_total_global)}</span>, align: 'right', sortKey: 'muestra_cierre_total_global' },

  { header: '1ª Resp. Glob. (h)', accessor: (r) => hrs(r.tiempo_medio_primera_respuesta_global_horas), align: 'right', sortKey: 'tiempo_medio_primera_respuesta_global_horas' },
  { header: 'Muestra 1ª Resp. Glob.', accessor: (r) => <span className="text-slate-500">{int(r.muestra_primera_respuesta_global)}</span>, align: 'right', sortKey: 'muestra_primera_respuesta_global' },
];

/**
 * Solutions are a raw count off the ticket table, not an analysed slice — there
 * are no times or outcome rates to show, only how often each one was applied.
 */
export const SUPPORT_SOLUTION_COLUMNS: Column<SupportSolutionRow>[] = [
  { header: 'Solución Aplicada', accessor: (r) => <StickyLabel>{r.nombre}</StickyLabel>, sortKey: 'nombre' },
  { header: 'Tickets', accessor: (r) => int(r.total), align: 'right', sortKey: 'total' },
  { header: '% del Grupo', accessor: (r) => <span className="font-bold text-brand">{dec(r.pct)}%</span>, align: 'right', sortKey: 'pct' },
];

export const SUPPORT_ZONE_COLUMNS: Column<SupportZoneRow>[] = [
  { header: 'Zona', accessor: (r) => <StickyLabel>{r.zona}</StickyLabel>, sortKey: 'zona' },
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
  { header: 'MTTR (h)', accessor: (r) => hrs(r.mttrPromedio), align: 'right', sortKey: 'mttrPromedio' },
];
