/** Etiqueta corta en cápsula: un tipo, un estado, un conteo. */

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export type BadgeTone = 'slate' | 'blue' | 'green' | 'yellow' | 'red';

const TONES: Record<BadgeTone, string> = {
  slate: 'border-slate-600/60 text-slate-300',
  blue: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  yellow: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  red: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
