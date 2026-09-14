/** Distribuciones de una dimensión para la página de Analytics. */

import type { DimensionVal, Periodo } from '@/shared/types/domain';
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

export {
  RANKING_LIMIT,
  groupMinorItems,
  toBarChartData,
  toDoughnutChartData,
} from '@/shared/utils/distribution';

export type { MetricWeightMode } from '@/shared/utils/distribution';

export type AnalyticsDistributionItem = DistributionItem;
export type ChartDistributionItem = DistributionItem;

/**
 * Which way is "good" for a metric. Drives the accent of the readouts built on
 * it: growth is green, loss is red.
 */
export type MetricDirection = 'growth' | 'loss';

export interface AnalyticsMetricConfig extends RankingOptions {
  dimensionKey: keyof DimensionVal;
  globalKey: keyof Periodo;
  mode: MetricWeightMode;
  unit?: '%' | '$' | 'number';
  /** Defaults to `growth` where unset. */
  direction?: MetricDirection;
  round?: number;
}

/**
 * Subscriptions weights a rate by the size of the base it was measured on: a
 * 40% churn over 12 clients must not outweigh a 4% churn over 3.000.
 */
const POPULATION_KEY: keyof DimensionVal = 'activos_inicio';

/**
 * Obtiene la distribución correspondiente al tipo de cálculo definido para una
 * métrica.
 */
export function getMetricDistribution(
  dimensions: DimensionVal[],
  globalData: Periodo,
  config: AnalyticsMetricConfig,
): AnalyticsDistributionItem[] {
  if (config.mode === 'ranking') {
    return getRankingDistribution(dimensions, config.dimensionKey, config);
  }

  if (config.mode === 'weighted') {
    return getWeightedDistribution(dimensions, config.dimensionKey, POPULATION_KEY);
  }

  return getSimpleDistribution(
    dimensions,
    config.dimensionKey,
    toNumber(globalData[config.globalKey]),
  );
}

export function getChartDistribution(
  dimensions: DimensionVal[],
  globalData: Periodo,
  metric: AnalyticsMetricConfig,
): ChartDistributionItem[] {
  const distribution = getMetricDistribution(dimensions, globalData, metric);

  // Ranking carries no weights, so the "Otros < 1%" bucket has nothing to group
  // by — and the list is already capped at `limit`.
  if (metric.mode === 'ranking') {
    return distribution;
  }

  return groupMinorItems(distribution);
}
