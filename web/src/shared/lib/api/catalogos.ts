/** Cliente del módulo de Catálogos: el par de endpoints que escribe todos los catálogos. */

import { apiClient } from './client';
import type { CatalogoTipo } from '@/shared/types/subscriptions';

/** Una fila de cualquier catálogo. Sin `id` es un alta. */
export interface CatalogoPayload extends Record<string, unknown> {
  id?: number | null;
}

export const catalogosApi = {
  /**
   * Alta o edición de una fila de catálogo.
   *
   * Un solo endpoint para todos los catálogos: lo que cambia entre ellos son
   * los campos del cuerpo, no la forma de la petición.
   */
  guardar: async (tipo: CatalogoTipo, payload: CatalogoPayload) =>
    (await apiClient.post('/catalogos/api/guardar/', { tipo, ...payload })).data,

  eliminar: async (tipo: CatalogoTipo, id: number) =>
    (await apiClient.post('/catalogos/api/eliminar/', { tipo, id })).data,
};
