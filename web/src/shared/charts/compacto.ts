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

const FUENTE_ETIQUETA = { weight: 'bold', size: 11 } as const;
const LEYENDA = { font: { size: 10 }, boxWidth: 10, padding: 8 } as const;

/** La fuente de las etiquetas de valor, respetando la que traiga si no es una función. */
function fuenteEtiqueta(actual: unknown) {
  return typeof actual === 'object' && actual !== null
    ? { ...actual, size: FUENTE_ETIQUETA.size }
    : FUENTE_ETIQUETA;
}

export function compactarCartesiana<T extends 'bar' | 'line'>(options: ChartOptions<T>): ChartOptions<T> {
  const o = options as ChartOptions<'bar'>;
  const x = o.scales?.x;

  const compacto: ChartOptions<'bar'> = {
    ...o,
    plugins: {
      ...o.plugins,
      legend: { ...o.plugins?.legend, labels: { ...o.plugins?.legend?.labels, ...LEYENDA } },
      datalabels: { ...o.plugins?.datalabels, font: fuenteEtiqueta(o.plugins?.datalabels?.font) },
    },
    scales: x ? { ...o.scales, x: { ...x, ticks: { ...x.ticks, maxRotation: 90 } } } : o.scales,
  };
  return compacto as ChartOptions<T>;
}

export function compactarAnillo(options: ChartOptions<'doughnut'>): ChartOptions<'doughnut'> {
  return {
    ...options,
    plugins: {
      ...options.plugins,
      legend: {
        ...options.plugins?.legend,
        position: 'bottom',
        labels: { ...options.plugins?.legend?.labels, ...LEYENDA },
      },
      datalabels: { ...options.plugins?.datalabels, font: fuenteEtiqueta(options.plugins?.datalabels?.font) },
    },
  };
}
