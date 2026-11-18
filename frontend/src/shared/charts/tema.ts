/**
 * Los colores del marco de las gráficas en el tema claro.
 *
 * Las opciones y los datos de Chart.js se escriben con los tokens del tema oscuro
 * (`CHART_CHROME`, `SURFACE`), muchas veces en constantes de módulo. En vez de
 * convertir cada una en función del tema, los envoltorios (`BarChart`,
 * `LineChart`, `DoughnutChart`) pasan opciones y datos por `adaptToTheme`, que
 * cambia cada uno de esos colores por su pareja clara. Los colores de las series
 * (`CHART_PALETTE`, `METRIC_COLOR`) no están en la tabla y no se tocan.
 */

import { CHART_CHROME, LIGHT, SURFACE } from '@/shared/constants/theme';
import type { Theme } from '@/shared/hooks/useTheme';

const normalize = (color: string) => color.replace(/\s+/g, '').toLowerCase();

const LIGHT_PAIR = new Map<string, string>();
for (const [name, dark] of Object.entries(CHART_CHROME)) {
  LIGHT_PAIR.set(normalize(dark), LIGHT.chart[name as keyof typeof LIGHT.chart]);
}
for (const [name, darkColor] of Object.entries(SURFACE)) {
  LIGHT_PAIR.set(normalize(darkColor), LIGHT.surface[name as keyof typeof LIGHT.surface]);
}

/** El tema que se ve ahora, para lo que se resuelve al dibujar (plugins, colores con función). */
export function activeTheme(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/** Un color del marco en el tema dado; cualquier otro color vuelve igual. */
export function themeColor(color: string, theme: Theme = activeTheme()): string {
  if (theme === 'dark') return color;
  return LIGHT_PAIR.get(normalize(color)) ?? color;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value: unknown): unknown {
  if (typeof value === 'string') return themeColor(value, 'light');
  if (Array.isArray(value)) return value.map(walk);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, walk(v)]));
  }
  // Funciones, gradientes y demás objetos de Chart.js pasan tal cual.
  return value;
}

/**
 * Copia `opciones` o `datos` con los colores del marco traducidos al tema. En
 * oscuro devuelve el mismo objeto, sin copiar nada.
 */
export function adaptToTheme<T>(value: T, theme: Theme): T {
  return theme === 'dark' ? value : (walk(value) as T);
}
