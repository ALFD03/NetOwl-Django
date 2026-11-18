/** El gráfico de «¿Cuándo se van?»: bajas por tramo de duración y su acumulado. */

import type { ChartData, ChartOptions, TooltipItem } from 'chart.js';

import { CHART_CHROME, CHART_PALETTE } from '@/shared/constants/theme';
import type { LifetimeTier } from '../types';

/**
 * Rojo para los que se fueron pronto, verde para los que duraron: el color de
 * cada tramo dice lo que significa antes de leer el eje.
 */
const TIER_RAMP = [CHART_PALETTE[0], CHART_PALETTE[7], CHART_PALETTE[1], CHART_PALETTE[6], CHART_PALETTE[4]];

/** El color del tramo `i` de `n`, repartido a lo largo de la rampa. */
export function tierColor(i: number, n: number): string {
  if (n <= 1) return TIER_RAMP[0];
  return TIER_RAMP[Math.round((i * (TIER_RAMP.length - 1)) / (n - 1))];
}

/** Color de la línea del acumulado. */
export const ACCUMULATED_COLOR = CHART_PALETTE[9];

/**
 * Barras con las bajas de cada tramo y, encima, la línea del % acumulado: se
 * lee a la vez dónde se concentran y qué parte ya se había ido a cada plazo.
 *
 * Es un gráfico mixto; el envoltorio `BarChart` lo tipa como solo barras, pero
 * Chart.js tiene registrados los dos controladores, así que la línea se dibuja.
 */
export function buildTiersChartData(tramos: LifetimeTier[]): ChartData<'bar'> {
  const data: ChartData<'bar' | 'line'> = {
    labels: tramos.map((t) => t.bucket),
    datasets: [
      {
        type: 'line',
        label: '% acumulado',
        data: tramos.map((t) => t.cumulative_pct),
        yAxisID: 'acumulado',
        borderColor: ACCUMULATED_COLOR,
        backgroundColor: ACCUMULATED_COLOR,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        order: 0,
      },
      {
        type: 'bar',
        label: 'Bajas',
        data: tramos.map((t) => t.churned),
        yAxisID: 'bajas',
        backgroundColor: tramos.map((_, i) => `${tierColor(i, tramos.length)}CC`),
        borderColor: tramos.map((_, i) => tierColor(i, tramos.length)),
        borderWidth: 1,
        borderRadius: 8,
        order: 1,
      },
    ],
  };
  return data as unknown as ChartData<'bar'>;
}

export function tiersChartOptions(tramos: LifetimeTier[]): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: CHART_CHROME.textAxis, boxWidth: 10, font: { size: 10 }, padding: 15 },
      },
      datalabels: {
        // Solo en las barras: el % del tramo encima de cada una.
        display: (ctx) => ctx.datasetIndex === 1 && tramos[ctx.dataIndex]?.churned > 0,
        anchor: 'end',
        align: 'top',
        font: { size: 10, weight: 'bold' },
        formatter: (_value: number, ctx) => `${tramos[ctx.dataIndex].pct}%`,
      },
      tooltip: {
        backgroundColor: CHART_CHROME.surfaceDeep,
        titleColor: CHART_CHROME.textStrong,
        bodyColor: CHART_CHROME.textMuted,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const tramo = tramos[ctx.dataIndex];
            return ctx.datasetIndex === 1
              ? `Bajas: ${tramo.churned.toLocaleString('en-US')} (${tramo.pct}%)`
              : `Acumulado: ${tramo.cumulative_pct}% ya se había ido`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: CHART_CHROME.textAxis } },
      bajas: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        grace: '12%',
        grid: { color: CHART_CHROME.gridSoft },
        ticks: { color: CHART_CHROME.textAxis },
        title: { display: true, text: 'Bajas', color: CHART_CHROME.textAxis },
      },
      acumulado: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 100,
        grid: { display: false },
        ticks: { color: ACCUMULATED_COLOR, callback: (value: string | number) => `${value}%` },
        title: { display: true, text: '% acumulado', color: ACCUMULATED_COLOR },
      },
    },
  };
}
