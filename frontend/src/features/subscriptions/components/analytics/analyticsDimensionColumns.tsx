import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import type { DimensionVal } from '@/shared/types/domain';
import { TONE_TEXT, churnTone, growthTone } from '../../lib/targets';
import type { TargetsTrafficLight } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;

/**
 * Every measure carried by `DimensionVal`, in the order the analysis produces
 * them: base, growth, loss, reactivation, revenue.
 *
 * This is the raw read of the period — no weighting, no ranking, no `Otros`
 * bucket — so it is the table to check a chart against.
 *
 * Una fábrica y no una constante: crecimiento y churn se pintan con el semáforo
 * del catálogo.
 */
export const buildAnalyticsDimensionColumns = (s: TargetsTrafficLight): Column<DimensionVal>[] => [
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.value}</StickyLabel>, sortKey: 'value', sticky: true },

  { header: 'Base Ini', accessor: (r) => int(r.active_start), align: 'right', sortKey: 'active_start' },
  { header: 'Base Fin', accessor: (r) => int(r.active_end), align: 'right', sortKey: 'active_end' },

  { header: 'Nuevos', accessor: (r) => <span className="text-emerald-400">+{int(r.new_subs)}</span>, align: 'right', sortKey: 'new_subs' },
  { header: 'Adic. Net', accessor: (r) => <span className="text-emerald-500">{int(r.net_adds)}</span>, align: 'right', sortKey: 'net_adds' },
  { header: 'Adic. Bru', accessor: (r) => <span className="text-emerald-500">{int(r.gross_adds)}</span>, align: 'right', sortKey: 'gross_adds' },
  { header: 'Crec %', accessor: (r) => <span className={`font-bold ${TONE_TEXT[growthTone(r.growth ?? 0, s)]}`}>{dec(r.growth)}%</span>, align: 'right', sortKey: 'growth' },

  { header: 'Bajas', accessor: (r) => <span className="text-rose-400">-{int(r.churned)}</span>, align: 'right', sortKey: 'churned' },
  { header: 'C. Neto %', accessor: (r) => <span className={`font-bold ${TONE_TEXT[churnTone(r.net_churn_pct ?? 0, s)]}`}>{dec(r.net_churn_pct)}%</span>, align: 'right', sortKey: 'net_churn_pct' },
  { header: 'C. Bruto %', accessor: (r) => <span className={TONE_TEXT[churnTone(r.gross_churn_pct ?? 0, s)]}>{dec(r.gross_churn_pct)}%</span>, align: 'right', sortKey: 'gross_churn_pct' },
  { header: 'Corte Imp', accessor: (r) => int(r.unpaid_cuts), align: 'right', sortKey: 'unpaid_cuts' },
  { header: 'Susp %', accessor: (r) => `${dec(r.suspension_pct)}%`, align: 'right', sortKey: 'suspension_pct' },
  { header: 'Gratuitos', accessor: (r) => <span className="text-purple-400">{int(r.free_clients)}</span>, align: 'right', sortKey: 'free_clients' },

  { header: 'React Tot', accessor: (r) => int(r.reactivations), align: 'right', sortKey: 'reactivations' },
  { header: 'React Val', accessor: (r) => int(r.react_val), align: 'right', sortKey: 'react_val' },
  { header: 'R. 4P', accessor: (r) => int(r.react_4_P), align: 'right', sortKey: 'react_4_P' },
  { header: 'Recuperación %', accessor: (r) => <span className="text-blue-400">{dec(r.winback_rate_pct)}%</span>, align: 'right', sortKey: 'winback_rate_pct' },
  { header: 'Aporte R %', accessor: (r) => `${dec(r.react_contribution_pct)}%`, align: 'right', sortKey: 'react_contribution_pct' },
  { header: 'Reempl %', accessor: (r) => `${dec(r.react_replacement_pct)}%`, align: 'right', sortKey: 'react_replacement_pct' },

  { header: 'ARPU', accessor: (r) => <span className="text-amber-400">${dec(r.arpu)}</span>, align: 'right', sortKey: 'arpu' },
  { header: 'Billing', accessor: (r) => <span className="text-blue-400">${dec(r.total_billing)}</span>, align: 'right', sortKey: 'total_billing' },
];
