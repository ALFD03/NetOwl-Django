/** Cliente del módulo de Catálogos: el par de endpoints que escribe todos los catálogos. */

import { apiClient } from './client';
import type { CatalogoTipo } from '@/shared/types/subscriptions';

/** Una fila de cualquier catálogo. Sin `id` es un alta. */
export interface CatalogoPayload extends Record<string, unknown> {
  id?: number | null;
}

/** Lo que responde un alta en bloque. */
export interface ResultadoLote {
  status: 'success' | 'error';
  message: string;
  registrados: Record<string, unknown>[];
  /** Las filas que no entraron, con el motivo. */
  errores: { nombre: string; message: string }[];
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

  /**
   * Alta de varias filas de un catálogo de una vez. Cada una se valida como un
   * alta suelta; las que no entran vuelven en `errores` y las demás quedan
   * guardadas.
   */
  guardarLote: async (tipo: CatalogoTipo, filas: CatalogoPayload[]): Promise<ResultadoLote> =>
    (await apiClient.post('/catalogos/api/guardar-lote/', { tipo, filas })).data,

  eliminar: async (tipo: CatalogoTipo, id: number) =>
    (await apiClient.post('/catalogos/api/eliminar/', { tipo, id })).data,
};
