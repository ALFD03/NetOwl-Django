import { useState } from 'react';

/**
 * Llama a `onOpen` cada vez que `open` pasa a `true`.
 *
 * Es el ajuste en render de React, no un efecto: sirve para limpiar el error de
 * la acción anterior al abrir un formulario sin pintar antes el viejo.
 */
export function useOnOpen(open: boolean, onOpen: () => void): void {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) onOpen();
  }
}
