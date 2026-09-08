import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface Milestone {
  id: string;
  label: string;
  value: ReactNode;
  /** Unit rendered small next to the value, e.g. "días". */
  unit?: string;
  /** Tailwind background for the marker, e.g. `bg-emerald-500`. */
  markerClass?: string;
}

export interface MilestoneTimelineProps {
  milestones: Milestone[];
  className?: string;
}

/**
 * Vertical rail of labelled checkpoints.
 *
 * Built for the Lifetime desertion timeline, but carries no domain knowledge —
 * any ordered set of "at this point, this value" markers fits.
 */
export function MilestoneTimeline({ milestones, className }: MilestoneTimelineProps) {
  return (
    <div className={cn('relative my-4 flex-1 space-y-8', className)}>
      <div className="absolute bottom-2 left-[11px] top-2 w-0.5 bg-slate-800" aria-hidden />
      {milestones.map((milestone) => (
        <div key={milestone.id} className="relative pl-10">
          <div
            className={cn(
              'absolute left-0 top-1 z-10 h-6 w-6 rounded-full border-4 border-surface-primary',
              milestone.markerClass ?? 'bg-brand',
            )}
            aria-hidden
          />
          <p className="text-[10px] font-bold uppercase text-slate-400">{milestone.label}</p>
          <p className="text-xl font-black text-white">
            {milestone.value}
            {milestone.unit && (
              <span className="ml-1 text-xs font-normal text-slate-400">{milestone.unit}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
