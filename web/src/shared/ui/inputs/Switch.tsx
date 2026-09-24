/** Interruptor de encendido/apagado: un booleano que se ve como tal. */

import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import type { MetricColor } from '@/shared/ui/theme/types';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto a la derecha del interruptor. Si falta, hace falta `aria-label`. */
  label?: ReactNode;
  /** Segunda línea bajo la etiqueta, para matizar qué concede. */
  hint?: ReactNode;
  disabled?: boolean;
  /** Color del estado encendido. */
  tone?: MetricColor;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  className?: string;
}

/** El carril encendido, por tono. Escritos uno a uno: Tailwind no ve las clases construidas. */
const RAIL_ON: Record<MetricColor, string> = {
  slate: 'bg-slate-400',
  blue: 'bg-sky-500',
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
  yellow: 'bg-amber-500',
  purple: 'bg-purple-500',
};

const SIZES = {
  sm: { rail: 'h-4 w-7', knob: 'h-3 w-3', shift: 'translate-x-3' },
  md: { rail: 'h-5 w-9', knob: 'h-4 w-4', shift: 'translate-x-4' },
} as const;

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  tone = 'green',
  size = 'sm',
  className,
  ...props
}: SwitchProps) {
  const dims = SIZES[size];

  return (
    <button
      // `type="button"`: todos los consumidores lo montan dentro de un <form>,
      // y sin esto el interruptor lo enviaria.
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-all',
        checked
          ? 'border-slate-600/70 bg-white/[0.06]'
          : 'border-slate-800/80 bg-transparent',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-600 hover:bg-white/[0.08]',
        className,
      )}
    >
      <span
        className={cn(
          'relative inline-flex flex-shrink-0 items-center rounded-full transition-colors',
          dims.rail,
          checked ? RAIL_ON[tone] : 'bg-slate-700',
        )}
      >
        <span
          className={cn(
            'inline-block transform rounded-full bg-white shadow transition-transform',
            dims.knob,
            checked ? dims.shift : 'translate-x-0.5',
          )}
        />
      </span>

      {label && (
        <span className="min-w-0 flex-1">
          <span className={cn('block text-xs leading-tight', checked ? 'text-white' : 'text-slate-400')}>
            {label}
          </span>
          {hint && <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">{hint}</span>}
        </span>
      )}
    </button>
  );
}
