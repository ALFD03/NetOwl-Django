import { Terminal } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

export interface ConsoleOutputProps {
  /** Header label, e.g. "Consola de Ejecución CRM". */
  title: string;
  /** Nothing renders when null/empty, so callers can pass state straight through. */
  output: string | null | undefined;
  /** Shown instead of the output when the action produced no log. */
  emptyText?: string;
  /** Tailwind max-height for the scroll area. */
  maxHeight?: string;
  className?: string;
}

/**
 * Monospaced terminal panel for server-side execution logs.
 *
 * Promoted out of `pages/Imports`; `Imports/Crm.tsx` and `Imports/History.tsx`
 * each had their own near-identical copy of this markup.
 */
export function ConsoleOutput({
  title,
  output,
  emptyText,
  maxHeight = 'max-h-64',
  className,
}: ConsoleOutputProps) {
  const body = output || emptyText;
  if (!body) return null;

  return (
    <div
      className={cn(
        'overflow-y-auto rounded-lg border border-slate-800 bg-black/90 p-4 font-mono text-xs text-emerald-400 custom-scrollbar',
        maxHeight,
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 border-b border-slate-800 pb-2 text-slate-400">
        <Terminal className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <pre className="whitespace-pre-wrap">{body}</pre>
    </div>
  );
}
