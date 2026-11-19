/** La barra de arriba de una página de gestión: lo que se elige a la izquierda, las acciones a la derecha. */

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface ActionBarProps {
  /** Selectores, pestañas o un texto de contexto. */
  children?: ReactNode;
  /** Botones, alineados a la derecha. */
  actions?: ReactNode;
  className?: string;
}

export function ActionBar({ children, actions, className }: ActionBarProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-surface-secondary p-4 shadow-xl',
        className,
      )}
    >
      {children && <div className="flex min-w-0 flex-wrap items-center gap-3">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
