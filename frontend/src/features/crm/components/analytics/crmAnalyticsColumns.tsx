/** Las columnas de esa tabla. */

import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatOneDecimal, formatTwoDecimals } from '@/shared/utils/formatters';
import type { CrmDimensionValue } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;
const hrs = formatOneDecimal;

/**
 * Every measure carried by a dimension row, in the order the analysis produces
 * them: volume, outcome rates, install times, loss times, closure times.
 *
 * This is the raw read of the period — no weighting, no ranking, no `Otros`
 * bucket — so it is the table to check a chart against.
 */
export const CRM_ANALYTICS_COLUMNS: Column<CrmDimensionValue>[] = [
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.value}</StickyLabel>, sortKey: 'value', sticky: true },

  { header: 'Oportunidades', accessor: (r) => int(r.total_opportunities), align: 'right', sortKey: 'total_opportunities' },
  { header: 'Ganados', accessor: (r) => <span className="text-emerald-400">{int(r.won)}</span>, align: 'right', sortKey: 'won' },
  { header: 'Perdidos', accessor: (r) => <span className="text-rose-400">{int(r.lost)}</span>, align: 'right', sortKey: 'lost' },
  { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{int(r.pending)}</span>, align: 'right', sortKey: 'pending' },
  { header: 'Dev. E8', accessor: (r) => <span className="text-amber-400">{int(r.count_returned_e8)}</span>, align: 'right', sortKey: 'count_returned_e8' },

  { header: 'Instal. %', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.pct_installation)}%</span>, align: 'right', sortKey: 'pct_installation' },
  { header: 'Pérdida %', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.pct_lost)}%</span>, align: 'right', sortKey: 'pct_lost' },
  { header: 'Pend. %', accessor: (r) => `${dec(r.pct_pending)}%`, align: 'right', sortKey: 'pct_pending' },
  { header: 'Dev. E8 %', accessor: (r) => <span className="text-amber-400">{dec(r.pct_returned_e8)}%</span>, align: 'right', sortKey: 'pct_returned_e8' },

  { header: 'Inst. Prom (h)', accessor: (r) => hrs(r.hours_avg_inst), align: 'right', sortKey: 'hours_avg_inst' },
  { header: 'Inst. Med (h)', accessor: (r) => hrs(r.hours_median_inst), align: 'right', sortKey: 'hours_median_inst' },
  { header: 'Inst. P25 (h)', accessor: (r) => hrs(r.hours_p25_inst), align: 'right', sortKey: 'hours_p25_inst' },
  { header: 'Inst. P75 (h)', accessor: (r) => hrs(r.hours_p75_inst), align: 'right', sortKey: 'hours_p75_inst' },
  { header: 'Inst. Máx (h)', accessor: (r) => hrs(r.hours_max_inst), align: 'right', sortKey: 'hours_max_inst' },
  { header: 'Excede Prom %', accessor: (r) => `${dec(r.pct_over_avg_inst)}%`, align: 'right', sortKey: 'pct_over_avg_inst' },

  { header: 'Pérd. Prom (h)', accessor: (r) => hrs(r.hours_avg_lost), align: 'right', sortKey: 'hours_avg_lost' },
  { header: 'Pérd. Med (h)', accessor: (r) => hrs(r.hours_median_lost), align: 'right', sortKey: 'hours_median_lost' },
  { header: 'Pérd. P75 (h)', accessor: (r) => hrs(r.hours_p75_lost), align: 'right', sortKey: 'hours_p75_lost' },
  { header: 'Pérd. Máx (h)', accessor: (r) => hrs(r.hours_max_lost), align: 'right', sortKey: 'hours_max_lost' },

  { header: 'Cierre Prom (h)', accessor: (r) => hrs(r.hours_avg_close), align: 'right', sortKey: 'hours_avg_close' },
  { header: 'Cierre Med (h)', accessor: (r) => hrs(r.hours_median_close), align: 'right', sortKey: 'hours_median_close' },
  { header: 'Cierre P75 (h)', accessor: (r) => hrs(r.hours_p75_close), align: 'right', sortKey: 'hours_p75_close' },
  { header: 'Cierre Máx (h)', accessor: (r) => hrs(r.hours_max_close), align: 'right', sortKey: 'hours_max_close' },
];
