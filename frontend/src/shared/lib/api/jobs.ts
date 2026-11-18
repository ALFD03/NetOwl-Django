/**
 * Seguimiento de los análisis que ejecuta el worker de Celery.
 *
 * La petición que lanza un análisis vuelve al instante: el log y el progreso solo
 * existen en la fila del job, y esto es lo que convierte esa fila en una promesa
 * que las páginas pueden esperar.
 */

import { apiClient, notifyDataChanged } from './client';
import { JobCancelledError, JobFailedError } from '../http/errors';

/** Modules that run their analysis through the Celery worker. */
export type JobModule = 'subs_analysis' | 'crm_analysis' | 'support_analysis' | 'subs_lifetime';

export type JobStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface AnalysisJob {
  id: string;
  module: JobModule;
  module_display: string;
  period: string;
  status: JobStatus;
  status_display: string;
  message: string;
  log_output: string;
  progress: { done: number; total: number; label: string };
  result: { period_label?: string; computed_days?: number };
  created_at: string;
  finished_at: string | null;
}

/** Response of the endpoints that enqueue an analysis (202, or 409 when one is already running). */
interface StartJobResponse {
  status: 'queued' | 'running';
  message: string;
  job: AnalysisJob;
}

const POLL_INTERVAL_MS = 2000;

/**
 * Aviso de que acaba de encolarse un análisis.
 *
 * El aviso flotante sondea la cola con su propia cadencia, y entre lanzar un
 * análisis y el siguiente sondeo pueden pasar hasta veinte segundos en los que
 * la pantalla no refleja nada de lo que se acaba de pedir. Esto le da la señal
 * para consultar en el acto, sin bajar el intervalo de todos los demás sondeos.
 */
type QueueListener = () => void;
const queueListeners = new Set<QueueListener>();

export function notifyJobQueued(): void {
  queueListeners.forEach((listener) => listener());
}

export function subscribeToQueuedJobs(listener: QueueListener): () => void {
  queueListeners.add(listener);
  return () => {
    queueListeners.delete(listener);
  };
}

/** Un job deja de moverse cuando termina, falla o alguien lo cancela. */
const isFinished = (job: AnalysisJob) =>
  job.status === 'success' || job.status === 'error' || job.status === 'cancelled';

/** Everything the worker is running or has queued, for the floating indicator. */
export interface JobQueue {
  jobs: AnalysisJob[];
  running: number;
  queued: number;
}

export const jobsApi = {
  fetch: async (id: string) => (await apiClient.get<AnalysisJob>(`/api/imports/jobs/${id}/`)).data,

  queue: async () => (await apiClient.get<JobQueue>('/api/imports/jobs/queue/')).data,

  /** Open run of a module, so a reloaded page can re-attach to it. */
  active: async (module: JobModule) =>
    (await apiClient.get<{ job: AnalysisJob | null }>('/api/imports/jobs/active/', { params: { module } }))
      .data.job,

  /**
   * Pide detener una ejecución encolada o en curso.
   *
   * Responde en cuanto la fila queda cerrada, no cuando el worker se entera: si
   * ya estaba calculando, se detiene en su siguiente punto de control. El sondeo
   * que ya está en marcha es el que enseña ese final.
   */
  cancel: async (id: string) =>
    (await apiClient.post<{ status: string; message: string; job: AnalysisJob }>(
      `/api/imports/jobs/${id}/cancel/`,
    )).data,
};

/**
 * Polls a job until it finishes, reporting every intermediate state.
 *
 * The analyses moved to the Celery worker, so the POST that starts one returns
 * immediately: the run's log and progress only exist in the job row, and this
 * is what turns that row back into a promise the pages can await.
 */
export async function followJob(
  job: AnalysisJob,
  onProgress?: (job: AnalysisJob) => void,
): Promise<AnalysisJob> {
  let current = job;
  onProgress?.(current);

  while (!isFinished(current)) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      current = await jobsApi.fetch(current.id);
    } catch {
      // Un fallo puntual del sondeo (reinicio de la app, red) no significa que
      // el analisis haya muerto: el worker sigue. Se reintenta en el siguiente ciclo.
      continue;
    }
    onProgress?.(current);
  }
  // Lo que escribió el worker (o la parte que llegó a escribir) ya está en la BD.
  notifyDataChanged();

  if (current.status === 'cancelled') {
    throw new JobCancelledError(current.message, current.log_output);
  }
  if (current.status === 'error') {
    throw new JobFailedError(current.message, current.log_output);
  }
  return current;
}

/** Starts an analysis and waits for the worker to finish it. */
export async function startAndFollow(
  path: string,
  body: Record<string, unknown>,
  onProgress?: (job: AnalysisJob) => void,
): Promise<AnalysisJob> {
  let started: StartJobResponse;
  try {
    started = (await apiClient.post<StartJobResponse>(path, body)).data;
  } catch (error) {
    // 409: ya habia un analisis del mismo modulo corriendo. No es un error para
    // el usuario, es el mismo trabajo: nos enganchamos a el.
    const running = extractRunningJob(error);
    if (!running) throw error;
    notifyJobQueued();
    return followJob(running.job, onProgress);
  }
  notifyJobQueued();
  return followJob(started.job, onProgress);
}

function extractRunningJob(error: unknown): StartJobResponse | null {
  const data = (error as { response?: { status?: number; data?: StartJobResponse } })?.response;
  if (data?.status === 409 && data.data?.job) return data.data;
  return null;
}

/** Lo que responde el lanzamiento de un lote de meses (`jobs._lanzar_lote`). */
export interface BatchJobs {
  message: string;
  /** Los jobs creados ahora, uno por mes. */
  jobs: AnalysisJob[];
  /** Los meses que ya estaban en la cola o corriendo, con su job, para seguirlos igual. */
  skipped: AnalysisJob[];
}

/**
 * Encola un análisis por cada mes, en un solo POST.
 *
 * Uno por mes desde el cliente chocaría con el límite de `2/m` de los
 * endpoints de cálculo. Si todos ya estaban en la cola el servidor responde
 * 409 con ellos en `omitidos`, y se tratan igual: se siguen.
 */
export async function startBatch(path: string, months: string[]): Promise<BatchJobs> {
  try {
    const batch = (await apiClient.post<BatchJobs>(path, { months })).data;
    notifyJobQueued();
    return batch;
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: BatchJobs } })?.response;
    if (response?.status === 409 && response.data?.skipped) {
      notifyJobQueued();
      return response.data;
    }
    throw error;
  }
}

/**
 * Sondea varios jobs a la vez hasta que terminen todos, avisando de cada ronda.
 *
 * No lanza si alguno falla o se cancela: en un lote eso es el desenlace de un
 * mes, no del lote, y la interfaz lo enseña en su fila.
 */
export async function followJobs(
  jobs: AnalysisJob[],
  onProgress: (jobs: AnalysisJob[]) => void,
): Promise<AnalysisJob[]> {
  let currentJobs = jobs;
  onProgress(currentJobs);
  while (currentJobs.some((job) => !isFinished(job))) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    currentJobs = await Promise.all(
      currentJobs.map((job) => (isFinished(job) ? job : jobsApi.fetch(job.id).catch(() => job))),
    );
    onProgress(currentJobs);
  }
  notifyDataChanged();
  return currentJobs;
}
