/** Un porcentaje que se escribe en el sitio: el cumplimiento o el crecimiento del informe de comisiones. */

import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';

import { formatPctValue } from '../lib/format';

interface EditableValueProps {
  valor: number | null;
  /** Lo que se ve cuando no hay valor escrito. */
  vacio: string;
  /** Si el vacío es un pendiente (en ámbar) o vale otro valor (en gris). */
  pendingEmpty?: boolean;
  editable: boolean;
  onSave: (valor: number | null) => void;
}

/**
 * Un porcentaje que se escribe en el sitio. Vacío lo borra: el cumplimiento
 * de una persona vuelve al calculado, y el crecimiento también.
 */
export function EditableValue({ valor, vacio, pendingEmpty: vacioPendiente = true, editable, onSave: onGuardar }: EditableValueProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setText] = useState(valor === null ? '' : String(valor));

  if (!editando) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className={valor === null ? (vacioPendiente ? 'text-amber-400' : 'text-slate-400') : ''}>
          {valor === null ? vacio : formatPctValue(valor)}
        </span>
        {editable && (
          <button
            type="button"
            title="Editar"
            className="rounded p-1 text-sky-400 hover:bg-sky-500/10"
            onClick={(e) => {
              e.stopPropagation();
              setText(valor === null ? '' : String(valor));
              setEditando(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  const guardar = () => {
    setEditando(false);
    const newItem = texto.trim() === '' ? null : Number(texto);
    if (newItem !== valor && (newItem === null || Number.isFinite(newItem))) onGuardar(newItem);
  };

  return (
    <span className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        step="any"
        autoFocus
        className="w-20 rounded border border-slate-700 bg-surface-tertiary px-2 py-1 text-right text-xs text-white"
        value={texto}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') guardar();
          if (e.key === 'Escape') setEditando(false);
        }}
      />
      <button type="button" title="Guardar" className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10" onClick={guardar}>
        <Check className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

