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
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.valor}</StickyLabel>, sortKey: 'valor', sticky: true },

  { header: 'Oportunidades', accessor: (r) => int(r.total_oportunidades), align: 'right', sortKey: 'total_oportunidades' },
  { header: 'Ganados', accessor: (r) => <span className="text-emerald-400">{int(r.ganados)}</span>, align: 'right', sortKey: 'ganados' },
  { header: 'Perdidos', accessor: (r) => <span className="text-rose-400">{int(r.perdidos)}</span>, align: 'right', sortKey: 'perdidos' },
  { header: 'Pendientes', accessor: (r) => <span className="text-sky-400">{int(r.pendientes)}</span>, align: 'right', sortKey: 'pendientes' },
  { header: 'Dev. E8', accessor: (r) => <span className="text-amber-400">{int(r.count_devueltos_e8)}</span>, align: 'right', sortKey: 'count_devueltos_e8' },

  { header: 'Instal. %', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.pct_instalacion)}%</span>, align: 'right', sortKey: 'pct_instalacion' },
  { header: 'Pérdida %', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.pct_perdida)}%</span>, align: 'right', sortKey: 'pct_perdida' },
  { header: 'Pend. %', accessor: (r) => `${dec(r.pct_pendientes)}%`, align: 'right', sortKey: 'pct_pendientes' },
  { header: 'Dev. E8 %', accessor: (r) => <span className="text-amber-400">{dec(r.pct_devueltos_e8)}%</span>, align: 'right', sortKey: 'pct_devueltos_e8' },

  { header: 'Inst. Prom (h)', accessor: (r) => hrs(r.horas_promedio_inst), align: 'right', sortKey: 'horas_promedio_inst' },
  { header: 'Inst. Med (h)', accessor: (r) => hrs(r.horas_mediana_inst), align: 'right', sortKey: 'horas_mediana_inst' },
  { header: 'Inst. P25 (h)', accessor: (r) => hrs(r.horas_p25_inst), align: 'right', sortKey: 'horas_p25_inst' },
  { header: 'Inst. P75 (h)', accessor: (r) => hrs(r.horas_p75_inst), align: 'right', sortKey: 'horas_p75_inst' },
  { header: 'Inst. Máx (h)', accessor: (r) => hrs(r.horas_max_inst), align: 'right', sortKey: 'horas_max_inst' },
  { header: 'Excede Prom %', accessor: (r) => `${dec(r.pct_excede_prom_inst)}%`, align: 'right', sortKey: 'pct_excede_prom_inst' },

  { header: 'Pérd. Prom (h)', accessor: (r) => hrs(r.horas_promedio_perd), align: 'right', sortKey: 'horas_promedio_perd' },
  { header: 'Pérd. Med (h)', accessor: (r) => hrs(r.horas_mediana_perd), align: 'right', sortKey: 'horas_mediana_perd' },
  { header: 'Pérd. P75 (h)', accessor: (r) => hrs(r.horas_p75_perd), align: 'right', sortKey: 'horas_p75_perd' },
  { header: 'Pérd. Máx (h)', accessor: (r) => hrs(r.horas_max_perd), align: 'right', sortKey: 'horas_max_perd' },

  { header: 'Cierre Prom (h)', accessor: (r) => hrs(r.horas_promedio_cierre), align: 'right', sortKey: 'horas_promedio_cierre' },
  { header: 'Cierre Med (h)', accessor: (r) => hrs(r.horas_mediana_cierre), align: 'right', sortKey: 'horas_mediana_cierre' },
  { header: 'Cierre P75 (h)', accessor: (r) => hrs(r.horas_p75_cierre), align: 'right', sortKey: 'horas_p75_cierre' },
  { header: 'Cierre Máx (h)', accessor: (r) => hrs(r.horas_max_cierre), align: 'right', sortKey: 'horas_max_cierre' },
];
