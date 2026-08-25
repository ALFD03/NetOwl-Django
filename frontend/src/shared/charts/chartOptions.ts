import { SURFACE } from '@/shared/constants/theme';
import 'chartjs-plugin-datalabels';
import type { ActiveElement, ChartEvent, ChartOptions } from 'chart.js';
import type React from 'react';
import type { CenterTextConfig } from './plugins';

/**
 * Value labels are white so they read against the dark surface, but white alone
 * disappears on the lighter palette entries (`#ffb703`, `#00ff88`) and on a bar's
 * own fill. The dark stroke + shadow is what keeps them legible everywhere.
 */
export const DATALABEL_TEXT = {
  color: '#ffffff',
  font: { weight: 'bold', size: 15 },
  textStrokeColor: '#000000',
  textStrokeWidth: 2,
  // textShadowBlur: 4,
  // textShadowColor: 'rgba(2, 6, 23, 0.9)',
} as const;

export type DoughnutHoverValue = { name: string; val: string };
export type HoverableChartData = {
  labels?: unknown[];
  _raw: Array<{ label: string; original: number }>;
};

type CenterTextOptions = ChartOptions<'doughnut'> & { customCenterText?: CenterTextConfig };

export interface DoughnutOptionsConfig {
  /** Appended to each segment label, e.g. `'%'`. */
  valueSuffix?: string;
  /** Slices smaller than this stay unlabelled to avoid overlap. */
  minLabelValue?: number;
}

export const baseLineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', align: 'end', labels: { color: '#cbd5e1', font: { size: 11 } } },
    // 'auto' lets the plugin drop labels that would collide, so a dense series
    // thins itself out instead of turning into a smear of overlapping numbers.
    datalabels: { ...DATALABEL_TEXT, display: 'auto', clip: false, anchor: 'end', align: 'top', offset: 4, formatter: (value: number) => value.toLocaleString() },
    tooltip: { enabled: true, backgroundColor: SURFACE.secondary, titleColor: '#ffffff', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1, padding: 10, cornerRadius: 8 },
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
  },
};

/** Line counterpart of `getHorizontalBarOptions`; `suffix` is appended to each point label. */
export function getLineOptions(suffix = '', customOptions?: ChartOptions<'line'>): ChartOptions<'line'> {
  return {
    ...baseLineOptions,
    ...customOptions,
    plugins: {
      ...baseLineOptions.plugins,
      ...customOptions?.plugins,
      datalabels: {
        ...baseLineOptions.plugins?.datalabels,
        ...(suffix ? { formatter: (value: number) => `${value.toLocaleString()}${suffix}` } : {}),
        ...customOptions?.plugins?.datalabels,
      },
    },
  };
}

export const horizontalBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', align: 'end', labels: { color: '#cbd5e1', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 15 } },
    datalabels: { ...DATALABEL_TEXT, display: 'auto', clip: false, anchor: 'end', align: 'top', offset: 5, formatter: (value: number) => value.toLocaleString() },
    tooltip: { enabled: true, backgroundColor: SURFACE.secondary, titleColor: '#ffffff', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1, padding: 10, cornerRadius: 8 },
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
  },
};

export function getHorizontalBarOptions(
  datalabelColor?: string,
  suffix = '',
  customOptions?: ChartOptions<'bar'>,
): ChartOptions<'bar'> {
  return {
    ...horizontalBarOptions,
    ...customOptions,
    plugins: {
      ...horizontalBarOptions.plugins,
      ...customOptions?.plugins,
      datalabels: {
        ...horizontalBarOptions.plugins?.datalabels,
        ...(datalabelColor ? { color: datalabelColor } : {}),
        ...(suffix ? { formatter: (value: number) => `${value.toLocaleString()}${suffix}` } : {}),
        ...customOptions?.plugins?.datalabels,
      },
    },
  };
}

/**
 * Doughnut defaults: centre readout via `customCenterText`, plus white segment
 * labels. White alone is unreadable on the lighter palette entries, so the text
 * carries a dark stroke and shadow — that is what makes it "stand out" on every
 * slice colour rather than only on the dark ones.
 *
 * @param valueSuffix appended to each segment label (e.g. `'%'`).
 * @param minLabelValue slices below this are left unlabelled, so thin arcs do
 *   not collide with their neighbours.
 */
export function getDoughnutOptions(
  centerText: CenterTextConfig,
  onHover?: (event: ChartEvent, elements: ActiveElement[]) => void,
  { valueSuffix = '', minLabelValue = 3 }: DoughnutOptionsConfig = {},
): CenterTextOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    layout: { padding: 6 },
    customCenterText: centerText,
    onHover,
    plugins: {
      legend: { display: true, position: 'right', labels: { color: '#ffffff', font: { size: 10 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { enabled: false },
      datalabels: {
        display: (context) => {
          const value = context.dataset.data[context.dataIndex];
          return typeof value === 'number' && Math.abs(value) >= minLabelValue;
        },
        color: '#ffffff',
        font: { weight: 'bold', size: 15, },
        textStrokeColor: '#00000',
        textStrokeWidth: 2,
        formatter: (value: number) => `${value.toLocaleString()}${valueSuffix}`,
      },
    },
  };
}

export function handleHover(
  setter: React.Dispatch<React.SetStateAction<DoughnutHoverValue | null>>,
  data: HoverableChartData,
  suffix = '%',
) {
  return (_event: ChartEvent, elements: ActiveElement[]) => {
    if (!elements.length) {
      setter((prev) => (prev === null ? prev : null));
      return;
    }

    const index = elements[0].index;
    const label = String(data.labels?.[index] ?? '');
    const match = data._raw.find((item) => item.label === label);
    const nextValue = { name: label, val: match ? `${match.original.toFixed(2)}${suffix}` : 'N/A' };
    setter((prev) => (prev?.name === nextValue.name && prev.val === nextValue.val ? prev : nextValue));
  };
}
