/**
 * Lleva al ancla de la URL (`#detalle`) al montar la página. El scroll vive en
 * `<main>` y no en la ventana, así que el navegador no salta solo.
 */

import { useEffect } from 'react';

export function useScrollToHash() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, []);
}
