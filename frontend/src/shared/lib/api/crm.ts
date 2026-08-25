import { apiClient } from './client';

export interface CrmAnalysisRequest { month: string; }
import type { ApiMessageResponse } from './types';

export type CrmAnalysisResponse = ApiMessageResponse;

export const crmApi = {
  runAnalysis: async (request: CrmAnalysisRequest) =>
    (await apiClient.post<CrmAnalysisResponse>('/imports/api/run-crm-analysis/', request)).data,
};
