import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar } from 'react-chartjs-2';

interface BarChartProps {
  data: ChartData<'bar'>;
  options?: ChartOptions<'bar'>;
  /** Overrides the defaults; omit to get a value label on each bar. */
  plugins?: Plugin<'bar'>[];
  className?: string;
}

/** Registered per chart rather than globally; opt out via `datalabels: { display: false }`. */
const DEFAULT_PLUGINS = [ChartDataLabels as unknown as Plugin<'bar'>];

export function BarChart({ data, options, plugins = DEFAULT_PLUGINS, className = 'h-96 w-full' }: BarChartProps) {
  return <div className={className}><Bar data={data} options={options} plugins={plugins} /></div>;
}
