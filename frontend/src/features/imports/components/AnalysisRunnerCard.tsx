/**
 * Tarjeta de ejecución de un análisis: mes, progreso y consola en vivo.
 *
 * El análisis corre en el worker, así que esta tarjeta sondea la fila del job; si
 * se recarga la página se reengancha al que siga abierto. Cancelar no está aquí
 * sino en el aviso flotante (`AnalysisQueueAlert`), que es el único sitio que ve
 * toda la cola y está en todas las pantallas.
 *
 * Con `onRunBatch` ofrece además **varios meses**: un rango desde/hasta que se
 * encola de una vez, un job por mes, y se sigue mes a mes en `MonthBatch`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CalendarRange, Play } from 'lucide-react';

import { useAsyncAction, type ActionStatus } from '@/shared/hooks/useAsyncAction';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import {
  followJob, followJobs, jobsApi, type AnalysisJob, type JobModule, type BatchJobs,
} from '@/shared/lib/api/jobs';
import { Button, ConsoleOutput, MonthPicker, Panel, ProgressBar, StatusMessage, ToggleGroup } from '@/shared/ui';
import type { ImportOperationResult } from '../types';
import { MonthBatch, monthsBetween } from './MonthBatch';

/** Lo mismo que `jobs.MAX_MESES_LOTE`: el servidor rechaza más. */
const MAX_BATCH_MONTHS = 24;

export interface AnalysisRunnerCardProps {
  title: string;
  description?: string;
  runLabel: string;
  consoleTitle: string;
  monthPlaceholder: string;
  /**
   * Runs the analysis for the chosen month (null when none is required).
   *
   * The run happens in the Celery worker, so `onProgress` fires on every poll
   * with the job's live log and day counter.
   */
  onRun: (month: string | null, onProgress?: (job: AnalysisJob) => void) => Promise<ImportOperationResult>;
  successMessage: (result: ImportOperationResult, month: string) => string;
  errorMessage: string;
  /** Text written to the console while the run is in flight. */
  pendingLog?: (month: string) => string;
  /**
   * When true the run button stays disabled until a month is chosen, and
   * submitting without one reports a validation message instead of calling the API.
   */
  requireMonth?: boolean;
  /** Validation copy shown when `requireMonth` is set and none was chosen. */
  missingMonthMessage?: string;
  /**
   * Job module this card runs. Given it, the card re-attaches on mount to a run
   * already in flight — an analysis outlives the page that started it, so
   * reloading must not look like the run was lost.
   */
  jobModule?: JobModule;
  /**
   * Encola el análisis de varios meses de una vez. Dado, la tarjeta ofrece el
   * modo «Varios meses» con un rango desde/hasta.
   */
  onRunBatch?: (months: string[]) => Promise<BatchJobs>;
}

/**
 * Month picker + run button + live console, shared by every import page.
 *
 * Replaces the `isAnalyzing` / `analysisMessage` / `consoleLog` state triple and
 * the duplicated axios error narrowing that each page carried.
 */
