import type { ChartData, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';

interface LineChartProps {
  data: ChartData<'line'>;
  options?: ChartOptions<'line'>;
  className?: string;
}

export function LineChart({ data, options, className = 'h-72 w-full' }: LineChartProps) {
  return <div className={className}><Line data={data} options={options} /></div>;
}
