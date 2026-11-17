/** Las piezas de la edición de condiciones: una casilla numérica, lo que valía antes y el error de una fila. */

import type { ReactNode } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

/**
 * Un número en una celda de tabla. Vacía devuelve nulo: quien la usa decide si
 * eso es «sin inicio» (un tramo de crecimiento) o una casilla por llenar (`NaN`),
 * que la validación marca en vez de convertirla en un 0 silencioso.
 */
export function CeldaNumero({
  value, onChange, label, cambiado = false, error = false, min, placeholder,
}: {
  value: number | null;
  onChange: (valor: number | null) => void;
  label: string;
  cambiado?: boolean;
  error?: boolean;
  min?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      step="any"
      min={min}
      aria-label={label}
      aria-invalid={error || undefined}
      placeholder={placeholder}
      className={cn(
        'h-9 w-24 rounded-lg border border-slate-700 bg-surface-tertiary px-2 text-right font-mono text-xs tabular-nums text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand',
        cambiado && 'border-amber-500/70 bg-amber-500/10 font-bold',
        error && 'border-rose-500/70 bg-rose-500/10',
      )}
      value={value === null || Number.isNaN(value) ? '' : value}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  );
}

/** Lo que valía un campo editado, debajo de él. */
export function Antes({ valor }: { valor: string | null }) {
  if (valor === null) return null;
  return <span className="mt-1 block text-[10px] font-semibold text-amber-400">antes {valor}</span>;
}

export function ErrorFila({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export function BotonQuitar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} className="rounded p-2 text-rose-400 hover:bg-rose-500/10" onClick={onClick}>
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

/** Una aclaración corta con su icono, en una caja hundida. */
export function Nota({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-slate-800 bg-slate-950/30 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
      <span className="mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

export const CABECERA = 'text-[10px] font-black uppercase tracking-wider text-slate-500';
