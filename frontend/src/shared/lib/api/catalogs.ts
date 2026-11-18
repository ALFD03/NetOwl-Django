/** Cliente del módulo de Catálogos: el par de endpoints que escribe todos los catálogos. */

import { apiClient } from './client';
import type { CatalogKind } from '@/shared/types/subscriptions';

/** Una fila de cualquier catálogo. Sin `id` es un alta. */
export interface CatalogPayload extends Record<string, unknown> {
  id?: number | null;
}

/** Lo que responde un alta en bloque. */
export interface BatchResult {
  status: 'success' | 'error';
  message: string;
  saved: Record<string, unknown>[];
  /** Las filas que no entraron, con el motivo. */
  errors: { name: string; message: string }[];
}

export const catalogsApi = {
  /**
   * Alta o edición de una fila de catálogo.
   *
   * Un solo endpoint para todos los catálogos: lo que cambia entre ellos son
   * los campos del cuerpo, no la forma de la petición.
   */
  save: async (kind: CatalogKind, payload: CatalogPayload) =>
    (await apiClient.post('/api/catalogs/save/', { kind, ...payload })).data,

  /**
   * Alta de varias filas de un catálogo de una vez. Cada una se valida como un
   * alta suelta; las que no entran vuelven en `errors` y las demás quedan
   * guardadas.
   */
  saveBatch: async (kind: CatalogKind, rows: CatalogPayload[]): Promise<BatchResult> =>
    (await apiClient.post('/api/catalogs/save-batch/', { kind, rows })).data,

  remove: async (kind: CatalogKind, id: number) =>
    (await apiClient.post('/api/catalogs/delete/', { kind, id })).data,
};
