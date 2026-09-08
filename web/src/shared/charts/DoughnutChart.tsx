import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Doughnut } from 'react-chartjs-2';

import { centerTextPlugin } from './plugins';

interface DoughnutChartProps {
  data: ChartData<'doughnut'>;
  options?: ChartOptions<'doughnut'>;
  /** Overrides the defaults; omit to get the centre readout and segment labels. */
  plugins?: Plugin<'doughnut'>[];
  className?: string;
}

/**
 * Both plugins are opt-in per chart rather than registered globally, so a caller
 * that forgets them silently loses the centre readout. Defaulting them here keeps
 * every doughnut consistent.
 */
const DEFAULT_PLUGINS = [centerTextPlugin, ChartDataLabels as unknown as Plugin<'doughnut'>];

export function DoughnutChart({
  data,
  options,
  plugins = DEFAULT_PLUGINS,
  className = 'h-96 w-full',
}: DoughnutChartProps) {
  return (
    <div className={className}>
      <Doughnut data={data} options={options} plugins={plugins} />
    </div>
  );
}
