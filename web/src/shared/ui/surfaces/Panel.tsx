import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface PanelProps {
  /** Optional heading. Without it the panel is a bare framed box. */
  title?: string;
  /** Supporting line under the title. */
  description?: string;
  /** Right-aligned header slot — filters, a period picker, a submit button. */
  actions?: ReactNode;
  children: ReactNode;
  /** Vertically distributes children, for panels ending in a pinned footer. */
  stretch?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * The plain framed content box: `surface-secondary` on a slate border.
 *
 * Distinct from `NeonContainer`, which is the accent-themed, gradient card used
 * for dashboards. Use `Panel` for forms, specs and neutral content — the markup
 * that was previously repeated as a raw `<div>` on twelve occasions.
 */
export function Panel({
  title,
  description,
  actions,
  children,
  stretch = false,
  className,
  bodyClassName,
}: PanelProps) {
  const hasHeader = Boolean(title || actions);

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-800 bg-surface-secondary p-4 shadow-xl sm:p-6',
        stretch && 'flex flex-col justify-between',
        className,
      )}
    >
      {hasHeader && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-white">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
