/**
 * El filtro por métrica de los reportes comerciales: «crecimiento >= 3»,
 * «churn > 2,5», «proyección < 100».
 *
 * Se aplica en dos niveles, a elegir: a cada zona (las filas de la tabla) o al
 * grupo que las reúne —el site en Ventas, el coordinador en Unidades de
 * Negocio—, medido sobre sus totales. Los valores son los mismos que la
 * pantalla enseña, y se comparan redondeados a dos decimales como se ven: si
 * una fila dice 3,00 %, «= 3» la encuentra y «> 3» no.
 */

import type { Projection } from '@/shared/lib/projection';

import { calcCommercial } from './commercial';
import type { Goal } from './targets';

export type FilterMetric = 'growth' | 'churn' | 'projection';
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=';
/** `zone`: cada fila de la tabla. `group`: el site o el coordinador, por sus totales. */
export type FilterLevel = 'zone' | 'group';

export interface MetricFilter {
  metric: FilterMetric;
  operator: FilterOperator;
  /** Tal como se escribió: vacío es «sin filtro». */
  value: string;
  level: FilterLevel;
}

export const EMPTY_METRIC_FILTER: MetricFilter = {
  metric: 'growth',
  operator: '>=',
  value: '',
  level: 'zone',
};

export const FILTER_METRICS: { value: FilterMetric; label: string }[] = [
  { value: 'growth', label: 'Crecimiento %' },
  { value: 'churn', label: 'Churn %' },
  { value: 'projection', label: 'Proyección %' },
];

export const FILTER_OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<='];

/** Lo que el campo admite mientras se escribe: un número con signo y decimales con punto o coma. */
export const FILTER_VALUE_PATTERN = /^-?\d*([.,]\d*)?$/;

/** Las tres métricas de una zona o de un grupo. `projection` es `null` sin un día de corte. */
export interface MetricValues {
  growth: number;
  churn: number;
  /** El cumplimiento de ventas proyectado al cierre, en % del objetivo. */
  projection: number | null;
}

/**
 * El umbral del filtro, o `null` si no filtra: sin valor, con un valor que no
 * es todavía un número («-», «3,») o filtrando por proyección sin un día que
 * proyectar.
 */
export function filterThreshold(filter: MetricFilter, projection: Projection | null): number | null {
  if (filter.metric === 'projection' && !projection) return null;
  const text = filter.value.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

const twoDecimals = (value: number) => Math.round(value * 100) / 100;

/** Si los valores cumplen el filtro. Con `umbral` nulo no se filtra nada. */
export function matchesFilter(values: MetricValues, filter: MetricFilter, threshold: number | null): boolean {
  if (threshold === null) return true;
  const raw = values[filter.metric];
  if (raw === null) return false;

  const value = twoDecimals(raw);
  const target = twoDecimals(threshold);
  switch (filter.operator) {
    case '=': return value === target;
    case '!=': return value !== target;
    case '>': return value > target;
    case '<': return value < target;
    case '>=': return value >= target;
    case '<=': return value <= target;
  }
}

/**
 * Las tres métricas a partir de las cifras de una zona o de un grupo.
 *
 * El filtro compara contra lo que se ve: la proyección sin recortar.
 */
export function metricValues(
  figures: {
    active_start?: number;
    active_end?: number;
    new_subs?: number;
    growth?: number;
    churn?: number;
  },
  goal: Goal,
  { projection }: { projection: Projection | null },
): MetricValues {
  const { projectedSalesCompliance } = calcCommercial(
    Number(figures.active_start ?? 0),
    Number(figures.active_end ?? 0),
    goal,
    { new_subs: Number(figures.new_subs ?? 0), projection },
  );
  return {
    growth: Number(figures.growth ?? 0),
    churn: Number(figures.churn ?? 0),
    projection: projectedSalesCompliance,
  };
}
