/**
 * Tarjeta de ejecución de un análisis: mes, progreso y consola en vivo.
 *
 * El análisis corre en el worker, así que esta tarjeta sondea la fila del job; si
 * se recarga la página se reengancha al que siga abierto.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Play } from 'lucide-react';

import { useAsyncAction, type ActionStatus } from '@/shared/hooks/useAsyncAction';
import { getApiErrorMessage } from '@/shared/lib/api';
import { followJob, jobsApi, type AnalysisJob, type JobModule } from '@/shared/lib/api/jobs';
import { Button, ConsoleOutput, MonthPicker, Panel, ProgressBar, StatusMessage } from '@/shared/ui';
import type { ImportOperationResult } from '../types';

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
}: AnalysisRunnerCardProps) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const [validation, setValidation] = useState<ActionStatus | null>(null);
  // Estado vivo del job: lo que llega en cada sondeo mientras el worker calcula.
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [isAttached, setIsAttached] = useState(false);
  // Entre pedir la cancelación y que el worker llegue a su punto de control pasa
  // un momento: sin esto el botón parecería no haber hecho nada.
  const [cancelando, setCancelando] = useState(false);
  // Solo mientras se encola, no mientras se calcula: el boton vuelve a estar
  // disponible en cuanto el analisis tiene su sitio en la cola.
  const [enviando, setEnviando] = useState(false);

  const analysis = useAsyncAction(onRun, {
    successMessage: (result) => successMessage(result, selectedMonth),
    errorMessage,
    readLog: (result) => result.log_output ?? result.message,
    pendingLog: pendingLog?.(selectedMonth),
  });

  /**
   * Cada estado que llega del sondeo.
   *
   * Cancelar no es un fallo, y `useAsyncAction` solo sabe de éxito y error: el
   * desenlace se escribe aquí como aviso, y manda sobre el suyo porque
   * `validation` tiene preferencia.
   */
  const onJobUpdate = useCallback((vivo: AnalysisJob) => {
    setJob(vivo);
    if (vivo.status === 'cancelled') {
      setCancelando(false);
      setValidation({ type: 'warning', text: vivo.message || 'Análisis cancelado.' });
    }
  }, []);

  const handleCancel = async () => {
    if (!job) return;
    setCancelando(true);
    try {
      await jobsApi.cancel(job.id);
    } catch (error) {
      setCancelando(false);
      setValidation({
        type: 'error',
        text: getApiErrorMessage(error, 'No se pudo cancelar el análisis.'),
      });
    }
  };

  const handleRun = async () => {
    if (requireMonth && !selectedMonth) {
      setValidation({ type: 'error', text: missingMonthMessage });
      return;
    }
    setValidation(null);
    setJob(null);
    setCancelando(false);
    setEnviando(true);
    try {
      // El primer sondeo con el job ya creado es la senal de que esta encolado.
      await analysis.run(selectedMonth || null, (vivo) => {
        setEnviando(false);
        onJobUpdate(vivo);
      });
    } finally {
      setEnviando(false);
    }
  };

  // Reenganche: si al abrir la pagina ya hay un analisis de este modulo en
  // curso (lo lanzo otra pestana, u otro usuario), se sigue en vez de ofrecer
  // un boton que solo devolveria un 409.
  const attachedRef = useRef(false);
  const attach = useCallback(async () => {
    if (!jobModule || attachedRef.current) return;
    attachedRef.current = true;

    const running = await jobsApi.active(jobModule).catch(() => null);
    if (!running) return;

    setJob(running);
    setIsAttached(true);
    try {
      const done = await followJob(running, onJobUpdate);
      setValidation({ type: 'success', text: done.message });
    } catch (error) {
      setValidation({
        type: 'error',
        text: error instanceof Error ? error.message : errorMessage,
      });
    } finally {
      setIsAttached(false);
    }
  }, [jobModule, errorMessage, onJobUpdate]);

  useEffect(() => {
    void attach();
  }, [attach]);

  // `isPending` sigue gobernando el log y la barra -lo que hay que mirar
  // mientras calcula- pero ya no bloquea el boton: se pueden encolar varios
  // analisis seguidos y el worker los va tomando. Repetir el mismo periodo no
  // duplica nada: el servidor responde 409 y el cliente se engancha al que ya
  // estaba, en vez de lanzar otro.
  const isPending = analysis.isPending || isAttached;
  const jobAbierto = job?.status === 'pending' || job?.status === 'running';
  const progress = job?.progress;
  const hasProgress = isPending && !!progress && progress.total > 1;
  // Mientras corre manda el log del job; al terminar, el que devolvio la accion.
  const log = isPending ? (job?.log_output || analysis.log) : analysis.log;

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth} placeholder={monthPlaceholder} />
          <Button
            onClick={handleRun}
            isLoading={enviando}
            disabled={enviando || (requireMonth && !selectedMonth)}
            icon={<Play className="h-4 w-4 fill-current" />}
          >
            {runLabel}
          </Button>
          {/* Solo con una ejecución viva delante: cancelar algo terminado no
              significa nada, y el botón desaparece en cuanto se detiene. */}
          {jobAbierto && (
            <Button
              onClick={handleCancel}
              variant="danger"
              disabled={cancelando}
              icon={<Ban className="h-4 w-4" />}
            >
              {cancelando ? 'Deteniendo...' : 'Cancelar'}
            </Button>
          )}
        </div>
      }
    >
      <StatusMessage status={validation ?? analysis.status} className="mb-4" />
      {hasProgress && (
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
