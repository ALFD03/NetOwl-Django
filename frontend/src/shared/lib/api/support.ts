/** Endpoints del módulo de soporte. */

import { apiClient } from './client';
import type { ApiMessageResponse } from './types';

export interface SupportAnalysisRequest { month: string | null; }
export type SupportAnalysisResponse = ApiMessageResponse;

/** Corte completo de un día; lo pide y cachea `useDayPayload`, no `supportApi`. */
export const SUPPORT_DAY_METRICS_URL = '/api/support/day-metrics/';

/**
 * Los dos catálogos del directorio de usuarios.
 *
 * Vive aquí y no en `shared/types` por lo mismo que `CatalogPayload`: es la
 * forma de la petición, no un concepto del dominio.
 */
export type DirectoryKind = 'usuarios' | 'departamentos';

/** Una fila del directorio. Sin `id` es un alta. */
export interface DirectoryPayload extends Record<string, unknown> {
  id?: number | null;
}

/** Lo que le puede pasar a un usuario del directorio, además de editarlo. */
export type UserMove = 'cambiar_departamento' | 'deshacer_cambio' | 'baja' | 'reactivar';

export const supportApi = {
  runAnalysis: async (request: SupportAnalysisRequest) =>
    (await apiClient.post<SupportAnalysisResponse>('/api/imports/support/run/', request)).data,

  /**
   * Alta o edición de un usuario del directorio o de un departamento.
   *
   * Un solo endpoint para los dos: lo que cambia entre ellos son los campos
   * del cuerpo, no la forma de la petición.
   */
  saveDirectoryEntry: async (kind: DirectoryKind, payload: DirectoryPayload) =>
    (await apiClient.post('/api/support/users/save/', { type: kind, ...payload })).data,

  deleteDirectoryEntry: async (kind: DirectoryKind, id: number) =>
    (await apiClient.post('/api/support/users/delete/', { type: kind, id })).data,

  /**
   * Cambio de departamento, baja o reactivación. `fecha` la piden el cambio
   * (desde cuándo) y la baja (el egreso).
   */
  moveUser: async (
    action: UserMove,
    id: number,
    extra: { department_id?: number | null; date?: string } = {},
  ) => (await apiClient.post('/api/support/users/move/', { action, id, ...extra })).data,

  /** Alta o edición de una etapa del catálogo. Sin `id` es un alta. */
  saveStage: async (payload: { id?: number; name: string; team: string; type: string }) =>
    (await apiClient.post<ApiMessageResponse>('/api/support/stages/save/', payload)).data,

  deleteStage: async (id: number) =>
    (await apiClient.post<ApiMessageResponse>('/api/support/stages/delete/', { id })).data,
};
