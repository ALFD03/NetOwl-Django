import { SURFACE } from '@/shared/constants/theme';
import 'chartjs-plugin-datalabels';
import type { ActiveElement, ChartEvent, ChartOptions } from 'chart.js';
import type React from 'react';
import type { CenterTextConfig } from './plugins';

export type DoughnutHoverValue = { name: string; val: string };
export type HoverableChartData = {
  labels?: unknown[];
  _raw: Array<{ label: string; original: number }>;
};

type CenterTextOptions = ChartOptions<'doughnut'> & { customCenterText?: CenterTextConfig };

export const baseLineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', align: 'end', labels: { color: '#cbd5e1', font: { size: 11 } } },
    datalabels: { display: false },
    tooltip: { enabled: true, backgroundColor: SURFACE.secondary, titleColor: '#ffffff', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1, padding: 10, cornerRadius: 8 },
  },
  scales: {
    x: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
    y: { grid: { color: 'rgba(30, 41, 59, 0.4)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, grace: '20%' },
  },
};

export const horizontalBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', align: 'end', labels: { color: '#cbd5e1', font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 15 } },
    datalabels: { display: true, clip: false, anchor: 'end', align: 'end', font: { weight: 'bold', size: 10 }, formatter: (value: number) => value.toLocaleString(), offset: 4, color: '#ffffff' },
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

export function getDoughnutOptions(
  centerText: CenterTextConfig,
  onHover?: (event: ChartEvent, elements: ActiveElement[]) => void,
): CenterTextOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    customCenterText: centerText,
    onHover,
    plugins: {
      legend: { display: true, position: 'right', labels: { color: '#cbd5e1', font: { size: 10 }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { enabled: false },
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
