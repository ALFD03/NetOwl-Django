import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export type EmptyStateSize = 'sm' | 'md' | 'lg';
export type EmptyStateTone = 'neutral' | 'warning';

export interface EmptyStateProps {
  /** Primary line. Keep it short — it is the headline, not the explanation. */
  title: string;
  /** Optional second line explaining what would make the state non-empty. */
  description?: string;
  /** Usually a lucide icon; rendered large and dimmed above the title. */
  icon?: ReactNode;
  /** Call to action, e.g. a `<Button>` that clears the active filters. */
  action?: ReactNode;
  size?: EmptyStateSize;
  /** `warning` frames the state in amber — for a blocking condition, not just absence. */
  tone?: EmptyStateTone;
  /** Draws the placeholder frame. Off when already inside a card. */
  bordered?: boolean;
  className?: string;
}

const SIZES: Record<EmptyStateSize, { wrapper: string; title: string; icon: string }> = {
  sm: { wrapper: 'py-6 gap-1', title: 'text-[10px] italic font-medium', icon: 'w-6 h-6' },
  md: { wrapper: 'py-10 gap-2', title: 'text-sm font-bold', icon: 'w-10 h-10' },
  lg: { wrapper: 'py-20 gap-3', title: 'text-lg font-bold', icon: 'w-12 h-12' },
};

/**
 * The single "there is nothing to show" surface.
 *
 * Replaces the hand-rolled centred `<div>`s that each page wrote slightly
 * differently — inconsistent padding, colours and copy.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  size = 'md',
  tone = 'neutral',
  bordered = false,
  className,
}: EmptyStateProps) {
  const styles = SIZES[size];

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center px-4 text-center text-slate-500',
        styles.wrapper,
        bordered && 'rounded-3xl bg-surface-secondary',
        bordered && tone === 'neutral' && 'border border-dashed border-slate-800',
        bordered && tone === 'warning' && 'border border-amber-500/30 shadow-2xl',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            '[&>svg]:h-full [&>svg]:w-full',
            styles.icon,
            tone === 'warning' ? 'text-amber-400' : 'opacity-20',
          )}
        >
          {icon}
        </div>
      )}
      <p className={cn('text-slate-400', styles.title)}>{title}</p>
      {description && <p className="max-w-md text-xs text-slate-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
