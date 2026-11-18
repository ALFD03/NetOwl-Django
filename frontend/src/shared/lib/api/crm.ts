/** Endpoints del módulo de CRM. */

import { apiClient } from './client';
import type { CrmDimensionsResponse } from '@/shared/types/crm';
import type { ApiMessageResponse } from './types';

export interface CrmAnalysisRequest { month: string; }

export type CrmAnalysisResponse = ApiMessageResponse;

/** Corte completo de un día; lo pide y cachea `useDayPayload`, no `crmApi`. */
export const CRM_DAY_METRICS_URL = '/api/crm/day-metrics/';

export const crmApi = {
  runAnalysis: async (request: CrmAnalysisRequest) =>
    (await apiClient.post<CrmAnalysisResponse>('/api/imports/crm/run/', request)).data,

  /** Every dimension row of one period; the Results modal loads it on demand. */
  getDimensions: async (period: string) =>
    (await apiClient.get<CrmDimensionsResponse>('/api/crm/dimension-metrics/', { params: { period } })).data,
};
