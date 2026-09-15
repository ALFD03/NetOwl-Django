/**
 * Distribuciones y rankings de una dimensión, y su paso a datos de gráfico.
 *
 * Tres lecturas distintas —simple, ponderada y ranking— más el agrupado de los
 * valores menores en «Otros», que es lo que evita gráficos de cien porciones.
 */

import { CHART_PALETTE, SURFACE } from '@/shared/constants/theme';
import type { ChartData } from 'chart.js';
import { toNumber, type NumericValue } from './formatters';

/**
 * Domain-agnostic core of the dimensional charts.
 *
 * Every analytics page asks the same question of its data — "how does this
 * measure split across the values of a dimension?" — and answers it in one of
 * three ways. The modes live here so Subscriptions and CRM cannot drift apart
 * in how they weight a chart; each feature only supplies its own row type and
 * its own metric catalogue on top.
 */

/** Any dimension row: whatever else it carries, it is named by `valor`. */
export interface DimensionRow {
  valor: string;
}

export type MetricWeightMode = 'simple' | 'weighted' | 'ranking';

/** Default number of entries kept by `ranking` mode. */
export const RANKING_LIMIT = 10;

export interface DistributionItem {
  /** Dimension name, e.g. the zone or the branch. */
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

export interface RankingOptions {
  /** How many entries to keep. Defaults to `RANKING_LIMIT`. */
  limit?: number;
  /**
   * `desc` (default) ranks the largest values first. `asc` ranks the smallest
   * first — what a "fastest time" chart wants, where low is good.
   */
  order?: 'desc' | 'asc';
  /**
   * Drop rows whose value is 0 before ranking. Under `asc` a zero is almost
   * never a real winner: it means "no cases", not "instant".
   */
  excludeZero?: boolean;
}

const read = <T,>(row: T, key: keyof T): number => toNumber(row[key] as NumericValue);

/**
 * Distribución simple:
 *
 * weight = valor de la dimensión / valor global * 100
 *
 * Se utiliza para métricas absolutas donde cada unidad tiene el mismo peso.
 */
export function getSimpleDistribution<T extends DimensionRow>(
  rows: T[],
  key: keyof T,
  globalValue: number,
): DistributionItem[] {
  if (!globalValue) {
    return rows.map((row) => ({
      label: row.valor,
      value: read(row, key),
      weight: 0,
      plotted: 0,
    }));
  }

  return rows
    .map((row) => {
      const value = read(row, key);
      const weight = (value / globalValue) * 100;

      return { label: row.valor, value, weight, plotted: weight };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Distribución ponderada:
 *
 * weightedValue = métrica * población
 * contribution  = weightedValue / suma(weightedValue) * 100
 *
 * Se utiliza para métricas compuestas o tasas, donde el tamaño de la población
 * de cada dimensión determina su peso dentro del resultado global.
 */
export function getWeightedDistribution<T extends DimensionRow>(
  rows: T[],
  key: keyof T,
  populationKey: keyof T,
): DistributionItem[] {
  const weighted = rows.map((row) => {
    const value = read(row, key);

    return {
      label: row.valor,
      value,
      weightedValue: value * read(row, populationKey),
    };
  });

  const totalWeightedValue = weighted.reduce((total, item) => total + item.weightedValue, 0);

  if (!totalWeightedValue) {
    return weighted.map((item) => ({
      label: item.label,
      value: item.value,
      weight: 0,
      plotted: 0,
    }));
  }

  return weighted
    .map((item) => {
      const weight = (item.weightedValue / totalWeightedValue) * 100;

      return { label: item.label, value: item.value, weight, plotted: weight };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Ranking:
 *
 * No calcula ningún peso. Muestra el valor tal cual viene, ordenado según
 * `order`, y conserva únicamente las primeras `limit` dimensiones.
 *
 * Se utiliza cuando interesa comparar magnitudes reales entre dimensiones, no
 * su participación dentro del total global.
 */
export function getRankingDistribution<T extends DimensionRow>(
  rows: T[],
  key: keyof T,
  { limit = RANKING_LIMIT, order = 'desc', excludeZero = false }: RankingOptions = {},
): DistributionItem[] {
  const items = rows.map((row) => {
    const value = read(row, key);

    return { label: row.valor, value, weight: 0, plotted: value };
  });

  const kept = excludeZero ? items.filter((item) => item.value !== 0) : items;

  return kept
    .sort((a, b) => (order === 'asc' ? a.value - b.value : b.value - a.value))
    .slice(0, limit);
}

/**
 * Folds every slice below `threshold` percent into a single "Otros" entry, so a
 * long tail of sub-1% dimensions does not turn the legend into a wall of text.
 *
 * Ranking distributions carry no weights, so they have nothing to group and are
 * already capped by `limit` — callers skip this for them.
 */
export function groupMinorItems(
  items: DistributionItem[],
  threshold = 1,
): DistributionItem[] {
  const majorItems = items.filter((item) => item.weight >= threshold);
  const minorItems = items.filter((item) => item.weight < threshold);

  const othersWeight = minorItems.reduce((total, item) => total + item.weight, 0);

  if (othersWeight <= 0) {
    return majorItems;
  }

  return [
    ...majorItems,
    {
      label: `Otros < ${threshold}%`,
      value: minorItems.reduce((total, item) => total + item.value, 0),
      weight: othersWeight,
      plotted: othersWeight,
    },
  ];
}

type WithRaw<T> = T & { _raw: Array<{ label: string; original: number }> };

/**
 * Shared shape for both chart kinds: they differ only in the `ChartData`
 * generic. `plotted` is what gets drawn; `_raw` keeps the unformatted value
 * around for the hover readout.
 *
 * `datasetLabel` names the series. A bar legend renders `dataset.label`, so
 * leaving it unset prints "undefined" — a doughnut hides the problem because its
 * legend reads the `labels` array instead.
 */
function toDistributionChartData(items: DistributionItem[], datasetLabel = '') {
  return {
    labels: items.map((item) => item.label),

    datasets: [
      {
        label: datasetLabel,
        data: items.map((item) => Number(item.plotted.toFixed(2))),
        backgroundColor: CHART_PALETTE,
        borderWidth: 2,
        borderColor: SURFACE.secondary,
      },
    ],

    _raw: items.map((item) => ({ label: item.label, original: item.value })),
  };
}

export function toBarChartData(
  items: DistributionItem[],
  datasetLabel?: string,
): WithRaw<ChartData<'bar'>> {
  return toDistributionChartData(items, datasetLabel);
}

export function toDoughnutChartData(
  items: DistributionItem[],
  datasetLabel?: string,
): WithRaw<ChartData<'doughnut'>> {
  return toDistributionChartData(items, datasetLabel);
}
