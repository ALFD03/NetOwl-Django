/** El gráfico de los tickets abiertos hoy, por antigüedad. */

import type { ChartData, ChartOptions } from 'chart.js';

import { CHART_CHROME, CHART_PALETTE } from '@/shared/constants/theme';

const TOOLTIP = {
  backgroundColor: CHART_CHROME.surfaceDeep,
  titleColor: CHART_CHROME.textStrong,
  bodyColor: CHART_CHROME.textMuted,
  padding: 12,
  cornerRadius: 8,
};

/** Abiertos hoy por antigüedad: barras con su % encima. */
export function antiguedadChartData(
  tramos: { tramo: string; abiertos: number }[],
): ChartData<'bar'> {
  const n = tramos.length;
  // De verde (recientes) a rojo (los más viejos): el color dice qué preocupa.
  const rampa = [
    CHART_PALETTE[4],
    CHART_PALETTE[6],
    CHART_PALETTE[9],
    CHART_PALETTE[1],
    CHART_PALETTE[7],
    CHART_PALETTE[5],
    CHART_PALETTE[0],
  ];
  const color = (i: number) =>
    rampa[Math.min(rampa.length - 1, Math.round((i * (rampa.length - 1)) / Math.max(1, n - 1)))];
  return {
    labels: tramos.map((t) => t.tramo),
    datasets: [
      {
        label: 'Abiertos',
        data: tramos.map((t) => t.abiertos),
        backgroundColor: tramos.map((_, i) => `${color(i)}CC`),
        borderColor: tramos.map((_, i) => color(i)),
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };
}

export const antiguedadChartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    datalabels: { anchor: 'end', align: 'top', font: { size: 10, weight: 'bold' } },
    tooltip: TOOLTIP,
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: CHART_CHROME.textAxis } },
    y: {
      beginAtZero: true,
      grace: '12%',
      grid: { color: CHART_CHROME.gridSoft },
      ticks: { color: CHART_CHROME.textAxis },
    },
  },
};
