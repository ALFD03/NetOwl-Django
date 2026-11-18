/** Las columnas de las tablas de resultados y de sus dimensiones. */

import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatPeriodLabel, formatTwoDecimals } from '@/shared/utils/formatters';
import {
  TONE_TEXT,
  periodCompliance,
  tonoChurn,
  tonoCrecimiento,
  complianceTone,
  type TargetsResolver,
} from '../../lib/targets';
import type { TargetsTrafficLight, SubscriptionClose, SubscriptionResultDimensionRow } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;

/**
 * Top-level period history.
 *
 * Una fábrica y no una constante: churn, crecimiento y cumplimiento se pintan
 * con el semáforo del catálogo. Los `cumplimiento_*` los añade a cada fila
 * `withComplianceData`, con el objetivo de su mes; por eso las columnas pueden
 * ordenarse por ellos.
 */
export function buildPeriodColumns(semaforo: TargetsTrafficLight): Column<SubscriptionClose>[] {
  const cumplimiento = (valor: number) => (
    <span className={`font-semibold ${TONE_TEXT[complianceTone(valor, semaforo)]}`}>{dec(valor)} %</span>
  );
  return [
    { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{formatPeriodLabel(r.report_period)}</span>, sortKey: 'report_period' },
    { header: 'Inicio', accessor: (r) => int(r.active_start), align: 'right', sortKey: 'active_start' },
    { header: 'Final', accessor: (r) => int(r.active_end), align: 'right', sortKey: 'active_end' },
    { header: 'Instalaciones', accessor: (r) => <span className="font-semibold text-emerald-400">+{int(r.new_in_month)}</span>, align: 'right', sortKey: 'new_in_month' },
    { header: 'Bajas', accessor: (r) => <span className="font-semibold text-rose-400">-{int(r.churned)}</span>, align: 'right', sortKey: 'churned' },
    { header: 'Churn Rate', accessor: (r) => <span className={`font-bold ${TONE_TEXT[tonoChurn(r.gross_churn_pct, semaforo)]}`}>{dec(r.gross_churn_pct)}%</span>, align: 'right', sortKey: 'gross_churn_pct' },
    { header: 'Crecimiento', accessor: (r) => <span className={`font-bold ${TONE_TEXT[tonoCrecimiento(r.growth, semaforo)]}`}>{dec(r.growth)}%</span>, align: 'right', sortKey: 'growth' },
    { header: 'Cumpli. Ingresos', accessor: (r) => cumplimiento(r.cumplimiento_ingresos), align: 'right', sortKey: 'cumplimiento_ingresos' },
    { header: 'Cumpli. Ventas', accessor: (r) => cumplimiento(r.cumplimiento_ventas), align: 'right', sortKey: 'cumplimiento_ventas' },
    { header: 'Cumpli. Cierre', accessor: (r) => cumplimiento(r.cumplimiento_cierre), align: 'right', sortKey: 'cumplimiento_cierre' },
  ];
}

/**
 * Las filas de cierres con su cumplimiento, cada una contra el objetivo de su
 * mes. El backend no los envía: son objetivos, no métricas del análisis.
 */
export function withComplianceData(
  periodos: SubscriptionClose[],
  objetivos: TargetsResolver,
): SubscriptionClose[] {
  return periodos.map((periodo) => {
    const c = periodCompliance(periodo, objetivos.general(periodo.report_period));
    return {
      ...periodo,
      cumplimiento_ingresos: c.revenueCompliance,
      cumplimiento_ventas: c.salesCompliance,
      cumplimiento_cierre: c.closeCompliance,
    };
  });
}

