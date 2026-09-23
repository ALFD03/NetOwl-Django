/** Las columnas de las tablas de resultados y de sus dimensiones. */

import { StickyLabel, type Column } from '@/shared/ui';
import { formatInteger, formatPeriodoLabel, formatTwoDecimals } from '@/shared/utils/formatters';
import {
  TEXTO_TONO,
  cumplimientoDelPeriodo,
  tonoCumplimiento,
  type ResolverObjetivos,
} from '../../lib/objetivos';
import type { SemaforoObjetivos, SubscriptionCierre, SubscriptionResultDimensionRow } from '../../types';

const int = formatInteger;
const dec = formatTwoDecimals;

/**
 * Top-level period history.
 *
 * Una fábrica y no una constante: el color del cumplimiento depende del
 * semáforo del catálogo. Los `cumplimiento_*` los añade a cada fila
 * `conCumplimiento`, con el objetivo de su mes; por eso las columnas pueden
 * ordenarse por ellos.
 */
export function buildPeriodColumns(semaforo: SemaforoObjetivos): Column<SubscriptionCierre>[] {
  const cumplimiento = (valor: number) => (
    <span className={`font-semibold ${TEXTO_TONO[tonoCumplimiento(valor, semaforo)]}`}>{dec(valor)} %</span>
  );
  return [
    { header: 'Periodo', accessor: (r) => <span className="font-bold text-white">{formatPeriodoLabel(r.periodo_reporte)}</span>, sortKey: 'periodo_reporte' },
    { header: 'Inicio', accessor: (r) => int(r.activos_inicio), align: 'right', sortKey: 'activos_inicio' },
    { header: 'Final', accessor: (r) => int(r.activos_final), align: 'right', sortKey: 'activos_final' },
    { header: 'Instalaciones', accessor: (r) => <span className="font-semibold text-emerald-400">+{int(r.nuevos_mes)}</span>, align: 'right', sortKey: 'nuevos_mes' },
    { header: 'Bajas', accessor: (r) => <span className="font-semibold text-rose-400">-{int(r.bajas)}</span>, align: 'right', sortKey: 'bajas' },
    { header: 'Churn Rate', accessor: (r) => <span className="font-bold text-rose-400">{dec(r.churn_bruto_pct)}%</span>, align: 'right', sortKey: 'churn_bruto_pct' },
    { header: 'Crecimiento', accessor: (r) => <span className="font-bold text-emerald-400">{dec(r.crecimiento)}%</span>, align: 'right', sortKey: 'crecimiento' },
    { header: 'Cumpli. Ingresos', accessor: (r) => cumplimiento(r.cumplimiento_ingresos), align: 'right', sortKey: 'cumplimiento_ingresos' },
    { header: 'Cumpli. Ventas', accessor: (r) => cumplimiento(r.cumplimiento_ventas), align: 'right', sortKey: 'cumplimiento_ventas' },
    { header: 'Cumpli. Cierre', accessor: (r) => cumplimiento(r.cumplimiento_cierre), align: 'right', sortKey: 'cumplimiento_cierre' },
  ];
}

/**
 * Las filas de cierres con su cumplimiento, cada una contra el objetivo de su
 * mes. El backend no los envía: son objetivos, no métricas del análisis.
 */
export function conCumplimiento(
  periodos: SubscriptionCierre[],
  objetivos: ResolverObjetivos,
): SubscriptionCierre[] {
  return periodos.map((periodo) => {
    const c = cumplimientoDelPeriodo(periodo, objetivos.general(periodo.periodo_reporte));
    return {
      ...periodo,
      cumplimiento_ingresos: c.cumplimientoIngresos,
      cumplimiento_ventas: c.cumplimientoVentas,
      cumplimiento_cierre: c.cumplimientoCierre,
    };
  });
}

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
