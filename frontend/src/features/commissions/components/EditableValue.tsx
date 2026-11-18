/** Un porcentaje que se escribe en el sitio: el cumplimiento o el crecimiento del informe de comisiones. */

import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';

import { formatPctValue } from '../lib/format';

interface EditableValueProps {
  value: number | null;
  /** Lo que se ve cuando no hay valor escrito. */
  empty: string;
  /** Si el vacío es un pendiente (en ámbar) o vale otro valor (en gris). */
  pendingEmpty?: boolean;
  editable: boolean;
  onSave: (value: number | null) => void;
}

/**
 * Un porcentaje que se escribe en el sitio. Vacío lo borra: el cumplimiento
 * de una persona vuelve al calculado, y el crecimiento también.
 */
export function EditableValue({ value, empty, pendingEmpty: pendingEmpty = true, editable, onSave }: EditableValueProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value === null ? '' : String(value));

  if (!editing) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className={value === null ? (pendingEmpty ? 'text-amber-400' : 'text-slate-400') : ''}>
          {value === null ? empty : formatPctValue(value)}
        </span>
        {editable && (
          <button
            type="button"
            title="Editar"
            className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
            onClick={(e) => {
              e.stopPropagation();
              setText(value === null ? '' : String(value));
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  const save = () => {
    setEditing(false);
    const newItem = text.trim() === '' ? null : Number(text);
    if (newItem !== value && (newItem === null || Number.isFinite(newItem))) onSave(newItem);
  };

  return (
    <span className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        step="any"
        autoFocus
        className="w-20 rounded border border-slate-700 bg-surface-tertiary px-2 py-1 text-right text-xs text-white"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button type="button" title="Guardar" className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10" onClick={save}>
        <Check className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