/** Full dimensional breakdown shown inside the period modal, con el semáforo en churn y crecimiento. */
export const buildDimensionColumns = (s: TargetsTrafficLight): Column<SubscriptionResultDimensionRow>[] => [
  { header: 'Etiqueta', accessor: (r) => <StickyLabel minWidth="160px">{r.value}</StickyLabel>, sortKey: 'value', sticky: true },
  { header: 'Base Ini', accessor: (r) => int(r.active_start), align: 'right', sortKey: 'active_start' },
  { header: 'Base Fin', accessor: (r) => int(r.active_end), align: 'right', sortKey: 'active_end' },
  { header: 'Nuevos', accessor: (r) => <span className="text-emerald-400">+{int(r.new_subs)}</span>, align: 'right', sortKey: 'new_subs' },
  { header: 'Adic. Net', accessor: (r) => <span className="text-emerald-500">{int(r.net_adds)}</span>, align: 'right', sortKey: 'net_adds' },
  { header: 'Adic. Bru', accessor: (r) => <span className="text-emerald-500">{int(r.gross_adds)}</span>, align: 'right', sortKey: 'gross_adds' },
  { header: 'Crec %', accessor: (r) => <span className={TONE_TEXT[tonoCrecimiento(r.growth, s)]}>{dec(r.growth)}%</span>, align: 'right', sortKey: 'growth' },
  { header: 'Bajas', accessor: (r) => <span className="text-rose-400">-{int(r.churned)}</span>, align: 'right', sortKey: 'churned' },
  { header: 'C. Neto %', accessor: (r) => <span className={`font-bold ${TONE_TEXT[tonoChurn(r.net_churn_pct, s)]}`}>{dec(r.net_churn_pct)}%</span>, align: 'right', sortKey: 'net_churn_pct' },
  { header: 'C. Bruto %', accessor: (r) => <span className={TONE_TEXT[tonoChurn(r.gross_churn_pct, s)]}>{dec(r.gross_churn_pct)}%</span>, align: 'right', sortKey: 'gross_churn_pct' },
  { header: 'Corte Imp', accessor: (r) => int(r.unpaid_cuts), align: 'right', sortKey: 'unpaid_cuts' },
  { header: 'Susp %', accessor: (r) => `${dec(r.suspension_pct)}%`, align: 'right', sortKey: 'suspension_pct' },
  { header: 'Gratuitos', accessor: (r) => <span className="text-purple-400">{int(r.free_clients)}</span>, align: 'right', sortKey: 'free_clients' },
  { header: 'Inactivos', accessor: (r) => int(r.total_inactive), align: 'right', sortKey: 'total_inactive' },
  { header: 'React Tot', accessor: (r) => int(r.reactivations), align: 'right', sortKey: 'reactivations' },
  { header: 'React Val', accessor: (r) => int(r.react_val), align: 'right', sortKey: 'react_val' },
  { header: 'W. Churn', accessor: (r) => int(r.react_6_churn), align: 'right', sortKey: 'react_6_churn' },
  { header: 'W. 30d', accessor: (r) => int(r.react_8_30days), align: 'right', sortKey: 'react_8_30days' },
  { header: 'W. Pausa', accessor: (r) => int(r.react_4_paused), align: 'right', sortKey: 'react_4_paused' },
  { header: 'R. 4P', accessor: (r) => int(r.react_4_P), align: 'right', sortKey: 'react_4_P' },
  { header: 'R. 4H', accessor: (r) => int(r.react_4_H), align: 'right', sortKey: 'react_4_H' },
  { header: 'Recuperación %', accessor: (r) => <span className="text-blue-400">{dec(r.winback_rate_pct)}%</span>, align: 'right', sortKey: 'winback_rate_pct' },
  { header: 'Aporte R%', accessor: (r) => `${dec(r.react_contribution_pct)}%`, align: 'right', sortKey: 'react_contribution_pct' },
  { header: 'Reempl %', accessor: (r) => `${dec(r.react_replacement_pct)}%`, align: 'right', sortKey: 'react_replacement_pct' },
  { header: 'ARPU', accessor: (r) => <span className="text-amber-400">${dec(r.arpu)}</span>, align: 'right', sortKey: 'arpu' },
  { header: 'Billing', accessor: (r) => <span className="text-blue-400">${dec(r.total_billing)}</span>, align: 'right', sortKey: 'total_billing' },
];
