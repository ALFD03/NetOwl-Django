/**
 * Los breakpoints de la aplicación, con lo que significa cada uno.
 *
 * Los valores viven en `design-tokens.json`, que también lee `tailwind.config.js`:
 * `md:` en una clase y `BREAKPOINTS.md` aquí son el mismo número. Son los de
 * Tailwind por defecto a propósito —las clases que ya había no cambian de
 * significado—, pero ahora están escritos y tienen un papel cada uno.
 *
 * Se diseña de móvil hacia arriba: la clase sin prefijo es el teléfono, y cada
 * prefijo añade lo que cabe a partir de ese ancho.
 *
 * | Prefijo | Desde  | Pantalla                    | Qué cambia en el armazón                         |
 * | ------- | ------ | --------------------------- | ------------------------------------------------ |
 * | (nada)  | 0      | Teléfono vertical           | Menú en cajón, filtros a lo ancho, modal a pantalla completa |
 * | `sm:`   | 640px  | Teléfono apaisado           | Los filtros recuperan su ancho natural, modal centrado |
 * | `md:`   | 768px  | Tablet vertical             | Rejillas de tarjetas a 3-4 columnas              |
 * | `lg:`   | 1024px | Tablet apaisada / portátil  | Sidebar fijo y barra de filtros pegajosa         |
 * | `xl:`   | 1280px | Escritorio                  | Rejillas anchas, gráficos lado a lado            |
 * | `2xl:`  | 1536px | Escritorio grande           | Solo densidad extra                              |
 *
 * `lg` es el corte que importa: por debajo no hay sidebar. Es también el ancho
 * desde el que la barra superior (filtros + barra de días) puede quedarse fija
 * sin comerse la pantalla.
 */

import tokens from './design-tokens.json';

export type Breakpoint = keyof typeof tokens.screens;

/** Ancho mínimo de cada breakpoint, en px. */
export const BREAKPOINTS = Object.fromEntries(
  Object.entries(tokens.screens).map(([nombre, valor]) => [nombre, parseInt(valor, 10)]),
) as Record<Breakpoint, number>;

/** Media query de "desde este breakpoint", la misma que genera el prefijo de Tailwind. */
export const mediaDesde = (bp: Breakpoint): string => `(min-width: ${tokens.screens[bp]})`;
