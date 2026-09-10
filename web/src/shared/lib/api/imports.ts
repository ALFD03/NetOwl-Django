import { apiClient } from './client';
import { startAndFollow, type AnalysisJob } from './jobs';

import type { ApiMessageResponse } from './types';

export type ImportResponse = ApiMessageResponse;

async function upload(path: string, file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append('csv_file', file);
  return (await apiClient.post<ImportResponse>(path, formData)).data;
}

/**
 * Enqueues an analysis and resolves when the worker finishes it.
 *
 * The analyses no longer run inside the request (they took minutes and hit the
 * proxy's 504), so what used to be one POST is now: enqueue, poll, and shape
 * the finished job like the old response so callers keep reading the same keys.
 */
async function run(
  path: string,
  month: string | null,
  onProgress?: (job: AnalysisJob) => void,
): Promise<ImportResponse> {
  const job = await startAndFollow(path, { month }, onProgress);
  return {
    message: job.message,
    log_output: job.log_output,
    periodo_label: job.result.periodo_label,
    dias_calculados: job.result.dias_calculados,
  };
}

export const importsApi = {
  importSubscriptions: (file: File) => upload('/imports/api/import-subscriptions/', file),
  importLogs: (file: File) => upload('/imports/api/import-logs/', file),
  importGratis: (file: File) => upload('/imports/api/import-gratis/', file),
  importCrm: (file: File) => upload('/imports/api/import-crm/', file),
  importSupport: (file: File) => upload('/imports/api/import-support/', file),
  runSubscriptionsAnalysis: (month: string | null, onProgress?: (job: AnalysisJob) => void) =>
    run('/imports/api/run-analysis/', month, onProgress),
  runCrmAnalysis: (month: string | null, onProgress?: (job: AnalysisJob) => void) =>
    run('/imports/api/run-crm-analysis/', month, onProgress),
  runSupportAnalysis: (month: string | null, onProgress?: (job: AnalysisJob) => void) =>
    run('/imports/api/run-support-analysis/', month, onProgress),
};
