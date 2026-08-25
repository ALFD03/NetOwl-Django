import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import type { MetricColor } from '../theme/types';

export type MetricGroupColumns = 1 | 2 | 3;

export interface MetricGroupProps {
  title: string;
  /** Small lucide icon rendered next to the title, tinted with the tone. */
  icon?: ReactNode;
  tone?: MetricColor;
  /** Grid columns for the body. Children are usually `<CompactMetric>`s. */
  columns?: MetricGroupColumns;
  children: ReactNode;
  className?: string;
}

const TONE_BORDER: Record<MetricColor, string> = {
  slate: 'border-slate-700/50',
  green: 'border-emerald-500/30',
  red: 'border-rose-500/30',
  blue: 'border-sky-500/30',
  yellow: 'border-amber-500/30',
  purple: 'border-purple-500/30',
};

const TONE_TEXT: Record<MetricColor, string> = {
  slate: 'text-slate-300',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  blue: 'text-sky-400',
  yellow: 'text-amber-400',
  purple: 'text-purple-400',
};

// Written out so Tailwind's scanner can see each class.
const COLUMNS: Record<MetricGroupColumns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

/**
 * A titled, tone-bordered cluster of compact metrics.
 *
 * This is the block that the CRM and Subscriptions period-detail modals each
 * repeated four times with only the tone, title and children changing.
 */
export function MetricGroup({
  title,
  icon,
  tone = 'blue',
  columns = 2,
  children,
  className,
}: MetricGroupProps) {
  return (
    <div
      className={cn(
        'space-y-2 rounded-3xl border bg-surface-primary p-4',
        TONE_BORDER[tone],
        className,
      )}
    >
      <div className={cn('mb-2 flex items-center gap-2 border-b border-slate-800 pb-2', TONE_TEXT[tone])}>
        {icon}
        <span className="text-[10px] font-black uppercase tracking-wider">{title}</span>
      </div>
      <div className={cn('grid gap-2', COLUMNS[columns])}>{children}</div>
    </div>
  );
}
