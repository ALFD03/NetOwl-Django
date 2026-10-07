/**
 * Los tokens de diseño para el lado TypeScript (canvas, SVG, estilos en línea).
 *
 * El mismo `design-tokens.json` lo lee `tailwind.config.js` para las clases.
 * **Nunca se escribe un hex en un componente.**
 */

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

/**
 * Chart chrome: axes, gridlines, tooltips and value labels.
 *
 * These are not series colours — they are the frame the data is drawn on.
 * They live in the token file because chart.js needs raw colour strings and
 * cannot use a Tailwind class, which is exactly how they ended up hardcoded
 * across eight files.
 */
export const CHART_CHROME = tokens.chart;

/**
 * Lo que cambia en el tema claro. Las clases lo reciben por variables CSS
 * (`tailwind.config.js`); un canvas no las lee, así que las gráficas traducen
 * `SURFACE` y `CHART_CHROME` con esto (`shared/charts/tema.ts`).
 */
export const LIGHT = tokens.light;

export type MetricColorToken = keyof typeof METRIC_COLOR;
