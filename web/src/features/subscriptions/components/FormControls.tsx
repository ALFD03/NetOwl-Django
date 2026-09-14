import type { FormEvent, ReactNode } from 'react';
import { CheckCircle2, Save } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { modalLabelClass } from '@/features/subscriptions/lib/formClasses';

/**
 * Piezas de los formularios de configuración del módulo.
 *
 * El maestro ETA ya había fijado el lenguaje visual: una franja con un
 * interruptor arriba, tarjetas de opción con icono y marca de selección en
 * lugar de desplegables, y un pie separado por un borde. Estaba escrito a mano
 * cuatro veces dentro de `etamanagement/Forms.tsx`, así que la pantalla de
 * catálogos habría sido la quinta copia —y la que se desviaría en cuanto
 * alguien tocara una sola de ellas—.
 *
 * No están en `shared/ui` porque su vocabulario es el de estas pantallas
 * (clasificar algo eligiendo entre pocas alternativas excluyentes); lo
 * genérico que usan por dentro —`Modal`, `SelectMenu`— sí viene de allí.
 */

export type FormTone = 'blue' | 'emerald' | 'amber' | 'sky' | 'purple' | 'slate';

/**
 * Tailwind no ve los nombres de clase interpolados, así que cada tono se
 * escribe entero. Es la misma razón por la que `SummaryStrip` tiene su mapa
 * `COLUMNS`.
 */
const TONES: Record<FormTone, { activa: string; acento: string }> = {
  blue: {
    activa: 'bg-blue-800/20 border-blue-800 ring-1 ring-blue-800 shadow-lg shadow-blue-800/10',
    acento: 'text-blue-800',
  },
  emerald: {
    activa: 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500 shadow-lg shadow-emerald-500/10',
    acento: 'text-emerald-400',
  },
  amber: {
    activa: 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500 shadow-lg shadow-amber-500/10',
    acento: 'text-amber-400',
  },
  sky: {
    activa: 'bg-sky-500/15 border-sky-500 ring-1 ring-sky-500 shadow-lg shadow-sky-500/10',
    acento: 'text-sky-500',
  },
  purple: {
    activa: 'bg-purple-500/15 border-purple-500 ring-1 ring-purple-500 shadow-lg shadow-purple-500/10',
    acento: 'text-purple-400',
  },
  slate: {
    activa: 'bg-slate-500/15 border-slate-500 ring-1 ring-slate-500 shadow-lg shadow-slate-500/10',
    acento: 'text-slate-300',
  },
};

const INACTIVA =
  'bg-surface-tertiary/40 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100';

export interface OptionCardProps {
  icon: ReactNode;
  title: string;
  description?: string;
  selected: boolean;
  tone?: FormTone;
  onSelect: () => void;
  className?: string;
}

/**
 * Alternativa excluyente presentada como tarjeta.
 *
 * Se usa en lugar de un desplegable cuando las opciones son pocas y la
 * diferencia entre ellas necesita una frase: en un `<select>` el usuario elige
 * un nombre a ciegas, aquí lee qué implica antes de marcarlo.
 */
export function OptionCard({
  icon,
  title,
  description,
  selected,
  tone = 'blue',
  onSelect,
  className,
}: OptionCardProps) {
  const estilo = TONES[tone];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex cursor-pointer flex-col justify-between rounded-2xl border p-4 text-left transition-all',
        selected ? estilo.activa : INACTIVA,
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={cn('[&>svg]:h-5 [&>svg]:w-5', selected ? estilo.acento : 'text-slate-400')}>
          {icon}
        </span>
        {selected && <CheckCircle2 className={cn('h-4 w-4', estilo.acento)} />}
      </div>

      <div>
        <h6 className="text-xs font-bold text-white">{title}</h6>
        {description && (
          <p className="mt-1 text-[9px] leading-tight text-slate-400">{description}</p>
        )}
      </div>
    </button>
  );
}

export interface OptionCardGroupProps {
  label: string;
  children: ReactNode;
  /** Columnas en pantalla ancha. Debe ser una clase escrita, no interpolada. */
  columns?: 'md:grid-cols-2' | 'md:grid-cols-3';
}

/** Rejilla etiquetada de `OptionCard`. */
export function OptionCardGroup({ label, children, columns = 'md:grid-cols-3' }: OptionCardGroupProps) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
      <div className={cn('grid grid-cols-1 gap-3', columns)}>{children}</div>
    </div>
  );
}

export interface FormBannerProps {
  title: string;
  description: string;
  /** Normalmente un `TogglePill`. */
  action: ReactNode;
}

/** Franja superior: qué decide este formulario, y el interruptor que lo decide. */
export function FormBanner({ title, description, action }: FormBannerProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-surface-tertiary/30 p-4">
      <div>
        <h6 className="text-xs font-bold text-white">{title}</h6>
        <p className="text-[10px] text-slate-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

export interface TogglePillProps {
  active: boolean;
  icon: ReactNode;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => void;
}

/** Interruptor de dos estados con su propia etiqueta en cada uno. */
export function TogglePill({ active, icon, activeLabel, inactiveLabel, onToggle }: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'flex flex-shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-wider transition-all',
        '[&>svg]:h-4 [&>svg]:w-4',
        active
          ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
          : 'border-slate-700 bg-slate-800 text-slate-400',
      )}
    >
      {icon}
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

export interface FieldProps {
  label: string;
  children: ReactNode;
  /** Frase bajo el campo: para qué sirve o qué pasa si se deja vacío. */
  hint?: string;
  action?: ReactNode;
}

/** Etiqueta + control + explicación opcional. */
export function Field({ label, children, hint, action }: FieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className={modalLabelClass}>{label}</label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[10px] leading-tight text-slate-500">{hint}</p>}
    </div>
  );
}

/** Las dos columnas de datos, separadas de lo de arriba por un borde. */
export function FormColumns({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-slate-800 pt-2 md:grid-cols-2">
      {children}
    </div>
  );
}

export interface FormFooterProps {
  saving: boolean;
  onClose: () => void;
  submitLabel: string;
  savingLabel?: string;
}

export function FormFooter({
  saving,
  onClose,
  submitLabel,
  savingLabel = 'Guardando...',
}: FormFooterProps) {
  return (
    <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl bg-slate-800 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-700"
      >
        Cancelar
      </button>

      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-brand px-8 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-brand/20 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? savingLabel : submitLabel}
      </button>
    </div>
  );
}

/** Envoltorio común: separa las secciones igual en todos los formularios. */
export function ModalForm({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {children}
    </form>
  );
}
