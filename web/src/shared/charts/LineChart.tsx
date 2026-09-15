/** Envoltorio de la gráfica de líneas de Chart.js. */

import { useMemo } from 'react';
import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Line } from 'react-chartjs-2';
import { seriesDatalabelColor } from './chartOptions';

interface LineChartProps {
  data: ChartData<'line'>;
  options?: ChartOptions<'line'>;
  /** Overrides the defaults; omit to get value labels on each point. */
  plugins?: Plugin<'line'>[];
  className?: string;
}

/** Registered per chart rather than globally; opt out via `datalabels: { display: false }`. */
const DEFAULT_PLUGINS = [ChartDataLabels as unknown as Plugin<'line'>];

/** A line's identity is its stroke, so labels copy `borderColor` first. */
const LINE_LABEL_COLOR = seriesDatalabelColor('borderColor', 'backgroundColor');

/**
 * Tints each value label with its own line's colour. Applied as a default, so an
 * explicit `datalabels.color` from the caller still wins.
 */
function withSeriesLabelColor(options?: ChartOptions<'line'>): ChartOptions<'line'> {
  return {
    ...options,
    plugins: {
      ...options?.plugins,
      datalabels: { color: LINE_LABEL_COLOR, ...options?.plugins?.datalabels },
    },
  };
}

export function LineChart({ data, options, plugins = DEFAULT_PLUGINS, className = 'h-96 w-full' }: LineChartProps) {
  const resolvedOptions = useMemo(() => withSeriesLabelColor(options), [options]);

  return <div className={className}><Line data={data} options={resolvedOptions} plugins={plugins} /></div>;
}
