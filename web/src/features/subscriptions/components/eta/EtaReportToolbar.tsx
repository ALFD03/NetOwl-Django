import { Link } from '@inertiajs/react';
import { Calendar, Loader2, Lock, Settings, Unlock } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { PeriodSelector } from '@/shared/ui';

interface EtaReportToolbarProps {
  period: string;
  periods: string[];
  onPeriodChange: (period: string) => void;
  /** Only shown once a report has been successfully computed. */
  showLockToggle: boolean;
  isLocked: boolean;
  isSaving: boolean;
  onToggleLock: () => void;
}

export function EtaReportToolbar({
  period,
  periods,
  onPeriodChange,
  showLockToggle,
  isLocked,
  isSaving,
  onToggleLock,
}: EtaReportToolbarProps) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <PeriodSelector
          label="Mes Reporte"
          icon={<Calendar className="h-4 w-4 text-brand" />}
          value={period}
          options={periods}
          onChange={onPeriodChange}
        />

        <Link
          href={`/subscriptions/eta-report/config/?period=${period}`}
          className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-300 shadow-lg transition-all hover:bg-slate-700"
        >
          <Settings className="h-4 w-4 text-brand" /> Gestionar Maestro
        </Link>
      </div>

      {showLockToggle && (
        <button
          type="button"
          onClick={onToggleLock}
          disabled={isSaving}
          className={cn(
            'flex items-center gap-2 rounded-2xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-xl transition-all',
            isLocked
              ? 'border border-rose-500/30 bg-rose-500/20 text-rose-400'
              : 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-400',
          )}
        >
          {isSaving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          {isLocked ? 'Reporte Bloqueado' : 'Cerrar y Bloquear Mes'}
        </button>
      )}
    </div>
  );
}
