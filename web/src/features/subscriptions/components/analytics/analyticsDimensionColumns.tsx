import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatTwoDecimals } from '@/shared/utils/formatters';
import type { DimensionVal } from '@/shared/types/domain';
import { TEXTO_TONO, tonoChurn, tonoCrecimiento } from '../../lib/objetivos';
import type { SemaforoObjetivos } from '../../types';

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
export const buildAnalyticsDimensionColumns = (s: SemaforoObjetivos): Column<DimensionVal>[] => [
  { header: 'Valor', accessor: (r) => <StickyLabel>{r.valor}</StickyLabel>, sortKey: 'valor' },

  { header: 'Base Ini', accessor: (r) => int(r.activos_inicio), align: 'right', sortKey: 'activos_inicio' },
  { header: 'Base Fin', accessor: (r) => int(r.activos_final), align: 'right', sortKey: 'activos_final' },

  { header: 'Nuevos', accessor: (r) => <span className="text-emerald-400">+{int(r.nuevos)}</span>, align: 'right', sortKey: 'nuevos' },
  { header: 'Adic. Net', accessor: (r) => <span className="text-emerald-500">{int(r.adiciones_netas)}</span>, align: 'right', sortKey: 'adiciones_netas' },
  { header: 'Adic. Bru', accessor: (r) => <span className="text-emerald-500">{int(r.adiciones_brutas)}</span>, align: 'right', sortKey: 'adiciones_brutas' },
  { header: 'Crec %', accessor: (r) => <span className={`font-bold ${TEXTO_TONO[tonoCrecimiento(r.crecimiento ?? 0, s)]}`}>{dec(r.crecimiento)}%</span>, align: 'right', sortKey: 'crecimiento' },

  { header: 'Bajas', accessor: (r) => <span className="text-rose-400">-{int(r.bajas)}</span>, align: 'right', sortKey: 'bajas' },
  { header: 'C. Neto %', accessor: (r) => <span className={`font-bold ${TEXTO_TONO[tonoChurn(r.churn_neto_pct ?? 0, s)]}`}>{dec(r.churn_neto_pct)}%</span>, align: 'right', sortKey: 'churn_neto_pct' },
  { header: 'C. Bruto %', accessor: (r) => <span className={TEXTO_TONO[tonoChurn(r.churn_bruto_pct ?? 0, s)]}>{dec(r.churn_bruto_pct)}%</span>, align: 'right', sortKey: 'churn_bruto_pct' },
  { header: 'Corte Imp', accessor: (r) => int(r.corte_impagado), align: 'right', sortKey: 'corte_impagado' },
  { header: 'Susp %', accessor: (r) => `${dec(r.porcentaje_suspensiones)}%`, align: 'right', sortKey: 'porcentaje_suspensiones' },
  { header: 'Gratuitos', accessor: (r) => <span className="text-purple-400">{int(r.clientes_gratuitos)}</span>, align: 'right', sortKey: 'clientes_gratuitos' },

  { header: 'React Tot', accessor: (r) => int(r.reactivaciones), align: 'right', sortKey: 'reactivaciones' },
  { header: 'React Val', accessor: (r) => int(r.react_val), align: 'right', sortKey: 'react_val' },
  { header: 'R. 4P', accessor: (r) => int(r.react_4_P), align: 'right', sortKey: 'react_4_P' },
  { header: 'Winback %', accessor: (r) => <span className="text-blue-400">{dec(r.tasa_winback_pct)}%</span>, align: 'right', sortKey: 'tasa_winback_pct' },
  { header: 'Aporte R %', accessor: (r) => `${dec(r.tasa_aporte_react_pct)}%`, align: 'right', sortKey: 'tasa_aporte_react_pct' },
  { header: 'Reempl %', accessor: (r) => `${dec(r.indice_reemplazo_react_pct)}%`, align: 'right', sortKey: 'indice_reemplazo_react_pct' },

  { header: 'ARPU', accessor: (r) => <span className="text-amber-400">${dec(r.arpu)}</span>, align: 'right', sortKey: 'arpu' },
  { header: 'Billing', accessor: (r) => <span className="text-blue-400">${dec(r.total_billing)}</span>, align: 'right', sortKey: 'total_billing' },
];
