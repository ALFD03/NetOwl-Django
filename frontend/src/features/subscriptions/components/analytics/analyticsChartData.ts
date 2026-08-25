import { SURFACE } from '@/shared/constants/theme';
import { CHART_PALETTE } from '@/shared/constants/theme';
import type { DimensionVal, Periodo } from '@/shared/types/domain';
import type { ChartData } from 'chart.js';

export type MetricWeightMode = 'simple' | 'weighted';

export interface AnalyticsDistributionItem {
  label: string;
  value: number;
  weight: number;
}

export interface AnalyticsMetricConfig {
  dimensionKey: keyof DimensionVal;
  globalKey: keyof Periodo;
  mode: MetricWeightMode;
  unit?: '%' | '$' | 'number';
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
    }));
  }

  return dimensions
    .map((dimension) => {
      const value = toNumber(dimension[key]);

      return {
        label: dimension.valor,
        value,
        weight: (value / globalValue) * 100,
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
    }));
  }

  return weightedValues
    .map((item) => ({
      label: item.label,
      value: item.value,
      weight: (item.weightedValue / totalWeightedValue) * 100,
    }))
    .sort((a, b) => b.weight - a.weight);
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

export interface ChartDistributionItem {
  label: string;
  value: number;
  weight: number;
}

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

  return groupMinorItems(distribution);
}

export function toBarChartData(
  items: AnalyticsDistributionItem[],
): ChartData<'bar'> & {
  _raw: Array<{ label: string; original: number }>;
} {
  return {
    labels: items.map((item) => item.label),

    datasets: [
      {
        data: items.map((item) =>
          Number(item.weight.toFixed(2)),
        ),
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

export function toDoughnutChartData(
  items: AnalyticsDistributionItem[],
): ChartData<'doughnut'> & {
  _raw: Array<{ label: string; original: number }>;
} {
  return {
    labels: items.map((item) => item.label),

    datasets: [
      {
        data: items.map((item) =>
          Number(item.weight.toFixed(2)),
        ),
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