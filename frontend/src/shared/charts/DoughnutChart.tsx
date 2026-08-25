import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

interface DoughnutChartProps {
  data: ChartData<'doughnut'>;
  options?: ChartOptions<'doughnut'>;
  plugins?: Plugin<'doughnut'>[];
  className?: string;
}

export function DoughnutChart({ data, options, plugins, className = 'h-72 w-full' }: DoughnutChartProps) {
  return <div className={className}><Doughnut data={data} options={options} plugins={plugins} /></div>;
}
