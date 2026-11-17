import { Loader2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

export interface LoadingStateProps {
  /** Shown under the spinner; keep it specific about what is being computed. */
  message?: string;
  className?: string;
}

/** Centred spinner for a region that is still resolving. */
export function LoadingState({ message, className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-20 text-center', className)} role="status">
      <Loader2 className="mb-4 h-12 w-12 animate-spin text-brand" />
      {message && (
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{message}</p>
      )}
    </div>
  );
}
