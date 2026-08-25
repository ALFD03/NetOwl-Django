import { apiClient } from './client';

export interface SupportAnalysisRequest { month: string | null; }
import type { ApiMessageResponse } from './types';

export type SupportAnalysisResponse = ApiMessageResponse;

export const supportApi = {
  runAnalysis: async (request: SupportAnalysisRequest) =>
    (await apiClient.post<SupportAnalysisResponse>('/imports/api/run-support-analysis/', request)).data,
};
