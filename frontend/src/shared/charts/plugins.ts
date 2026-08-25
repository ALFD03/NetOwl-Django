import type { ArcElement, Chart, Plugin } from 'chart.js';

export interface CenterTextConfig {
  title: string;
  value: string | number;
  color: string;
}

type CenterTextChart = Chart<'doughnut'> & {
  options: Chart<'doughnut'>['options'] & { customCenterText?: CenterTextConfig };
};

export const centerTextPlugin: Plugin<'doughnut'> = {
  id: 'centerTextPlugin',
  beforeDraw(chart) {
    const typedChart = chart as CenterTextChart;
    const customText = typedChart.options.customCenterText;
    if (!customText) return;

    const meta = chart.getDatasetMeta(0);
    const firstElement = meta.data[0] as ArcElement | undefined;
    if (!firstElement) return;

    const { ctx } = chart;
    const { x, y } = firstElement.getCenterPoint(true);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(customText.title, x, y - 10);
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillStyle = customText.color;
    ctx.fillText(String(customText.value), x, y + 10);
    ctx.restore();
  },
};
