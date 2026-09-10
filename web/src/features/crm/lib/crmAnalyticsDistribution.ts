import { toNumber } from '@/shared/utils/formatters';
import {
  getRankingDistribution,
  getSimpleDistribution,
  getWeightedDistribution,
  groupMinorItems,
  type DistributionItem,
  type MetricWeightMode,
  type RankingOptions,
} from '@/shared/utils/distribution';
import type { CrmDimensionValue, CrmHistoricoRow } from '../types';

/**
 * Keys whose value is a number. Both CRM row types also carry `efectividad`,
 * a list — pointing a chart at it would only fail once the data arrived.
 */
type NumericKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never;
}[keyof T];

export interface CrmMetricConfig extends RankingOptions {
  dimensionKey: NumericKeys<CrmDimensionValue>;
  globalKey: NumericKeys<CrmHistoricoRow>;
  mode: MetricWeightMode;
  unit?: '%' | 'h' | 'number';
  round?: number;
}

/**
 * CRM weights a rate by how many opportunities it was measured over: a branch
 * that installed 1 of its 2 leads is not a better performer than one that
 * installed 400 of 900.
 */
const POPULATION_KEY: NumericKeys<CrmDimensionValue> = 'total_oportunidades';

export const CRM_ANALYTICS_METRICS = {
  /** Share of the period's opportunities each dimension value opened. */
  oportunidades: {
    dimensionKey: 'total_oportunidades',
    globalKey: 'total_oportunidades',
    mode: 'simple',
    unit: 'number',
    round: 0,
  },

  /** Share of the period's installs each dimension value closed. */
  instalados: {
    dimensionKey: 'ganados',
    globalKey: 'ganados',
    mode: 'simple',
    unit: 'number',
    round: 0,
  },

  /**
   * Fastest average time to install. Ranked ascending because low is good, and
   * with zeros dropped: a 0 means the value installed nothing this period, not
   * that it installed instantly.
   */
  tiempoInstalacion: {
    dimensionKey: 'horas_promedio_inst',
    globalKey: 'horas_promedio_inst',
    mode: 'ranking',
    unit: 'h',
    order: 'asc',
    excludeZero: true,
    round: 0,
  },
} satisfies Record<string, CrmMetricConfig>;

export type CrmAnalyticsMetricKey = keyof typeof CRM_ANALYTICS_METRICS;

export function getCrmChartDistribution(
  dimensions: CrmDimensionValue[],
  globalData: CrmHistoricoRow,
  metric: CrmMetricConfig,
): DistributionItem[] {
  if (metric.mode === 'ranking') {
    return getRankingDistribution(dimensions, metric.dimensionKey, metric);
  }

  const distribution =
    metric.mode === 'weighted'
      ? getWeightedDistribution(dimensions, metric.dimensionKey, POPULATION_KEY)
      : getSimpleDistribution(
          dimensions,
          metric.dimensionKey,
          toNumber(globalData[metric.globalKey]),
        );

  return groupMinorItems(distribution);
}
