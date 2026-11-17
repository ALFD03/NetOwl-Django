/** Las piezas que repiten los cinco modales de la pantalla de permisos. */

import type { ReactNode } from 'react';

import { SelectMenu } from '@/shared/ui';
import type { SelectOption } from '@/shared/ui';

interface CampoSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Segunda línea bajo el control, para explicar qué implica elegirlo. */
  hint?: ReactNode;
}

/**
 * Un `SelectMenu` con su etiqueta encima, al mismo ritmo visual que `TextField`.
 *
 * El control es el del kit y no un `<select>` nativo: dentro del modal, que
 * framer-motion anima con `scale`, el menu nativo salia desplazado y se cerraba
 * solo en cuanto algo reajustaba el layout.
 */
export function CampoSelect({ label, value, options, onChange, hint }: CampoSelectProps) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-300">{label}</span>
      <SelectMenu
        aria-label={label}
        value={value}
        options={options}
        onChange={onChange}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700 bg-surface-tertiary px-4 py-2 text-left text-xs text-white"
      />
      {hint && <p className="mt-1 text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

interface PieDeModalProps {
  onCancel: () => void;
  /** Lo que se lee a la izquierda: el estado del formulario, no una instrucción. */
  nota?: ReactNode;
  children: ReactNode;
}

/** La barra de acciones al pie de un modal: la nota a la izquierda, los botones a la derecha. */
export function PieDeModal({ onCancel, nota, children }: PieDeModalProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
      <p className="text-[11px] text-slate-500">{nota}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:text-white"
        >
          Cancelar
        </button>
        {children}
      </div>
    </div>
  );
}
