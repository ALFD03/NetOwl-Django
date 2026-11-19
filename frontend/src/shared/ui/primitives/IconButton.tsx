/** Botón de solo icono, para las acciones de una fila o tarjeta (subir, editar, borrar…). */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  /** Lo que hace: es el `aria-label` y el `title`. */
  label: string;
  /** `danger` se enrojece al pasar por encima: para borrar. */
  tone?: 'default' | 'danger';
  size?: 'sm' | 'md';
}

export function IconButton({ icon, label, tone = 'default', size = 'md', className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
        size === 'sm' ? '[&>svg]:h-3.5 [&>svg]:w-3.5' : '[&>svg]:h-4 [&>svg]:w-4',
        tone === 'danger' && 'hover:text-rose-400',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
