import { useCallback, useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

import { useAsyncAction, type ActionStatus } from '@/shared/hooks/useAsyncAction';
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

  const analysis = useAsyncAction(onRun, {
    successMessage: (result) => successMessage(result, selectedMonth),
    errorMessage,
    readLog: (result) => result.log_output ?? result.message,
    pendingLog: pendingLog?.(selectedMonth),
  });

  const handleRun = async () => {
    if (requireMonth && !selectedMonth) {
      setValidation({ type: 'error', text: missingMonthMessage });
      return;
    }
    setValidation(null);
    setJob(null);
    await analysis.run(selectedMonth || null, setJob);
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
      const done = await followJob(running, setJob);
      setValidation({ type: 'success', text: done.message });
    } catch (error) {
      setValidation({
        type: 'error',
        text: error instanceof Error ? error.message : errorMessage,
      });
    } finally {
      setIsAttached(false);
    }
  }, [jobModule, errorMessage]);

  useEffect(() => {
    void attach();
  }, [attach]);

  const isPending = analysis.isPending || isAttached;
  const progress = job?.progress;
  const hasProgress = isPending && !!progress && progress.total > 1;
  // Mientras corre manda el log del job; al terminar, el que devolvio la accion.
  const log = isPending ? (job?.log_output || analysis.log) : analysis.log;

  return (
    <Panel
      title={title}
      description={description}
      actions={
        <>
          <MonthPicker value={selectedMonth} onChange={setSelectedMonth} placeholder={monthPlaceholder} />
          <Button
            onClick={handleRun}
            isLoading={isPending}
            disabled={isPending || (requireMonth && !selectedMonth)}
            icon={<Play className="h-4 w-4 fill-current" />}
          >
            {runLabel}
          </Button>
        </>
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
