import { apiClient } from './client';

import type { ApiMessageResponse } from './types';

export type ImportResponse = ApiMessageResponse;

export interface RunAnalysisRequest { month: string | null; }

async function upload(path: string, file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append('csv_file', file);
  return (await apiClient.post<ImportResponse>(path, formData)).data;
}

async function run(path: string, request: RunAnalysisRequest): Promise<ImportResponse> {
  return (await apiClient.post<ImportResponse>(path, request)).data;
}

export const importsApi = {
  importSubscriptions: (file: File) => upload('/imports/api/import-subscriptions/', file),
  importLogs: (file: File) => upload('/imports/api/import-logs/', file),
  importCrm: (file: File) => upload('/imports/api/import-crm/', file),
  importSupport: (file: File) => upload('/imports/api/import-support/', file),
  runSubscriptionsAnalysis: (month: string | null) => run('/imports/api/run-analysis/', { month }),
  runCrmAnalysis: (month: string) => run('/imports/api/run-crm-analysis/', { month }),
  runSupportAnalysis: (month: string | null) => run('/imports/api/run-support-analysis/', { month }),
};
