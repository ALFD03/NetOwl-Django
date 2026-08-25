import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Line } from 'react-chartjs-2';

interface LineChartProps {
  data: ChartData<'line'>;
  options?: ChartOptions<'line'>;
  /** Overrides the defaults; omit to get value labels on each point. */
  plugins?: Plugin<'line'>[];
  className?: string;
}

/** Registered per chart rather than globally; opt out via `datalabels: { display: false }`. */
const DEFAULT_PLUGINS = [ChartDataLabels as unknown as Plugin<'line'>];

export function LineChart({ data, options, plugins = DEFAULT_PLUGINS, className = 'h-96 w-full' }: LineChartProps) {
  return <div className={className}><Line data={data} options={options} plugins={plugins} /></div>;
}
