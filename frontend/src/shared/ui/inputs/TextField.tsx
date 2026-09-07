import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Small icon rendered inside the field, on the leading edge. */
  icon?: ReactNode;
  /** Field-level error; renders under the input and reddens the border. */
  error?: string;
  containerClassName?: string;
  /** Muestra el boton de ojo para revelar la contraseña (solo aplica a type="password"). */
  revealable?: boolean;
}

/** Labelled text input with an optional leading icon. */
export function TextField({
  label,
  icon,
  error,
  className,
  containerClassName,
  id,
  type = 'text',
  revealable = true,
  ...props
}: TextFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const [revealed, setRevealed] = useState(false);
  // Solo los campos de contraseña pueden alternar su visibilidad.
  const canReveal = type === 'password' && revealable;
  const inputType = canReveal && revealed ? 'text' : type;

  return (
    <div className={containerClassName}>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-slate-300">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          type={inputType}
          className={cn(
            'w-full rounded-lg border border-slate-700 bg-surface-tertiary py-2 text-xs text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
            icon ? 'pl-9' : 'pl-4',
            canReveal ? 'pr-10' : 'pr-4',
            error && 'border-rose-500/60',
            className,
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {canReveal && (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand [&>svg]:h-4 [&>svg]:w-4"
            aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={revealed}
            tabIndex={-1}
          >
            {revealed ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