export function AnalysisRunnerCard({
  title,
  description,
  runLabel,
  consoleTitle,
  monthPlaceholder,
  onRun,
  successMessage,
  errorMessage,
  pendingLog,
  requireMonth = false,
  missingMonthMessage = 'Por favor selecciona el mes de análisis en el calendario.',
  jobModule,
  onRunBatch,
}: AnalysisRunnerCardProps) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [mode, setMode] = useState<'uno' | 'varios'>('uno');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  // Los jobs del lote en curso (o del último), y el que se mira en la consola.
  const [batch, setBatch] = useState<AnalysisJob[] | null>(null);
  const [activeBatch, setActiveBatch] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const batchMonths = monthsBetween(from, until);
  const [validation, setValidation] = useState<ActionStatus | null>(null);
  // Estado vivo del job: lo que llega en cada sondeo mientras el worker calcula.
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [isAttached, setIsAttached] = useState(false);
  // Solo mientras se encola, no mientras se calcula: el boton vuelve a estar
  // disponible en cuanto el analisis tiene su sitio en la cola.
  const [sending, setSending] = useState(false);

  const analysis = useAsyncAction(onRun, {
    successMessage: (result) => successMessage(result, selectedMonth),
    errorMessage,
    readLog: (result) => result.log_output ?? result.message,
    pendingLog: pendingLog?.(selectedMonth),
  });

  /**
   * Cada estado que llega del sondeo.
   *
   * Se cancela desde el aviso flotante, pero el desenlace también se refleja
   * aquí. Cancelar no es un fallo, y `useAsyncAction` solo sabe de éxito y
   * error: se escribe como aviso, y manda sobre el suyo porque `validation`
   * tiene preferencia.
   */
  const onJobUpdate = useCallback((alive: AnalysisJob) => {
    setJob(alive);
    if (alive.status === 'cancelled') {
      setValidation({ type: 'warning', text: alive.message || 'Análisis cancelado.' });
    }
  }, []);

  const handleRun = async () => {
    if (requireMonth && !selectedMonth) {
      setValidation({ type: 'error', text: missingMonthMessage });
      return;
    }
    setValidation(null);
    setJob(null);
    setSending(true);
    try {
      // El primer sondeo con el job ya creado es la senal de que esta encolado.
      await analysis.run(selectedMonth || null, (alive) => {
        setSending(false);
        onJobUpdate(alive);
      });
    } finally {
      setSending(false);
    }
  };

  const handleRunBatch = async () => {
    if (!onRunBatch) return;
    if (batchMonths.length === 0) {
      setValidation({ type: 'error', text: 'Elige el primer y el último mes del rango.' });
      return;
    }
    if (batchMonths.length > MAX_BATCH_MONTHS) {
      setValidation({ type: 'error', text: `Como mucho ${MAX_BATCH_MONTHS} meses por lote; el rango tiene ${batchMonths.length}.` });
      return;
    }
    setValidation(null);
    setSending(true);
    let jobs: AnalysisJob[];
    try {
      const response = await onRunBatch(batchMonths);
      jobs = [...response.jobs, ...response.skipped].sort((a, b) => a.period.localeCompare(b.period));
      setValidation({ type: 'info', text: response.message });
    } catch (error: unknown) {
      setValidation({ type: 'error', text: getApiErrorMessage(error, errorMessage) });
      return;
    } finally {
      setSending(false);
    }

    setWatching(null);
    setActiveBatch(true);
    try {
      const finished = await followJobs(jobs, setBatch);
      const failed = finished.filter((j) => j.status === 'error').length;
      const cancelled = finished.filter((j) => j.status === 'cancelled').length;
      const succeeded = finished.length - failed - cancelled;
      const summary = [`${succeeded} de ${finished.length} meses calculados`];
      if (failed) summary.push(`${failed} con error`);
      if (cancelled) summary.push(`${cancelled} cancelados`);
      setValidation({
        type: failed ? 'error' : cancelled ? 'warning' : 'success',
        text: `${summary.join(' · ')}.`,
      });
    } finally {
      setActiveBatch(false);
    }
  };

  // Reenganche: si al abrir la pagina ya hay un analisis de este modulo en
  // curso (lo lanzo otra pestana, u otro usuario), se sigue en vez de ofrecer
  // un boton que solo devolveria un 409.
  //
  // Va con `.then` y no con `async`/`await` dentro del efecto: el linter no
  // distingue un `setState` que sigue a un `await` de uno sincrono, y aqui
  // todos ocurren cuando responde el servidor.
  const attachedRef = useRef(false);
  useEffect(() => {
    if (!jobModule || attachedRef.current) return;
    attachedRef.current = true;

    void jobsApi.active(jobModule)
      .catch(() => null)
      .then((running) => {
        if (!running) return;

        setJob(running);
        setIsAttached(true);
        return followJob(running, onJobUpdate)
          .then((done) => setValidation({ type: 'success', text: done.message }))
          .catch((error: unknown) => setValidation({
            type: 'error',
            text: error instanceof Error ? error.message : errorMessage,
          }))
          .finally(() => setIsAttached(false));
      });
  }, [jobModule, errorMessage, onJobUpdate]);

  // `isPending` sigue gobernando el log y la barra -lo que hay que mirar
  // mientras calcula- pero ya no bloquea el boton: se pueden encolar varios
  // analisis seguidos y el worker los va tomando. Repetir el mismo periodo no
  // duplica nada: el servidor responde 409 y el cliente se engancha al que ya
  // estaba, en vez de lanzar otro.
  const isPending = analysis.isPending || isAttached;
  const progress = job?.progress;
  const hasProgress = isPending && !!progress && progress.total > 1;
  // Mientras corre manda el log del job; al terminar, el que devolvio la accion.
  // En un lote, el del mes elegido o, si no se eligió ninguno, el que calcula
  // ahora (o el último que terminó).
  const inBatch = mode === 'varios' && batch !== null;
  const batchJob = inBatch
    ? (batch.find((j) => j.id === watching)
      ?? batch.find((j) => j.status === 'running')
      ?? [...batch].reverse().find((j) => j.status !== 'pending')
      ?? null)
    : null;
  const batchProgress = batchJob?.status === 'running' && batchJob.progress.total > 1 ? batchJob.progress : null;
  const log = inBatch
    ? (batchJob?.log_output || batchJob?.message || '')
    : isPending ? (job?.log_output || analysis.log) : analysis.log;

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {onRunBatch && (
            <ToggleGroup
              options={[
                { key: 'uno', label: 'Un mes', icon: CalendarDays },
                { key: 'varios', label: 'Varios meses', icon: CalendarRange },
              ]}
              activeKey={mode}
              onChange={(key) => {
                setMode(key as 'uno' | 'varios');
                setValidation(null);
              }}
            />
          )}
          {mode === 'varios' && onRunBatch ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <MonthPicker value={from} onChange={setFrom} placeholder="Desde..." />
              <MonthPicker value={until} onChange={setUntil} placeholder="Hasta..." />
              <Button
                onClick={handleRunBatch}
                isLoading={sending}
                disabled={sending || activeBatch || batchMonths.length === 0}
                icon={<Play className="h-4 w-4 fill-current" />}
              >
                {batchMonths.length > 1 ? `Analizar ${batchMonths.length} meses` : runLabel}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <MonthPicker value={selectedMonth} onChange={setSelectedMonth} placeholder={monthPlaceholder} />
              <Button
                onClick={handleRun}
                isLoading={sending}
                disabled={sending || (requireMonth && !selectedMonth)}
                icon={<Play className="h-4 w-4 fill-current" />}
              >
                {runLabel}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <StatusMessage status={validation ?? analysis.status} className="mb-4" />
      {inBatch && <MonthBatch jobs={batch} selected={batchJob?.id ?? null} onSelect={setWatching} />}
      {batchProgress && batchJob && (
        <div className="mb-4">
          <ProgressBar
            label={`${batchJob.period} · ${batchProgress.label || 'Calculando...'}`}
            percent={(batchProgress.done / batchProgress.total) * 100}
            valueLabel={`${batchProgress.done} / ${batchProgress.total}`}
          />
        </div>
      )}
      {!inBatch && hasProgress && (
        <div className="mb-4">
          <ProgressBar
            label={progress.label || 'Calculando...'}
            percent={(progress.done / progress.total) * 100}
            valueLabel={`${progress.done} / ${progress.total}`}
          />
        </div>
      )}
      <ConsoleOutput title={consoleTitle} output={log} />
    </Panel>
  );
}
