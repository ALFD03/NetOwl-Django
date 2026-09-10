import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { Plugin } from 'chart.js';
import { centerTextPlugin } from './plugins';

export { LineChart } from './LineChart';
export { BarChart } from './BarChart';
export { DoughnutChart } from './DoughnutChart';
export { centerTextPlugin };
export * from './chartOptions';

export { ChartDataLabels };

export const defaultPlugins: Array<Plugin> = [centerTextPlugin as unknown as Plugin, ChartDataLabels as unknown as Plugin];
