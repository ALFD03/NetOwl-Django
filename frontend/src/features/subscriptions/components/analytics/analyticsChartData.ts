import { SURFACE } from '@/shared/constants/theme';
import { CHART_PALETTE } from '@/shared/constants/theme';
import type { DimensionVal, Periodo } from '@/shared/types/domain';
import type { ChartData } from 'chart.js';

export type MetricWeightMode = 'simple' | 'weighted' | 'ranking';

/** Default number of entries kept by `ranking` mode. */
export const RANKING_LIMIT = 10;

export interface AnalyticsDistributionItem {
  /** Dimension name, e.g. the zone or branch. */
  label: string;
  /** The metric as reported, in its own unit. */
  value: number;
  /** Share of the global figure, as a percentage. Always 0 in `ranking` mode. */
  weight: number;
  /**
   * The number actually drawn on the chart: `weight` for the share-based modes,
   * `value` for `ranking`. Builders read this so they never need to know the mode.
   */
  plotted: number;
}

export interface AnalyticsMetricConfig {
  dimensionKey: keyof DimensionVal;
  globalKey: keyof Periodo;
  mode: MetricWeightMode;
  unit?: '%' | '$' | 'number';
  /** `ranking` mode only: how many entries to keep. Defaults to `RANKING_LIMIT`. */
  limit?: number;
}

/**
 * Convierte un valor recibido desde los datos
 * en un número seguro.
 */
export function toNumber(
  value: string | number | undefined,
): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

/**
 * Distribución simple:
 *
 * weight = valor de la dimensión / valor global * 100
 *
 * Se utiliza para métricas absolutas donde cada unidad
 * tiene el mismo peso.
 */
export function getSimpleMetricDistribution(
  dimensions: DimensionVal[],
  key: keyof DimensionVal,
  globalValue: number,
): AnalyticsDistributionItem[] {
  if (!globalValue) {
    return dimensions.map((dimension) => ({
      label: dimension.valor,
      value: toNumber(dimension[key]),
      weight: 0,
      plotted: 0,
    }));
  }

  return dimensions
    .map((dimension) => {
      const value = toNumber(dimension[key]);

      const weight = (value / globalValue) * 100;

      return {
        label: dimension.valor,
        value,
        weight,
        plotted: weight,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Distribución ponderada:
 *
 * weightedValue = métrica * activos_inicio
 *
 * contribution =
 *   weightedValue / suma(weightedValue) * 100
 *
 * Se utiliza para métricas compuestas o tasas,
 * donde el tamaño de la población de cada dimensión
 * determina su peso dentro del resultado global.
 */
export function getWeightedMetricDistribution(
  dimensions: DimensionVal[],
  key: keyof DimensionVal,
): AnalyticsDistributionItem[] {
  const weightedValues = dimensions.map((dimension) => {
    const value = toNumber(dimension[key]);
    const activosInicio = toNumber(dimension.activos_inicio);

    return {
      label: dimension.valor,
      value,
      activosInicio,
      weightedValue: value * activosInicio,
    };
  });

  const totalWeightedValue = weightedValues.reduce(
    (total, item) => total + item.weightedValue,
    0,
  );

  if (!totalWeightedValue) {
    return weightedValues.map((item) => ({
      label: item.label,
      value: item.value,
      weight: 0,
      plotted: 0,
    }));
  }

  return weightedValues
    .map((item) => {
      const weight = (item.weightedValue / totalWeightedValue) * 100;

      return {
        label: item.label,
        value: item.value,
        weight,
        plotted: weight,
      };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Ranking:
 *
 * No calcula ningún peso. Muestra el valor tal cual viene,
 * ordenado de mayor a menor, y conserva únicamente las
 * primeras `limit` dimensiones.
 *
 * Se utiliza cuando interesa comparar magnitudes reales entre
 * dimensiones, no su participación dentro del total global.
 */
export function getRankingDistribution(
  dimensions: DimensionVal[],
  key: keyof DimensionVal,
  limit: number = RANKING_LIMIT,
): AnalyticsDistributionItem[] {
  return dimensions
    .map((dimension) => {
      const value = toNumber(dimension[key]);

      return {
        label: dimension.valor,
        value,
        weight: 0,
        plotted: value,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/**
 * Obtiene la distribución correspondiente al tipo
 * de cálculo definido para una métrica.
 */
export function getMetricDistribution(
  dimensions: DimensionVal[],
  globalData: Periodo,
  config: AnalyticsMetricConfig,
): AnalyticsDistributionItem[] {
  if (config.mode === 'ranking') {
    return getRankingDistribution(
      dimensions,
      config.dimensionKey,
      config.limit,
    );
  }

  if (config.mode === 'weighted') {
    return getWeightedMetricDistribution(
      dimensions,
      config.dimensionKey,
    );
  }

  return getSimpleMetricDistribution(
    dimensions,
    config.dimensionKey,
    toNumber(globalData[config.globalKey]),
  );
}

export type ChartDistributionItem = AnalyticsDistributionItem;

export function groupMinorItems(
  items: AnalyticsDistributionItem[],
  threshold = 1,
): ChartDistributionItem[] {
  const majorItems = items.filter(
    (item) => item.weight >= threshold,
  );

  const minorItems = items.filter(
    (item) => item.weight < threshold,
  );

  const othersWeight = minorItems.reduce(
    (total, item) => total + item.weight,
    0,
  );

  if (othersWeight <= 0) {
    return majorItems;
  }

  return [
    ...majorItems,
    {
      label: `Otros < ${threshold}%`,
      value: minorItems.reduce(
        (total, item) => total + item.value,
        0,
      ),
      weight: othersWeight,
      plotted: othersWeight,
    },
  ];
}

export function getChartDistribution(
  dimensions: DimensionVal[],
  globalData: Periodo,
  metric: AnalyticsMetricConfig,
): ChartDistributionItem[] {
  const distribution = getMetricDistribution(
    dimensions,
    globalData,
    metric,
  );

  // Ranking carries no weights, so the "Otros < 1%" bucket has nothing to group
  // by — and the list is already capped at `limit`.
  if (metric.mode === 'ranking') {
    return distribution;
  }

  return groupMinorItems(distribution);
}

type WithRaw<T> = T & { _raw: Array<{ label: string; original: number }> };

/**
 * Shared shape for both chart kinds: they differed only in the `ChartData`
 * generic. `plotted` is what gets drawn; `_raw` keeps the unformatted value
 * around for the hover readout.
 */
function toDistributionChartData(items: AnalyticsDistributionItem[]) {
  return {
    labels: items.map((item) => item.label),

    datasets: [
      {
        data: items.map((item) => Number(item.plotted.toFixed(2))),
        backgroundColor: CHART_PALETTE,
        borderWidth: 2,
        borderColor: SURFACE.secondary,
      },
    ],

    _raw: items.map((item) => ({
      label: item.label,
      original: item.value,
    })),
  };
}

export function toBarChartData(
  items: AnalyticsDistributionItem[],
): WithRaw<ChartData<'bar'>> {
  return toDistributionChartData(items);
}

export function toDoughnutChartData(
  items: AnalyticsDistributionItem[],
): WithRaw<ChartData<'doughnut'>> {
  return toDistributionChartData(items);
}
