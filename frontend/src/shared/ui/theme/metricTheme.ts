/**
 * Los juegos de clases de cada color de métrica, derivados de los tokens.
 *
 * Están escritos uno a uno y no interpolados porque Tailwind no ve los nombres de
 * clase construidos en tiempo de ejecución.
 */

import { METRIC_COLOR } from '@/shared/constants/theme';
import { withAlpha } from '@/shared/lib/color';
import type { MetricColor } from './types';

export const METRIC_CARD_SURFACE: Record<MetricColor, string> = {
  slate: 'bg-gradient-to-br from-slate-800/80 via-slate-900 to-slate-950 border-slate-600/50 shadow-slate-950/40',
  green: 'bg-gradient-to-br from-emerald-950/40 via-surface-secondary to-surface-primary border-emerald-500/40 shadow-emerald-950/30',
  red: 'bg-gradient-to-br from-rose-950/40 via-surface-secondary to-surface-primary border-rose-500/40 shadow-rose-950/30',
  blue: 'bg-gradient-to-br from-sky-950/40 via-surface-secondary to-surface-primary border-sky-500/40 shadow-sky-950/30',
  yellow: 'bg-gradient-to-br from-amber-950/40 via-surface-secondary to-surface-primary border-amber-500/40 shadow-amber-950/30',
  purple: 'bg-gradient-to-br from-purple-950/40 via-surface-secondary to-surface-primary border-purple-500/40 shadow-purple-950/30',
};

export const METRIC_TEXT: Record<MetricColor, string> = {
  slate: 'text-slate-300',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  blue: 'text-sky-400',
  yellow: 'text-amber-400',
  purple: 'text-purple-400',
};

export const METRIC_LABEL: Record<MetricColor, string> = {
  slate: 'text-slate-400',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  blue: 'text-sky-400',
  yellow: 'text-amber-400',
  purple: 'text-purple-400',
};

export const METRIC_PULSE: Record<MetricColor, string> = {
  slate: 'bg-slate-400',
  green: 'bg-emerald-400',
  red: 'bg-rose-400',
  blue: 'bg-sky-400',
  yellow: 'bg-amber-400',
  purple: 'bg-purple-400',
};

export const METRIC_BAR: Record<MetricColor, string> = {
  slate: 'bg-slate-400',
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
  blue: 'bg-sky-500',
  yellow: 'bg-amber-500',
  purple: 'bg-purple-500',
};

export const METRIC_COMPACT: Record<MetricColor, string> = {
  slate: 'text-slate-300 bg-slate-900/60 border-slate-700/50',
  green: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30',
  red: 'text-rose-400 bg-rose-950/40 border-rose-500/30',
  blue: 'text-sky-400 bg-sky-950/40 border-sky-500/30',
  yellow: 'text-amber-400 bg-amber-950/40 border-amber-500/30',
  purple: 'text-purple-400 bg-purple-950/40 border-purple-500/30',
};

/**
 * Canvas colours for chart.js, derived from the shared metric tokens so a
 * palette change in `design-tokens.json` reaches the charts too.
 */
export const METRIC_CHART: Record<MetricColor, { line: string; fill: string }> = Object.fromEntries(
  (Object.keys(METRIC_COLOR) as MetricColor[]).map((color) => [
    color,
    { line: METRIC_COLOR[color], fill: withAlpha(METRIC_COLOR[color], 0.1) },
  ]),
) as Record<MetricColor, { line: string; fill: string }>;
