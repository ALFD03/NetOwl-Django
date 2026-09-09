import { apiClient } from './client';
import { startAndFollow, type AnalysisJob } from './jobs';
import type { SubscriptionResultsResponse } from '@/shared/types/subscriptions';

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

export interface EtaPlanConfigRequest extends Record<string, unknown> {
  plan_name?: string;
  name?: string;
}

export interface DeleteEtaSubRequest { orden: string; }
export interface DeleteEtaPlanRequest { plan_name: string; }

export const subscriptionsApi = {
  getResultsDetails: async (period: string) =>
    (await apiClient.get<SubscriptionResultsResponse>(`/subscriptions/api/results/${period}/`)).data,

  getEtaReport: async (period: string, force = false) =>
    (await apiClient.get<EtaReportResponse>('/subscriptions/api/eta-report/data/', { params: { period, force } })).data,

  lockEtaReport: async (request: EtaLockRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/lock/', request)).data,

  saveEtaSubConfig: async (request: EtaSubConfigRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/save-sub-config/', request)).data,

  saveEtaPlanConfig: async (request: EtaPlanConfigRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/save-plan-config/', request)).data,

  deleteEtaSubConfig: async (request: DeleteEtaSubRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/delete-sub-config/', request)).data,

  deleteEtaPlanConfig: async (request: DeleteEtaPlanRequest) =>
    (await apiClient.post('/subscriptions/api/eta-report/delete-plan-config/', request)).data,

  /**
   * Runs the survival analysis in the Celery worker and waits for it.
   *
   * It walks the whole subscription history with `lifelines`, so it hit the
   * same request timeout as the monthly analysis and now goes through a job.
   */
  runLifetime: async (onProgress?: (job: AnalysisJob) => void) =>
    startAndFollow('/subscriptions/api/lifecycle/run/', {}, onProgress),
};
