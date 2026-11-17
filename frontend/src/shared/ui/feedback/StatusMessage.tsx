import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

export interface StatusMessageProps {
  /** Nothing renders when null, so callers can pass state straight through. */
  status: { type: StatusTone; text: string } | null;
  /** Small icon rendered before the text. */
  icon?: ReactNode;
  className?: string;
}

const TONES: Record<StatusTone, string> = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  error: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  info: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
};

/**
 * Inline result banner for a form or a long-running action.
 *
 * Promoted out of `pages/Imports` — the same markup was also inlined verbatim
 * in `Imports/Crm.tsx` twice.
 */
export function StatusMessage({ status, icon, className }: StatusMessageProps) {
  if (!status) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold',
        TONES[status.type],
        className,
      )}
    >
      {icon && <span className="flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span>{status.text}</span>
    </div>
  );
}
