/**
 * Aviso flotante de lo que el worker está calculando y lo que espera turno.
 *
 * Vive en `shared/layout` y no en `features/imports` porque lo monta `AppLayout`,
 * y `shared` no puede importar de un feature. No pinta nada si la cola está vacía.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, Clock, Loader2, X, XCircle } from 'lucide-react';

import { useJobQueue } from '@/shared/hooks/useJobQueue';
import { cn } from '@/shared/lib/cn';
import type { AnalysisJob } from '@/shared/lib/api/jobs';
import { METRIC_BAR, METRIC_TEXT, PulseDot } from '@/shared/ui';

/** Porcentaje calculado del job, o null si el análisis no reporta pasos. */
function percentage(job: AnalysisJob): number | null {
  const { done, total } = job.progress;
  if (!total || total <= 1) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

function subtitle(job: AnalysisJob): string {
  return job.period ? `${job.module_display} · ${job.period}` : job.module_display;
}

interface CancelAction {
  onCancel: (id: string) => void;
  cancelling: boolean;
}

/**
 * Botón de parar de una fila.
 *
 * Cancelar no mata el proceso: cierra la fila del job y el análisis se detiene en
 * su siguiente punto de control, a lo sumo un par de segundos después. Mientras
 * tanto el botón queda marcado, porque el sondeo tarda en reflejarlo y si no
 * parecería que el clic no hizo nada.
 */
function CancelButton({ job, onCancel, cancelling }: { job: AnalysisJob } & CancelAction) {
  return (
    <button
      type="button"
      onClick={() => onCancel(job.id)}
      disabled={cancelling}
      title={cancelling ? 'Cancelando...' : 'Cancelar este análisis'}
      aria-label={`Cancelar ${subtitle(job)}`}
      className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Ban className="h-3.5 w-3.5" />
    </button>
  );
}

function RunningRow({ job, onCancel, cancelling }: { job: AnalysisJob } & CancelAction) {
  const pct = percentage(job);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <PulseDot color="blue" />
        <span className="flex-1 truncate text-xs font-semibold text-white">{subtitle(job)}</span>
        <CancelButton job={job} onCancel={onCancel} cancelling={cancelling} />
      </div>

      <p className="mt-1 truncate text-[11px] text-slate-400">
        {cancelling ? 'Deteniendo en el próximo punto de control...' : (job.progress.label || 'Preparando el cálculo...')}
      </p>

      {pct !== null && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className={cn('h-full rounded-full', METRIC_BAR.blue)}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500">
            <span>{job.progress.done} de {job.progress.total}</span>
            <span className={METRIC_TEXT.blue}>{pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function WaitingRow({ job, onCancel, cancelling }: { job: AnalysisJob } & CancelAction) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="flex-1 truncate text-[11px] text-slate-400">{subtitle(job)}</span>
      <CancelButton job={job} onCancel={onCancel} cancelling={cancelling} />
    </div>
  );
}

/** Los tres desenlaces posibles. Cancelado no es un fallo y no se pinta como tal. */
const OUTCOMES = {
  success: { icon: CheckCircle2, tone: METRIC_TEXT.green, title: 'Análisis completado' },
  cancelled: { icon: XCircle, tone: METRIC_TEXT.yellow, title: 'Análisis cancelado' },
  error: { icon: AlertTriangle, tone: METRIC_TEXT.red, title: 'El análisis falló' },
} as const;

function FinalNotice({ job, onClose }: { job: AnalysisJob; onClose: () => void }) {
  const outcome =
    job.status === 'success' ? OUTCOMES.success
    : job.status === 'cancelled' ? OUTCOMES.cancelled
    : OUTCOMES.error;
  const Icon = outcome.icon;

  return (
    <div className="flex items-start gap-2 px-4 py-3">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', outcome.tone)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-semibold', outcome.tone)}>
          {outcome.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
          {job.message || subtitle(job)}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:text-slate-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Aviso flotante con el estado de los análisis del worker.
 *
 * Desde que los cálculos salieron de la petición, un análisis sobrevive a la
 * página que lo lanzó: se puede cerrar la pestaña de importaciones y seguir
 * navegando mientras el worker calcula. Este aviso es lo que hace visible ese
 * trabajo desde cualquier pantalla — qué se está calculando, por dónde va y
 * cuántos esperan turno — en vez de tener que volver a la pantalla de origen
 * para saber si sigue vivo.
 *
 * No se renderiza nada cuando no hay nada que contar.
 */
export function AnalysisQueueAlert() {
  const { jobs, running, queued, finished, dismissFinished, cancel, cancelling } = useJobQueue();
  const [isOpen, setOpen] = useState(true);

  const hasWork = jobs.length > 0;
  if (!hasWork && !finished) return null;

  const runningJobs = jobs.filter((job) => job.status === 'running');
  const waitingJobs = jobs.filter((job) => job.status !== 'running');

  return (
    // En el teléfono ocupa el ancho de abajo; desde `sm`, la esquina.
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80">
      <AnimatePresence>
        <motion.div
          key="cola"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="pointer-events-auto overflow-hidden rounded-xl border border-slate-700 bg-surface-secondary shadow-2xl shadow-black/50"
        >
          {hasWork && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center gap-2 border-b border-slate-800 bg-surface-tertiary px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
            >
              <Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', METRIC_TEXT.blue)} />
              <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                {running > 0 ? 'Calculando' : 'En cola'}
                {queued > 0 && (
                  <span className="ml-1 font-semibold normal-case tracking-normal text-slate-500">
                    · {queued} esperando
                  </span>
                )}
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-slate-500 transition-transform',
                  !isOpen && '-rotate-90',
                )}
              />
            </button>
          )}

          {hasWork && isOpen && (
            <div className="divide-y divide-slate-800">
              {runningJobs.map((job) => (
                <RunningRow
                  key={job.id}
                  job={job}
                  onCancel={cancel}
                  cancelling={cancelling.includes(job.id)}
                />
              ))}
              {waitingJobs.map((job) => (
                <WaitingRow
                  key={job.id}
                  job={job}
                  onCancel={cancel}
                  cancelling={cancelling.includes(job.id)}
                />
              ))}
            </div>
          )}

          {finished && (
            <div className={cn(hasWork && 'border-t border-slate-800')}>
              <FinalNotice job={finished} onClose={dismissFinished} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
