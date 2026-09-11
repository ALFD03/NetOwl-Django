/** Plugins propios de Chart.js, empezando por el texto central del *doughnut*. */

import { CHART_CHROME } from '@/shared/constants/theme';
import type { ArcElement, Chart, Plugin } from 'chart.js';

export interface CenterTextConfig {
  title: string;
  value: string | number;
  /** Accent for the value. Defaults to white so it reads on the dark surface. */
  color?: string;
  /** Colour for the caption above the value. */
  titleColor?: string;
}

type CenterTextChart = Chart<'doughnut'> & {
  options: Chart<'doughnut'>['options'] & { customCenterText?: CenterTextConfig };
};

const TITLE_COLOR = CHART_CHROME.textStrong;
const VALUE_COLOR = CHART_CHROME.textStrong;

/** Largest font size (px) at which `text` still fits inside `maxWidth`. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: string,
  preferred: number,
  minimum: number,
): number {
  let size = preferred;
  while (size > minimum) {
    ctx.font = `${weight} ${size}px Inter, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.font = `${weight} ${size}px Inter, sans-serif`;
  return size;
}

/**
 * Draws the headline figure in the doughnut hole.
 *
 * The centre must come from the arc's own `x`/`y` — those are the doughnut's
 * centre. `getCenterPoint()` returns the midpoint of the *arc segment*, which
 * sits out on the ring and pushed the text into a corner.
 */
export const centerTextPlugin: Plugin<'doughnut'> = {
  id: 'centerTextPlugin',
  afterDatasetsDraw(chart) {
    const typedChart = chart as CenterTextChart;
    const customText = typedChart.options.customCenterText;
    if (!customText) return;

    const meta = chart.getDatasetMeta(0);
    const firstElement = meta.data[0] as ArcElement | undefined;
    if (!firstElement) return;

    const { x, y, innerRadius } = firstElement.getProps(['x', 'y', 'innerRadius'], true);
    if (x == null || y == null || !innerRadius) return;

    const title = customText.title?.trim() ?? '';
    const value = String(customText.value ?? '').trim();
    if (!title && !value) return;

    // Keep the text inside the hole, with a little breathing room.
    const maxWidth = innerRadius * 0.80 ;

    const { ctx } = chart;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const valueSize = value
      ? fitFontSize(ctx, value, maxWidth, '700', Math.round(innerRadius), 11)
      : 0;
    const titleSize = title
      ? fitFontSize(ctx, title, maxWidth, '700', Math.round(innerRadius ), 11)
      : 0;

    // Centre the block as a whole, so a title-only or value-only chart is still centred.
    const gap = title && value ? Math.round(titleSize) : 0;
    const blockHeight = titleSize + gap + valueSize;
    let cursor = y - blockHeight / 2;

    if (title) {
      ctx.font = `700 ${titleSize}px Inter, sans-serif`;
      ctx.fillStyle = customText.titleColor ?? TITLE_COLOR;
      ctx.fillText(title, x, cursor + titleSize / 2);
      cursor += titleSize + gap;
    }

    if (value) {
      ctx.font = `700 ${valueSize}px Inter, sans-serif`;
      ctx.fillStyle = customText.color ?? VALUE_COLOR;
      ctx.fillText(value, x, cursor + valueSize / 2);
    }

    ctx.restore();
  },
};
