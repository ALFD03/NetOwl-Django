/** Lista de casillas para elegir varias filas de un catálogo (zonas, equipos, unidades). */

import { useState } from 'react';

import { Field } from '@/features/subscriptions/components/FormControls';
import { modalInputClass } from '@/features/subscriptions/lib/formClasses';

/**
 * Una lista de casillas con buscador, para elegir varias zonas, equipos o
 * unidades de una vez. `detalle` aclara de qué otro grupo viene hoy cada una.
 */
export function CheckboxList({
  label,
  hint,
  options,
  selection,
  onChange,
  searchable: searchable = true,
}: {
  label: string;
  hint?: string;
  options: { id: number; name: string; detail?: string }[];
  selection: number[];
  onChange: (ids: number[]) => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState('');
  const visible = options.filter((other) =>
    `${other.name} ${other.detail ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (id: number) =>
    onChange(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);

  return (
    <Field label={`${label} (${selection.length})`} hint={hint}>
      {searchable && options.length > 6 && (
        <input
          type="text"
          className={`${modalInputClass} mb-2`}
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-700 bg-surface-tertiary p-2">
        {visible.length === 0 && <p className="p-2 text-xs text-slate-500">Nada que mostrar.</p>}
        {visible.map((other) => (
          <label
            key={other.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={selection.includes(other.id)}
              onChange={() => toggle(other.id)}
            />
            <span className="flex-1">{other.name}</span>
            {other.detail && <span className="text-[10px] text-slate-500">{other.detail}</span>}
          </label>
        ))}
      </div>
    </Field>
  );
}
