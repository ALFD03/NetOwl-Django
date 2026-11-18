/**
 * Las opciones de un gráfico en una pantalla estrecha (por debajo de `sm`).
 *
 * Se aplican en los envoltorios (`BarChart`, `LineChart`, `DoughnutChart`) y no
 * en cada llamada: las opciones las construye cada vista, y repartir un
 * `useBreakpoint` por todas ellas era la forma segura de que alguna se olvidara.
 *
 * Lo que cambia es lo que en un teléfono se come el área de dibujo:
 *
 * - Las etiquetas de valor bajan de 15px a 11px; a 15px, en 360px de ancho, el
 *   `display: 'auto'` de datalabels escondía casi todas por solaparse.
 * - Las categorías del eje X pueden girar hasta vertical. Siguen sin
 *   saltarse (`autoSkip: false` es deliberado: no desaparece ningún mes).
 * - La leyenda del anillo pasa de la derecha a debajo: a la derecha dejaba el
 *   anillo del tamaño de un botón.
 */

import type { ChartOptions } from 'chart.js';

const SOURCE_LABEL = { weight: 'bold', size: 11 } as const;
const LEGEND = { font: { size: 10 }, boxWidth: 10, padding: 8 } as const;

/** La fuente de las etiquetas de valor, respetando la que traiga si no es una función. */
function sourceLabel(current: unknown) {
  return typeof current === 'object' && current !== null
    ? { ...current, size: SOURCE_LABEL.size }
    : SOURCE_LABEL;
}

export function compactCartesian<T extends 'bar' | 'line'>(options: ChartOptions<T>): ChartOptions<T> {
  const other = options as ChartOptions<'bar'>;
  const x = other.scales?.x;

  const compact: ChartOptions<'bar'> = {
    ...other,
    plugins: {
      ...other.plugins,
      legend: { ...other.plugins?.legend, labels: { ...other.plugins?.legend?.labels, ...LEGEND } },
      datalabels: { ...other.plugins?.datalabels, font: sourceLabel(other.plugins?.datalabels?.font) },
    },
    scales: x ? { ...other.scales, x: { ...x, ticks: { ...x.ticks, maxRotation: 90 } } } : other.scales,
  };
  return compact as ChartOptions<T>;
}

export function compactRing(options: ChartOptions<'doughnut'>): ChartOptions<'doughnut'> {
  return {
    ...options,
    plugins: {
      ...options.plugins,
      legend: {
        ...options.plugins?.legend,
        position: 'bottom',
        labels: { ...options.plugins?.legend?.labels, ...LEGEND },
      },
      datalabels: { ...options.plugins?.datalabels, font: sourceLabel(options.plugins?.datalabels?.font) },
    },
  };
}
