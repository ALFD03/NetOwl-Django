/** Barril de los gráficos: los envoltorios, el diagrama de flujo, sus opciones y sus plugins. */

import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { Plugin } from 'chart.js';
import { centerTextPlugin } from './plugins';

export { LineChart } from './LineChart';
export { DayTrendChart } from './DayTrendChart';
export type { DayTrendSeries } from './DayTrendChart';
export { BarChart } from './BarChart';
export { DoughnutChart } from './DoughnutChart';
export { SankeyChart } from './SankeyChart';
export type { SankeyEnlace, SankeyNodo } from './SankeyChart';
export { centerTextPlugin };
export * from './chartOptions';

export { ChartDataLabels };

export const defaultPlugins: Array<Plugin> = [centerTextPlugin as unknown as Plugin, ChartDataLabels as unknown as Plugin];
