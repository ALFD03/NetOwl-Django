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
import { formatPeriodoLabel } from '@/shared/utils/formatters';

/** Los meses de `desde` a `hasta`, ambos incluidos y en orden, sea cual sea el que se eligió primero. */
export function mesesEntre(desde: string, hasta: string): string[] {
  if (!desde || !hasta) return [];
  const [inicio, fin] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const meses: string[] = [];
  let anio = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(5, 7));
  for (let guarda = 0; guarda < 600; guarda += 1) {
    const actual = `${anio}-${String(mes).padStart(2, '0')}`;
    if (actual > fin) break;
    meses.push(actual);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

const ESTADO: Record<JobStatus, { icon: typeof Clock; clase: string; texto: string }> = {
  pending: { icon: Clock, clase: 'border-slate-700 bg-slate-800/40 text-slate-300', texto: 'En cola' },
  running: { icon: Loader2, clase: 'border-sky-500/50 bg-sky-500/15 text-sky-200', texto: 'Calculando' },
  success: { icon: CheckCircle2, clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', texto: 'Listo' },
  error: { icon: XCircle, clase: 'border-rose-500/40 bg-rose-500/10 text-rose-300', texto: 'Error' },
  cancelled: { icon: Ban, clase: 'border-amber-500/40 bg-amber-500/10 text-amber-300', texto: 'Cancelado' },
};

export function LoteMeses({
  jobs,
  seleccionado,
  onSeleccionar,
}: {
  jobs: AnalysisJob[];
  /** El job cuya consola se está mirando. */
  seleccionado: string | null;
  onSeleccionar: (id: string) => void;
}) {
  const terminados = jobs.filter((j) => j.status !== 'pending' && j.status !== 'running').length;
  return (
    <div className="mb-4 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Lote · {terminados} de {jobs.length} terminados
      </div>
      <div className="flex flex-wrap gap-2">
        {jobs.map((job) => {
          const estado = ESTADO[job.status];
          const Icono = estado.icon;
          const pct = job.status === 'running' && job.progress.total > 1
            ? Math.round((job.progress.done / job.progress.total) * 100)
            : null;
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => onSeleccionar(job.id)}
              title={job.message || estado.texto}
              aria-pressed={seleccionado === job.id}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                estado.clase,
                seleccionado === job.id && 'ring-2 ring-white/40',
              )}
            >
              <Icono className={cn('h-3.5 w-3.5', job.status === 'running' && 'animate-spin')} />
              {formatPeriodoLabel(job.periodo)}
              <span className="font-normal opacity-75">{pct === null ? estado.texto : `${pct}%`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
