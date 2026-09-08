import { formatInteger } from '@/shared/utils/formatters/number';
import { CHART_CHROME, SURFACE } from '@/shared/constants/theme';
import 'chartjs-plugin-datalabels';
import type { ActiveElement, ChartEvent, ChartOptions } from 'chart.js';
import type { Context as DatalabelContext } from 'chartjs-plugin-datalabels';
import type React from 'react';
import type { CenterTextConfig } from './plugins';

/** Used when a dataset carries no colour of its own to borrow. */
export const DATALABEL_FALLBACK_COLOR = CHART_CHROME.textStrong;

/**
 * Shared value-label typography. The colour is left out on purpose: `BarChart`
 * and `LineChart` tint each label with the colour of the bar or line it belongs
 * to, so a reader can tell at a glance which number goes with which series.
 * The dark stroke is what keeps a light-palette entry (`#ffb703`, `#00ff88`)
 * legible once the text is no longer plain white.
 */
export const DATALABEL_TEXT = {
  font: { weight: 'bold', size: 15 },
  textStrokeColor: CHART_CHROME.labelStroke,
  textStrokeWidth: 2,
} as const;

/** Where a dataset keeps the colour a label should copy. */
type SeriesColorKey = 'backgroundColor' | 'borderColor';

/**
 * Resolves a value label's colour from the element it annotates.
 *
 * Sources are tried in order — a bar reads its `backgroundColor` first, a line
 * its `borderColor` — because each chart type paints its identity in a
 * different property. A per-point array is indexed by `dataIndex`, so a
 * palette-coloured bar chart gets one colour per bar rather than one per series.
 */
export function seriesDatalabelColor(...sources: SeriesColorKey[]) {
  return (context: DatalabelContext): string => {
    for (const source of sources) {
      const declared = (context.dataset as unknown as Record<string, unknown>)[source];
      const resolved = Array.isArray(declared)
        ? declared[context.dataIndex % declared.length]
        : declared;

      if (typeof resolved === 'string') return resolved;
    }

    return DATALABEL_FALLBACK_COLOR;
  };
}

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
    legend: { display: true, position: 'top', align: 'end', labels: { color: CHART_CHROME.textMuted, font: { size: 11 } } },
    // 'auto' lets the plugin drop labels that would collide, so a dense series
    // thins itself out instead of turning into a smear of overlapping numbers.
    datalabels: { ...DATALABEL_TEXT, display: 'auto', clip: false, anchor: 'end', align: 'top', offset: 4, formatter: (value: number) => formatInteger(value) },
    tooltip: { enabled: true, backgroundColor: SURFACE.secondary, titleColor: CHART_CHROME.textStrong, bodyColor: CHART_CHROME.textMuted, borderColor: CHART_CHROME.border, borderWidth: 1, padding: 10, cornerRadius: 8 },
  },
  scales: {
    x: { grid: { color: CHART_CHROME.grid }, ticks: { color: CHART_CHROME.textAxis, font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: CHART_CHROME.grid }, ticks: { color: CHART_CHROME.textAxis, font: { size: 10 } }, grace: '20%' },
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
        ...(suffix ? { formatter: (value: number) => `${formatInteger(value)}${suffix}` } : {}),
        ...customOptions?.plugins?.datalabels,
      },
    },
  };
}

export const horizontalBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', align: 'end', labels: { color: CHART_CHROME.textMuted, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 15 } },
    datalabels: { ...DATALABEL_TEXT, display: 'auto', clip: false, anchor: 'end', align: 'top', offset: 5, formatter: (value: number) => formatInteger(value) },
    tooltip: { enabled: true, backgroundColor: SURFACE.secondary, titleColor: CHART_CHROME.textStrong, bodyColor: CHART_CHROME.textMuted, borderColor: CHART_CHROME.border, borderWidth: 1, padding: 10, cornerRadius: 8 },
  },
  scales: {
    x: { grid: { color: CHART_CHROME.grid }, ticks: { color: CHART_CHROME.textAxis, font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: CHART_CHROME.grid }, ticks: { color: CHART_CHROME.textAxis, font: { size: 10 } }, grace: '20%' },
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
        ...(suffix ? { formatter: (value: number) => `${formatInteger(value)}${suffix}` } : {}),
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
      legend: { display: true, position: 'right', labels: { color: CHART_CHROME.textStrong, font: { size: 10 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { enabled: false },
      datalabels: {
        display: (context) => {
          const value = context.dataset.data[context.dataIndex];
          return typeof value === 'number' && Math.abs(value) >= minLabelValue;
        },
        color: CHART_CHROME.textStrong,
        font: { weight: 'bold', size: 15, },
        textStrokeColor: CHART_CHROME.labelStroke,
        textStrokeWidth: 2,
        formatter: (value: number) => `${formatInteger(value)}${valueSuffix}`,
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
