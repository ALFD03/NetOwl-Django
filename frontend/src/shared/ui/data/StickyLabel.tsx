import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface StickyLabelProps {
  children: ReactNode;
  /** Reserved width, so the pinned column does not jitter as rows scroll past. */
  minWidth?: string;
  className?: string;
}

/**
 * First cell of a wide, horizontally scrolling table: stays pinned to the left
 * edge so the row keeps its identity while the measures scroll past it.
 */
export function StickyLabel({ children, minWidth = '160px', className }: StickyLabelProps) {
  return (
    <span
      className={cn('sticky left-0 z-10 block bg-surface-secondary pr-4 font-bold text-white', className)}
      style={{ minWidth }}
    >
      {children}
    </span>
  );
}
