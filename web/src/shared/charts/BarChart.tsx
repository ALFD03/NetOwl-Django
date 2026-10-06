/** Envoltorio de la gráfica de barras de Chart.js. */

import { useMemo } from 'react';
import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar } from 'react-chartjs-2';
import { useBreakpoint } from '@/shared/hooks/useBreakpoint';
import { seriesDatalabelColor } from './chartOptions';
import { compactarCartesiana } from './compacto';

interface BarChartProps {
  data: ChartData<'bar'>;
  options?: ChartOptions<'bar'>;
  /** Overrides the defaults; omit to get a value label on each bar. */
  plugins?: Plugin<'bar'>[];
  className?: string;
}

/** Registered per chart rather than globally; opt out via `datalabels: { display: false }`. */
const DEFAULT_PLUGINS = [ChartDataLabels as unknown as Plugin<'bar'>];

/** A bar's identity is its fill, so labels copy `backgroundColor` first. */
const BAR_LABEL_COLOR = seriesDatalabelColor('backgroundColor', 'borderColor');

/**
 * Tints each value label with its own bar's colour. Applied as a default, so an
 * explicit `datalabels.color` from the caller still wins.
 */
function withSeriesLabelColor(options?: ChartOptions<'bar'>): ChartOptions<'bar'> {
  return {
    ...options,
    plugins: {
      ...options?.plugins,
      datalabels: { color: BAR_LABEL_COLOR, ...options?.plugins?.datalabels },
    },
  };
}

export function BarChart({ data, options, plugins = DEFAULT_PLUGINS, className = 'h-96 w-full' }: BarChartProps) {
  const ancho = useBreakpoint('sm');
  const resolvedOptions = useMemo(() => {
    const conColor = withSeriesLabelColor(options);
    return ancho ? conColor : compactarCartesiana(conColor);
  }, [options, ancho]);

  return <div className={className}><Bar data={data} options={resolvedOptions} plugins={plugins} /></div>;
}
