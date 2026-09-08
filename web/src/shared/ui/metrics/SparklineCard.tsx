import type { FC, ReactNode } from 'react';
import type { ChartData, ChartOptions } from 'chart.js';
import { LineChart } from '@/shared/charts';
import { MetricCard } from './MetricCard';
import type { MetricColor } from '../theme/types';
import { METRIC_CHART } from '../theme/metricTheme';

interface SparklineCardProps {
  title: string;
  value: ReactNode;
  caption?: string;
  color?: MetricColor;
  labels: string[];
  values: number[];
  onClick?: () => void;
}

const sparklineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, datalabels: { display: false } },
  scales: { x: { display: false }, y: { display: false } },
};

export const SparklineCard: FC<SparklineCardProps> = ({
  title,
  value,
  caption = 'Promedio Global',
  color = 'blue',
  labels,
  values,
  onClick,
}) => {
  const first = values[0] || 0;
  const last = values[values.length - 1] || 0;
  const trend = Number((last - first).toFixed(1));
  const chart = METRIC_CHART[color];
  const yMax = Math.max(...values, 10) * 1.15;

  const chartData: ChartData<'line'> = {
    labels,
    datasets: [{
      data: values,
      borderColor: chart.line,
      backgroundColor: chart.fill,
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: chart.line,
      tension: 0.4,
    }],
  };

  const options: ChartOptions<'line'> = {
    ...sparklineOptions,
    scales: {
      x: { display: false },
      y: { display: false, min: 0, max: yMax },
    },
  };

  return (
    <MetricCard
      label={title}
      value={value}
      caption={caption}
      color={color}
      trend={trend}
      onClick={onClick}
    >
      <LineChart data={chartData} options={options} className="h-14 w-full" />
    </MetricCard>
  );
};
