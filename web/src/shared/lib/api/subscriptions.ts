/** Endpoints del módulo de suscripciones: reporte ETA y catálogos. */

import { apiClient } from './client';
import { startAndFollow, type AnalysisJob } from './jobs';
import type { CatalogoTipo, SubscriptionResultsResponse } from '@/shared/types/subscriptions';

export interface EtaReportResponse {
  status?: string;
  periodo?: string;
  [key: string]: unknown;
}

export interface EtaLockRequest { period: string; lock: boolean; }

export interface EtaSubConfigRequest {
  orden?: string;
  cliente?: string;
  producto?: string;
  tecnologia?: string;
  tipo_persona?: string;
  datas_mbps?: number;
  tiene_tv?: boolean;
  reportar?: boolean;
  es_transporte?: boolean;
  es_dedicado?: boolean;
}

export interface DeleteEtaSubRequest { orden: string; }

/** Una fila de cualquier catálogo. Sin `id` es un alta. */
export interface CatalogoPayload extends Record<string, unknown> {
  id?: number | null;
}

export const subscriptionsApi = {
  getResultsDetails: async (period: string) =>
    (await apiClient.get<SubscriptionResultsResponse>(`/subscriptions/api/results/${period}/`)).data,

  getEtaReport: async (period: string, force = false) =>
    (await apiClient.get<EtaReportResponse>('/subscriptions/api/eta-report/data/', { params: { period, force } })).data,

  lockEtaReport: async (request: EtaLockRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/lock/', request)).data,

  saveEtaSubConfig: async (request: EtaSubConfigRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/save-sub-config/', request)).data,

  deleteEtaSubConfig: async (request: DeleteEtaSubRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/delete-sub-config/', request)).data,

  /**
   * Alta o edición de una fila de catálogo.
   *
   * Un solo endpoint para los seis catálogos: lo que cambia entre ellos son
   * los campos del cuerpo, no la forma de la petición.
   */
  saveCatalogo: async (tipo: CatalogoTipo, payload: CatalogoPayload) =>
    (await apiClient.post('/subscriptions/api/catalogos/guardar/', { tipo, ...payload })).data,

  deleteCatalogo: async (tipo: CatalogoTipo, id: number) =>
    (await apiClient.post('/subscriptions/api/catalogos/eliminar/', { tipo, id })).data,

  /**
   * Runs the survival analysis in the Celery worker and waits for it.
   *
   * It walks the whole subscription history with `lifelines`, so it hit the
   * same request timeout as the monthly analysis and now goes through a job.
   */
  runLifetime: async (onProgress?: (job: AnalysisJob) => void) =>
    startAndFollow('/subscriptions/api/lifecycle/run/', {}, onProgress),
};
