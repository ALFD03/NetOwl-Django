/**
 * Aviso flotante de lo que el worker está calculando y lo que espera turno.
 *
 * Vive en `shared/layout` y no en `features/imports` porque lo monta `AppLayout`,
 * y `shared` no puede importar de un feature. No pinta nada si la cola está vacía.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, X } from 'lucide-react';

import { useJobQueue } from '@/shared/hooks/useJobQueue';
import { cn } from '@/shared/lib/cn';
import type { AnalysisJob } from '@/shared/lib/api/jobs';
import { METRIC_BAR, METRIC_TEXT, PulseDot } from '@/shared/ui';

/** Porcentaje calculado del job, o null si el análisis no reporta pasos. */
function porcentaje(job: AnalysisJob): number | null {
  const { done, total } = job.progress;
  if (!total || total <= 1) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

function subtitulo(job: AnalysisJob): string {
  return job.periodo ? `${job.module_display} · ${job.periodo}` : job.module_display;
}

function FilaEnCurso({ job }: { job: AnalysisJob }) {
  const pct = porcentaje(job);

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <PulseDot color="blue" />
        <span className="truncate text-xs font-semibold text-white">{subtitulo(job)}</span>
      </div>

      <p className="mt-1 truncate text-[11px] text-slate-400">
        {job.progress.label || 'Preparando el cálculo...'}
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

function FilaEnEspera({ job }: { job: AnalysisJob }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <Clock className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="truncate text-[11px] text-slate-400">{subtitulo(job)}</span>
    </div>
  );
}

function AvisoFinal({ job, onClose }: { job: AnalysisJob; onClose: () => void }) {
  const ok = job.status === 'success';

  return (
    <div className="flex items-start gap-2 px-4 py-3">
      {ok ? (
        <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', METRIC_TEXT.green)} />
      ) : (
        <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', METRIC_TEXT.red)} />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-semibold', ok ? METRIC_TEXT.green : METRIC_TEXT.red)}>
          {ok ? 'Análisis completado' : 'El análisis falló'}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
          {job.message || subtitulo(job)}
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
  const { jobs, running, queued, finished, dismissFinished } = useJobQueue();
  const [abierto, setAbierto] = useState(true);

  const hayTrabajo = jobs.length > 0;
  if (!hayTrabajo && !finished) return null;

  const enCurso = jobs.filter((job) => job.status === 'running');
  const enEspera = jobs.filter((job) => job.status !== 'running');

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 w-80 max-w-[calc(100vw-3rem)]">
      <AnimatePresence>
        <motion.div
          key="cola"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="pointer-events-auto overflow-hidden rounded-xl border border-slate-700 bg-surface-secondary shadow-2xl shadow-black/50"
        >
          {hayTrabajo && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
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
                  !abierto && '-rotate-90',
                )}
              />
            </button>
          )}

          {hayTrabajo && abierto && (
            <div className="divide-y divide-slate-800">
              {enCurso.map((job) => (
                <FilaEnCurso key={job.id} job={job} />
              ))}
              {enEspera.map((job) => (
                <FilaEnEspera key={job.id} job={job} />
              ))}
            </div>
          )}

          {finished && (
            <div className={cn(hayTrabajo && 'border-t border-slate-800')}>
              <AvisoFinal job={finished} onClose={dismissFinished} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
