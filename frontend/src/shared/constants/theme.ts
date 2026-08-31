import tokens from './design-tokens.json';

/**
 * Typed access to the design tokens shared with `tailwind.config.js`.
 *
 * Use these ONLY where a raw colour string is required — chart.js canvases,
 * inline `style` props, SVG `stroke`. Anywhere Tailwind can be used, prefer the
 * generated class (`bg-surface-primary`, `text-brand`) so themes stay swappable.
 */
export const SURFACE = tokens.surface;
export const BRAND = tokens.brand;

/** Per-metric accent colours, keyed by the shared `MetricColor` union. */
export const METRIC_COLOR = tokens.metric;

/** Ordered palette for multi-series charts. Index with `% CHART_PALETTE.length`. */
export const CHART_PALETTE = tokens.chartPalette;

export type MetricColorToken = keyof typeof METRIC_COLOR;
