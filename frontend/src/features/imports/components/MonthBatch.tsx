/**
 * El estado de un lote de análisis: una pastilla por mes con cómo va.
 *
 * Cada mes es un job propio (`jobs._lanzar_lote`), así que cada uno termina,
 * falla o se cancela por su cuenta. Cancelar uno se hace desde el aviso
 * flotante, como siempre.
 */

import { CheckCircle2, Clock, Loader2, XCircle, Ban } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import type { AnalysisJob, JobStatus } from '@/shared/lib/api/jobs';
import { formatPeriodLabel } from '@/shared/utils/formatters';

/** Los meses de `desde` a `hasta`, ambos incluidos y en orden, sea cual sea el que se eligió primero. */
export function monthsBetween(from: string, until: string): string[] {
  if (!from || !until) return [];
  const [start, end] = from <= until ? [from, until] : [until, from];
  const months: string[] = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  for (let guard = 0; guard < 600; guard += 1) {
    const current = `${year}-${String(month).padStart(2, '0')}`;
    if (current > end) break;
    months.push(current);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

const STATE: Record<JobStatus, { icon: typeof Clock; tone: string; text: string }> = {
  pending: { icon: Clock, tone: 'border-slate-700 bg-slate-800/40 text-slate-300', text: 'En cola' },
  running: { icon: Loader2, tone: 'border-sky-500/50 bg-sky-500/15 text-sky-200', text: 'Calculando' },
  success: { icon: CheckCircle2, tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', text: 'Listo' },
  error: { icon: XCircle, tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300', text: 'Error' },
  cancelled: { icon: Ban, tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300', text: 'Cancelado' },
};

export function MonthBatch({
  jobs,
  selected,
  onSelect,
}: {
  jobs: AnalysisJob[];
  /** El job cuya consola se está mirando. */
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const finishedCount = jobs.filter((j) => j.status !== 'pending' && j.status !== 'running').length;
  return (
    <div className="mb-4 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Lote · {finishedCount} de {jobs.length} terminados
      </div>
      <div className="flex flex-wrap gap-2">
        {jobs.map((job) => {
          const state = STATE[job.status];
          const IconComponent = state.icon;
          const pct = job.status === 'running' && job.progress.total > 1
            ? Math.round((job.progress.done / job.progress.total) * 100)
            : null;
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelect(job.id)}
              title={job.message || state.text}
              aria-pressed={selected === job.id}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                state.tone,
                selected === job.id && 'ring-2 ring-white/40',
              )}
            >
              <IconComponent className={cn('h-3.5 w-3.5', job.status === 'running' && 'animate-spin')} />
              {formatPeriodLabel(job.period)}
              <span className="font-normal opacity-75">{pct === null ? state.text : `${pct}%`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
