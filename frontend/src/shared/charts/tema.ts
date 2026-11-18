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
import type { Tema } from '@/shared/hooks/useTheme';

const normalize = (color: string) => color.replace(/\s+/g, '').toLowerCase();

const PAREJA_CLARA = new Map<string, string>();
for (const [nombre, oscuro] of Object.entries(CHART_CHROME)) {
  PAREJA_CLARA.set(normalize(oscuro), LIGHT.chart[nombre as keyof typeof LIGHT.chart]);
}
for (const [nombre, oscuro] of Object.entries(SURFACE)) {
  PAREJA_CLARA.set(normalize(oscuro), LIGHT.surface[nombre as keyof typeof LIGHT.surface]);
}

/** El tema que se ve ahora, para lo que se resuelve al dibujar (plugins, colores con función). */
export function activeTheme(): Tema {
  return document.documentElement.classList.contains('light') ? 'claro' : 'oscuro';
}

/** Un color del marco en el tema dado; cualquier otro color vuelve igual. */
export function themeColor(color: string, tema: Tema = activeTheme()): string {
  if (tema === 'oscuro') return color;
  return PAREJA_CLARA.get(normalize(color)) ?? color;
}

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

function recorrer(valor: unknown): unknown {
  if (typeof valor === 'string') return themeColor(valor, 'claro');
  if (Array.isArray(valor)) return valor.map(recorrer);
  if (esObjetoPlano(valor)) {
    return Object.fromEntries(Object.entries(valor).map(([clave, v]) => [clave, recorrer(v)]));
  }
  // Funciones, gradientes y demás objetos de Chart.js pasan tal cual.
  return valor;
}

/**
 * Copia `opciones` o `datos` con los colores del marco traducidos al tema. En
 * oscuro devuelve el mismo objeto, sin copiar nada.
 */
export function adaptToTheme<T>(valor: T, tema: Tema): T {
  return tema === 'oscuro' ? valor : (recorrer(valor) as T);
}
