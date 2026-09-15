/** Las columnas de las tablas de resultados y de sus dimensiones. */

import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatPeriodoLabel, formatTwoDecimals } from '@/shared/utils/formatters';
import type { SubscriptionCierre, SubscriptionResultDimensionRow } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;

const meta_ingresos = (activos_inicio: number) => activos_inicio * 0.06;
const meta_ventas = (activos_inicio: number) => activos_inicio * 0.06;
const meta_cierre = (activos_inicio: number) => activos_inicio * 1.06;
/** Top-level period history. */
export const PERIOD_COLUMNS: Column<SubscriptionCierre>[] = [
  { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{formatPeriodoLabel(r.periodo_reporte)}</span>, sortKey: 'periodo_reporte' },
  { header: 'Inicio', accessor: (r) => int(r.activos_inicio), align: 'right', sortKey: 'activos_inicio' },
  { header: 'Final', accessor: (r) => int(r.activos_final), align: 'right', sortKey: 'activos_final' },
  { header: 'Instalaciones', accessor: (r) => <span className="font-semibold text-emerald-400">+{int(r.nuevos_mes)}</span>, align: 'right', sortKey: 'nuevos_mes' },
  { header: 'Bajas', accessor: (r) => <span className="font-semibold text-rose-400">-{int(r.bajas)}</span>, align: 'right', sortKey: 'bajas' },
  { header: 'Churn Rate', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.churn_bruto_pct)}%</span>, align: 'right', sortKey: 'churn_bruto_pct' },
  { header: 'Crecimiento', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.crecimiento)}%</span>, align: 'right', sortKey: 'crecimiento' },
  { header: 'Cumpli. Ingresos', accessor: (r) => <span className={`font-semibold ${Number(dec((r.adiciones_brutas/meta_ingresos(r.activos_inicio))*100)) >= 100 ? 'text-emerald-400' : Number(dec((r.adiciones_brutas/meta_ingresos(r.activos_inicio))*100)) >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{dec((r.adiciones_brutas/meta_ingresos(r.activos_inicio))*100)} %</span>, align: 'right', sortKey: 'cumplimiento_ingresos' },
  { header: 'Cumpli. Ventas', accessor: (r) => <span className={`font-semibold ${Number(dec((r.nuevos_mes/meta_ventas(r.activos_inicio))*100)) >= 100 ? 'text-emerald-400' : Number(dec((r.nuevos_mes/meta_ventas(r.activos_inicio))*100)) >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{dec((r.nuevos_mes/meta_ventas(r.activos_inicio))*100)} %</span>, align: 'right', sortKey: 'cumplimiento_ventas' },
  { header: 'Cumpli. Cierre', accessor: (r) => <span className={`font-semibold ${Number(dec((r.activos_final/meta_cierre(r.activos_inicio))*100)) >= 100 ? 'text-emerald-400' : Number(dec((r.activos_final/meta_cierre(r.activos_inicio))*100)) >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>{dec((r.activos_final/meta_cierre(r.activos_inicio))*100)} %</span>, align: 'right', sortKey: 'cumplimiento_cierre' },
];

/** Full dimensional breakdown shown inside the period modal. */
export const DIMENSION_COLUMNS: Column<SubscriptionResultDimensionRow>[] = [
  { header: 'Etiqueta', accessor: (r) => <StickyLabel minWidth="160px">{r.valor}</StickyLabel>, sortKey: 'valor' },
  { header: 'Base Ini', accessor: (r) => int(r.activos_inicio), align: 'right', sortKey: 'activos_inicio' },
  { header: 'Base Fin', accessor: (r) => int(r.activos_final), align: 'right', sortKey: 'activos_final' },
  { header: 'Nuevos', accessor: (r) => <span className="text-emerald-400">+{int(r.nuevos)}</span>, align: 'right', sortKey: 'nuevos' },
  { header: 'Adic. Net', accessor: (r) => <span className="text-emerald-500">{int(r.adiciones_netas)}</span>, align: 'right', sortKey: 'adiciones_netas' },
  { header: 'Adic. Bru', accessor: (r) => <span className="text-emerald-500">{int(r.adiciones_brutas)}</span>, align: 'right', sortKey: 'adiciones_brutas' },
  { header: 'Crec %', accessor: (r) => <span className="text-emerald-400">{dec(r.crecimiento)}%</span>, align: 'right', sortKey: 'crecimiento' },
  { header: 'Bajas', accessor: (r) => <span className="text-rose-400">-{int(r.bajas)}</span>, align: 'right', sortKey: 'bajas' },
  { header: 'C. Neto %', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.churn_neto_pct)}%</span>, align: 'right', sortKey: 'churn_neto_pct' },
  { header: 'C. Bruto %', accessor: (r) => <span className="text-rose-400">{dec(r.churn_bruto_pct)}%</span>, align: 'right', sortKey: 'churn_bruto_pct' },
  { header: 'Corte Imp', accessor: (r) => int(r.corte_impagado), align: 'right', sortKey: 'corte_impagado' },
  { header: 'Susp %', accessor: (r) => `${dec(r.porcentaje_suspensiones)}%`, align: 'right', sortKey: 'porcentaje_suspensiones' },
  { header: 'Gratuitos', accessor: (r) => <span className="text-purple-400">{int(r.clientes_gratuitos)}</span>, align: 'right', sortKey: 'clientes_gratuitos' },
  { header: 'Inactivos', accessor: (r) => int(r.total_inactivos), align: 'right', sortKey: 'total_inactivos' },
  { header: 'React Tot', accessor: (r) => int(r.reactivaciones), align: 'right', sortKey: 'reactivaciones' },
  { header: 'React Val', accessor: (r) => int(r.react_val), align: 'right', sortKey: 'react_val' },
  { header: 'W. Churn', accessor: (r) => int(r.react_6_churn), align: 'right', sortKey: 'react_6_churn' },
  { header: 'W. 30d', accessor: (r) => int(r.react_8_30days), align: 'right', sortKey: 'react_8_30days' },
  { header: 'W. Pausa', accessor: (r) => int(r.react_4_paused), align: 'right', sortKey: 'react_4_paused' },
  { header: 'R. 4P', accessor: (r) => int(r.react_4_P), align: 'right', sortKey: 'react_4_P' },
  { header: 'R. 4H', accessor: (r) => int(r.react_4_H), align: 'right', sortKey: 'react_4_H' },
  { header: 'Winback %', accessor: (r) => <span className="text-blue-400">{dec(r.tasa_winback_pct)}%</span>, align: 'right', sortKey: 'tasa_winback_pct' },
  { header: 'Aporte R%', accessor: (r) => `${dec(r.tasa_aporte_react_pct)}%`, align: 'right', sortKey: 'tasa_aporte_react_pct' },
  { header: 'Reempl %', accessor: (r) => `${dec(r.indice_reemplazo_react_pct)}%`, align: 'right', sortKey: 'indice_reemplazo_react_pct' },
  { header: 'ARPU', accessor: (r) => <span className="text-amber-400">${dec(r.arpu)}</span>, align: 'right', sortKey: 'arpu' },
  { header: 'Billing', accessor: (r) => <span className="text-blue-400">${dec(r.total_billing)}</span>, align: 'right', sortKey: 'total_billing' },
];
