import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';

import { CHART_CHROME, CHART_PALETTE } from '@/shared/constants/theme';
import type { CurvaPoint, LifetimeData, LifetimeDimensionInfo } from '../types';

/** Minimum sample size before a dimension value is worth plotting. */
const MIN_SAMPLE = 5;
/** Series beyond this index start hidden so the legend stays readable. */
const VISIBLE_SERIES = 10;

/**
 * Kaplan-Meier survival curves: the company average plus the top dimension
 * values, ranked by median lifetime.
 */
export function buildSurvivalChartData(
  data: LifetimeData,
  dimensionSet: Record<string, LifetimeDimensionInfo>,
): ChartData<'line'> {
  const toPercent = (points?: CurvaPoint[]) =>
    points?.map((point) => Number((point.sup * 100).toFixed(1))) ?? [];

  const ranked = Object.entries(dimensionSet)
    .map(([name, info]) => ({ name, ...info }))
    .filter((entry) => Number(entry.n_total_activo ?? 0) > MIN_SAMPLE)
    .sort((a, b) => Number(b.mediana_activo ?? 0) - Number(a.mediana_activo ?? 0));

  return {
    labels: data.curva_activo?.map((point) => `${point.tiempo}d`) ?? [],
    datasets: [
      {
        label: 'Promedio Empresa',
        data: toPercent(data.curva_activo),
        borderColor: CHART_CHROME.textStrong,
        borderWidth: 4,
        pointRadius: 0,
        fill: false,
        borderDash: [5, 5],
        stepped: true,
      },
      ...ranked.map((entry, idx) => ({
        label: entry.name,
        data: toPercent(entry.curva_activo),
        borderColor: CHART_PALETTE[idx % CHART_PALETTE.length],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        stepped: true,
        tension: 0,
        hidden: idx >= VISIBLE_SERIES,
      })),
    ],
  };
}

export const survivalChartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: CHART_CHROME.textAxis, boxWidth: 10, font: { size: 9 }, padding: 15 },
    },
    datalabels: { display: false },
    tooltip: {
      backgroundColor: CHART_CHROME.surfaceDeep,
      titleColor: CHART_CHROME.textStrong,
      bodyColor: CHART_CHROME.textMuted,
      padding: 12,
      cornerRadius: 8,
      callbacks: {
        label: (ctx: TooltipItem<'line'>) =>
          `${String(ctx.dataset.label)}: ${Number(ctx.raw).toFixed(1)}%`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: CHART_PALETTE[10], maxTicksLimit: 12 } },
    y: {
      min: 0,
      max: 100,
      grid: { color: 'rgba(255,255,255,0.05)' },
      ticks: { color: CHART_PALETTE[10], callback: (value: string | number) => `${value}%` },
    },
  },
};

/** Percentage of the sample still active (never cancelled). */
export function censorshipRate(data: LifetimeData): string {
  const total = Number(data.n_total_activo ?? data.total_suscriptores ?? 0);
  if (total === 0) return '0.0';
  return ((Number(data.n_censurado_activo ?? 0) / total) * 100).toFixed(1);
}

/** Survival probability at the one-year mark, as a percentage. */
export function firstYearSurvival(data: LifetimeData): string {
  const point = data.curva_activo?.find((entry) => entry.tiempo >= 365);
  return ((point?.sup ?? 0) * 100).toFixed(1);
}
