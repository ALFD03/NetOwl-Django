import { apiClient } from './client';
import type { ApiMessageResponse } from './types';

export interface SupportAnalysisRequest { month: string | null; }
export type SupportAnalysisResponse = ApiMessageResponse;

export const supportApi = {
  runAnalysis: async (request: SupportAnalysisRequest) =>
    (await apiClient.post<SupportAnalysisResponse>('/imports/api/run-support-analysis/', request)).data,
};
