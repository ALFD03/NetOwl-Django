/** Una pregunta con sus opciones, en la configuración. */

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Badge, IconButton, Panel, Switch, TextField } from '@/shared/ui';
import type { MoveDirection } from '@/shared/lib/api';

import type { SurveyOption, SurveyQuestion } from '../types';

interface Props {
  number: number;
  question: SurveyQuestion;
  /** Todas las de la encuesta, para escribir de qué depende. */
  all: SurveyQuestion[];
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: MoveDirection) => void;
  onOptionSave: (body: { id?: number; question?: number; text: string; active: boolean }) => Promise<void>;
  onOptionDelete: (o: SurveyOption) => void;
  onOptionMove: (o: SurveyOption, direction: MoveDirection) => void;
}

const KIND_LABEL: Record<SurveyQuestion['kind'], string> = {
  unica: 'Una opción',
  multiple: 'Varias opciones',
  texto: 'Texto libre',
};

export function QuestionCard({
  number,
  question: p,
  all,
  isFirst,
  isLast,
  busy,
  onEdit,
  onDelete,
  onMove,
  onOptionSave,
  onOptionDelete,
  onOptionMove,
}: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [added, setAdded] = useState('');

  const parent = all.find((x) => x.id === p.condition_question);
  const condition = parent
    ? `${p.condition_mode === 'ocultar' ? 'Se oculta' : 'Se muestra'} si «${parent.text}» = ${parent.options
        .filter((o) => p.condition_options.includes(o.id))
        .map((o) => o.text)
        .join(' / ')}`
    : null;

  const startEdit = (o: SurveyOption) => {
    setEditing(o.id);
    setDraft(o.text);
  };
  const saveEdit = async (o: SurveyOption) => {
    if (!draft.trim()) return;
    await onOptionSave({ id: o.id, text: draft, active: o.active });
    setEditing(null);
  };
  const add = async () => {
    if (!added.trim()) return;
    await onOptionSave({ question: p.id, text: added, active: true });
    setAdded('');
  };

  return (
    <Panel className={cn(!p.active && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-sm font-semibold text-slate-100">
            <span className="mr-2 font-mono text-slate-500">{number}.</span>
            {p.text}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge>{KIND_LABEL[p.kind]}</Badge>
            <Badge>{p.required ? 'Obligatoria' : 'Opcional'}</Badge>
            {!p.active && <Badge tone="yellow">Desactivada</Badge>}
            {(p.answers ?? 0) > 0 && <Badge tone="blue">{p.answers} respuestas</Badge>}
          </div>
          {condition && <p className="text-xs text-slate-400">{condition}</p>}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton icon={<ArrowUp />} label="Subir pregunta" disabled={isFirst || busy} onClick={() => onMove('up')} />
          <IconButton icon={<ArrowDown />} label="Bajar pregunta" disabled={isLast || busy} onClick={() => onMove('down')} />
          <IconButton icon={<Pencil />} label="Editar pregunta" disabled={busy} onClick={onEdit} />
          <IconButton icon={<Trash2 />} label="Eliminar pregunta" tone="danger" disabled={busy} onClick={onDelete} />
        </div>
      </div>

      {p.kind === 'texto' ? (
        <p className="mt-3 rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-500">
          Se responde escribiendo un texto: no lleva opciones.
          {p.options.length > 0 && ' Las que tenía se conservan por si vuelve a ser de opciones.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-800/60 rounded-lg border border-slate-800 bg-slate-900/30">
          {p.options.map((o, i) => (
            <li key={o.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              {editing === o.id ? (
                <>
                  <TextField
                    label="Texto de la opción"
                    hideLabel
                    autoFocus
                    value={draft}
                    maxLength={120}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(o);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    containerClassName="min-w-0 flex-1"
                    className="py-1"
                  />
                  <IconButton icon={<Check />} label="Guardar opción" size="sm" disabled={busy} onClick={() => void saveEdit(o)} />
                  <IconButton icon={<X />} label="Cancelar" size="sm" onClick={() => setEditing(null)} />
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      o.active ? 'text-slate-200' : 'text-slate-500 line-through',
                    )}
                  >
                    {o.text}
                  </span>
                  {(o.answers ?? 0) > 0 && (
                    <span className="font-mono text-[10px] text-slate-500">{o.answers}</span>
                  )}
                  <Switch
                    size="sm"
                    aria-label={o.active ? 'Desactivar opción' : 'Activar opción'}
                    // El Switch es una caja de ancho completo: en una fila con texto lo tapaba.
                    className="!w-auto shrink-0 !border-0 !bg-transparent !p-0 hover:!bg-transparent"
                    checked={o.active}
                    disabled={busy}
                    onChange={(active) => void onOptionSave({ id: o.id, text: o.text, active })}
                  />
                  <IconButton icon={<ArrowUp />} label="Subir opción" size="sm" disabled={i === 0 || busy} onClick={() => onOptionMove(o, 'up')} />
                  <IconButton
                    icon={<ArrowDown />}
                    label="Bajar opción"
                    size="sm"
                    disabled={i === p.options.length - 1 || busy}
                    onClick={() => onOptionMove(o, 'down')}
                  />
                  <IconButton icon={<Pencil />} label="Renombrar opción" size="sm" disabled={busy} onClick={() => startEdit(o)} />
                  <IconButton icon={<Trash2 />} label="Eliminar opción" size="sm" tone="danger" disabled={busy} onClick={() => onOptionDelete(o)} />
                </>
              )}
            </li>
          ))}
          <li className="flex items-center gap-2 px-3 py-1.5">
            <TextField
              label="Agregar opción"
              hideLabel
              icon={<Plus />}
              value={added}
              maxLength={120}
              placeholder="Agregar opción…"
              onChange={(e) => setAdded(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              containerClassName="min-w-0 flex-1"
              className="py-1"
            />
            {added.trim() && (
              <IconButton icon={<Check />} label="Agregar" size="sm" disabled={busy} onClick={() => void add()} />
            )}
          </li>
        </ul>
      )}
    </Panel>
  );
}
