import type { ChartData, ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';

interface BarChartProps {
  data: ChartData<'bar'>;
  options?: ChartOptions<'bar'>;
  className?: string;
}

export function BarChart({ data, options, className = 'h-72 w-full' }: BarChartProps) {
  return <div className={className}><Bar data={data} options={options} /></div>;
}
