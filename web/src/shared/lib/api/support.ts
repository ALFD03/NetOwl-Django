/** Endpoints del módulo de soporte. */

import { apiClient } from './client';
import type { ApiMessageResponse } from './types';

export interface SupportAnalysisRequest { month: string | null; }
export type SupportAnalysisResponse = ApiMessageResponse;

/** Corte completo de un día; lo pide y cachea `useDayPayload`, no `supportApi`. */
export const SUPPORT_DAY_METRICS_URL = '/support/api/day-metrics/';

export const supportApi = {
  runAnalysis: async (request: SupportAnalysisRequest) =>
    (await apiClient.post<SupportAnalysisResponse>('/imports/api/run-support-analysis/', request)).data,
};
