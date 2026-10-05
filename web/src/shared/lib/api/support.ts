/** Endpoints del módulo de soporte. */

import { apiClient } from './client';
import type { ApiMessageResponse } from './types';

export interface SupportAnalysisRequest { month: string | null; }
export type SupportAnalysisResponse = ApiMessageResponse;

/** Corte completo de un día; lo pide y cachea `useDayPayload`, no `supportApi`. */
export const SUPPORT_DAY_METRICS_URL = '/support/api/day-metrics/';

/**
 * Los dos catálogos del directorio de usuarios.
 *
 * Vive aquí y no en `shared/types` por lo mismo que `CatalogoPayload`: es la
 * forma de la petición, no un concepto del dominio.
 */
export type DirectorioTipo = 'usuarios' | 'departamentos';

/** Una fila del directorio. Sin `id` es un alta. */
export interface DirectorioPayload extends Record<string, unknown> {
  id?: number | null;
}

/** Lo que le puede pasar a un usuario del directorio, además de editarlo. */
export type MovimientoUsuario = 'cambiar_departamento' | 'deshacer_cambio' | 'baja' | 'reactivar';

export const supportApi = {
  runAnalysis: async (request: SupportAnalysisRequest) =>
    (await apiClient.post<SupportAnalysisResponse>('/imports/api/run-support-analysis/', request)).data,

  /**
   * Alta o edición de un usuario del directorio o de un departamento.
   *
   * Un solo endpoint para los dos: lo que cambia entre ellos son los campos
   * del cuerpo, no la forma de la petición.
   */
  saveDirectorio: async (tipo: DirectorioTipo, payload: DirectorioPayload) =>
    (await apiClient.post('/support/api/usuarios/guardar/', { tipo, ...payload })).data,

  deleteDirectorio: async (tipo: DirectorioTipo, id: number) =>
    (await apiClient.post('/support/api/usuarios/eliminar/', { tipo, id })).data,

  /**
   * Cambio de departamento, baja o reactivación. `fecha` la piden el cambio
   * (desde cuándo) y la baja (el egreso).
   */
  moverUsuario: async (
    accion: MovimientoUsuario,
    id: number,
    extra: { departamento_id?: number | null; fecha?: string } = {},
  ) => (await apiClient.post('/support/api/usuarios/movimiento/', { accion, id, ...extra })).data,
};
