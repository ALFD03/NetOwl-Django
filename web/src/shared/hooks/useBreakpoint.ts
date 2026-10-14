/**
 * Saber desde JS si la pantalla llega a un breakpoint.
 *
 * Para maquetar se usan las clases (`lg:flex`); esto es para lo que una clase no
 * alcanza: opciones de Chart.js, cuántas marcas cabe dibujar, si un panel se
 * abre como cajón o fijo.
 */

import { useSyncExternalStore } from 'react';

import { mediaDesde, type Breakpoint } from '@/shared/constants/breakpoints';

/** `true` si el viewport mide al menos `bp`. Se actualiza al girar o redimensionar. */
export function useBreakpoint(bp: Breakpoint): boolean {
  const query = mediaDesde(bp);

  return useSyncExternalStore(
    (avisar) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', avisar);
      return () => mql.removeEventListener('change', avisar);
    },
    () => window.matchMedia(query).matches,
    // Sin ventana (no hay SSR hoy, pero no cuesta nada) se asume escritorio,
    // que es como se diseñó todo lo que ya existía.
    () => true,
  );
}
