/** La pila de modales abiertos, para que los avisos de una acción se pinten en el de arriba. */

import { useSyncExternalStore } from 'react';

let slots: HTMLElement[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

/** Registra el hueco de avisos de un modal recién abierto; devuelve cómo quitarlo. */
export function registerModalSlot(slot: HTMLElement): () => void {
  slots = [...slots, slot];
  emit();
  return () => {
    slots = slots.filter((other) => other !== slot);
    emit();
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** El hueco de avisos del modal de arriba, o `null` si no hay ninguno abierto. */
export function useTopModalSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, () => slots[slots.length - 1] ?? null);
}
