import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface StickyLabelProps {
  children: ReactNode;
  /** Reserved width, so the pinned column does not jitter as rows scroll past. */
  minWidth?: string;
  className?: string;
}

/**
 * First cell of a wide, horizontally scrolling table: the row's identity.
 *
 * Lo que la fija al borde es la columna (`sticky: true` en su `Column`), no
 * este span: un `sticky` dentro de un `<td>` no puede salir de su celda, así
 * que se iba con ella al deslizar — que es justo lo que se hace en un teléfono.
 * Este componente pone el ancho reservado y el estilo.
 */
export function StickyLabel({ children, minWidth = '160px', className }: StickyLabelProps) {
  return (
    <span
      className={cn('block pr-4 font-bold text-white', className)}
      style={{ minWidth }}
    >
      {children}
    </span>
  );
}
