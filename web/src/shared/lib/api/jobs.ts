/**
 * Seguimiento de los análisis que ejecuta el worker de Celery.
 *
 * La petición que lanza un análisis vuelve al instante: el log y el progreso solo
 * existen en la fila del job, y esto es lo que convierte esa fila en una promesa
 * que las páginas pueden esperar.
 */

import { apiClient } from './client';
import { JobCancelledError, JobFailedError } from '../http/errors';

/** Modules that run their analysis through the Celery worker. */
export type JobModule = 'subs_analysis' | 'crm_analysis' | 'support_analysis' | 'subs_lifetime';

export type JobStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface AnalysisJob {
  id: string;
  module: JobModule;
  module_display: string;
  periodo: string;
  status: JobStatus;
  status_display: string;
  message: string;
  log_output: string;
  progress: { done: number; total: number; label: string };
  result: { periodo_label?: string; dias_calculados?: number };
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
type OyenteDeCola = () => void;
const oyentesDeCola = new Set<OyenteDeCola>();

export function notificarJobEncolado(): void {
  oyentesDeCola.forEach((oyente) => oyente());
}

export function suscribirseAJobsEncolados(oyente: OyenteDeCola): () => void {
  oyentesDeCola.add(oyente);
  return () => {
    oyentesDeCola.delete(oyente);
  };
}

/** Un job deja de moverse cuando termina, falla o alguien lo cancela. */
const isFinished = (job: AnalysisJob) =>
  job.status === 'success' || job.status === 'error' || job.status === 'cancelled';

/** Everything the worker is running or has queued, for the floating indicator. */
export interface JobQueue {
  jobs: AnalysisJob[];
  en_ejecucion: number;
  en_cola: number;
}

export const jobsApi = {
  fetch: async (id: string) => (await apiClient.get<AnalysisJob>(`/imports/api/jobs/${id}/`)).data,

  queue: async () => (await apiClient.get<JobQueue>('/imports/api/jobs/queue/')).data,

  /** Open run of a module, so a reloaded page can re-attach to it. */
  active: async (module: JobModule) =>
    (await apiClient.get<{ job: AnalysisJob | null }>('/imports/api/jobs/active/', { params: { module } }))
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
      `/imports/api/jobs/${id}/cancel/`,
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
    notificarJobEncolado();
    return followJob(running.job, onProgress);
  }
  notificarJobEncolado();
  return followJob(started.job, onProgress);
}

function extractRunningJob(error: unknown): StartJobResponse | null {
  const data = (error as { response?: { status?: number; data?: StartJobResponse } })?.response;
  if (data?.status === 409 && data.data?.job) return data.data;
  return null;
}
