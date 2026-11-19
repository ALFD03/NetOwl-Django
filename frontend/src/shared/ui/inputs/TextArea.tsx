/** Texto de varias líneas con su etiqueta: la versión larga de `TextField`. */

import type { TextareaHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
  /** Enseña cuánto se lleva escrito frente a `maxLength`. */
  showCount?: boolean;
}

export function TextArea({ label, error, className, containerClassName, id, rows = 3, showCount = false, ...props }: TextAreaProps) {
  const inputId = id ?? (label ? `field-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const length = typeof props.value === 'string' ? props.value.length : 0;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={cn(
          'w-full resize-y rounded-lg border border-slate-700 bg-surface-tertiary px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-rose-500/60',
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {(error || (showCount && props.maxLength)) && (
        <div className="mt-1 flex justify-between gap-2 text-[11px]">
          <span className="text-rose-400">{error}</span>
          {showCount && props.maxLength && (
            <span className="text-slate-500">
              {length}/{props.maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
