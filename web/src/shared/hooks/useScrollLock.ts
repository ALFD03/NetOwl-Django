/**
 * Congela el scroll de la página mientras algo la tapa (un modal, el cajón del menú).
 *
 * El scroll de la app vive en `<main data-app-scroll>`, no en el body: hay que
 * congelar ese contenedor además del body para que el fondo no se mueva, que en
 * un teléfono es lo primero que pasa al arrastrar el dedo sobre el velo.
 */

import { useEffect } from 'react';

export function useScrollLock(activo: boolean): void {
  useEffect(() => {
    // Inactivo no toca nada. Antes la limpieza corria igualmente, asi que en una
    // pantalla con varios modales montados (Configuracion tiene cinco) los
    // cerrados le quitaban el bloqueo al que si estaba abierto, en cada render.
    // Ese vaiven de `overflow` reajusta la barra de scroll, y un desplegable
    // nativo abierto se cierra solo cuando eso pasa.
    if (!activo) return;

    const scroller = document.querySelector<HTMLElement>('[data-app-scroll]');
    const bodyPrevio = document.body.style.overflow;
    const scrollerPrevio = scroller?.style.overflow ?? '';

    document.body.style.overflow = 'hidden';
    if (scroller) scroller.style.overflow = 'hidden';

    return () => {
      // Se restaura lo que hubiera, en vez de asumir 'auto': si hay un modal
      // encima del otro, el de abajo debe seguir bloqueando.
      document.body.style.overflow = bodyPrevio;
      if (scroller) scroller.style.overflow = scrollerPrevio;
    };
  }, [activo]);
}
