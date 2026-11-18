/** Los requisitos del fichero que espera cada importación. */

import { Activity } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { Panel, ToggleGroup } from '@/shared/ui';
import type { OdooFieldGroup } from '../types';

export interface RequirementsCardProps {
  title: string;
  /** One bullet per requirement; may contain `<strong>` emphasis. */
  requirements: ReactNode[];
  /** Optional highlighted note pinned to the bottom of the card. */
  note?: ReactNode;
  /**
   * Las cabeceras de Odoo que lee cada tipo de export. Llegan del servidor,
   * sacadas de los mismos mapeos que usa el importador.
   */
  fieldGroups?: OdooFieldGroup[];
  /** Grupo de campos a mostrar; sigue al tipo de importación elegido. */
  activeGroup?: string;
  className?: string;
}

/**
 * Lista de cabeceras de Odoo de cada tipo de export.
 *
 * Tiene pestañas propias porque se puede consultar sin permiso de carga, pero
 * sigue a `activeGroup` cuando cambia: lo normal es querer ver los campos del
 * fichero que se va a subir.
 */
function FieldGroups({ groups, activeGroup: activeGroupKey }: { groups: OdooFieldGroup[]; activeGroup?: string }) {
  const [chosen, setChosen] = useState(activeGroupKey ?? groups[0]?.key);
  const [followed, setFollowed] = useState(activeGroupKey);
  if (activeGroupKey !== followed) {
    setFollowed(activeGroupKey);
    if (activeGroupKey) setChosen(activeGroupKey);
  }

  const group = groups.find((g) => g.key === chosen) ?? groups[0];
  if (!group) return null;
  const requiredCount = group.fields.filter((c) => c.required).length;

  return (
    <div className="mt-5 border-t border-slate-800 pt-4">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
        Campos de Odoo admitidos
      </h4>
      <p className="mt-1 text-[11px] text-slate-500">
        Cabeceras exactas del export. Las requeridas deben estar; las opcionales se usan si vienen.
        Cualquier otra columna se ignora.
      </p>

      {groups.length > 1 && (
        <ToggleGroup
          className="mt-3"
          options={groups.map((g) => ({ key: g.key, label: g.label }))}
          activeKey={group.key}
          onChange={setChosen}
        />
      )}

      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {requiredCount} requeridos · {group.fields.length - requiredCount} opcionales
      </p>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
        {group.fields.map((field) => (
          <li
            key={field.name}
            className="flex items-center justify-between gap-3 rounded-md bg-surface-tertiary px-3 py-1.5"
          >
            <div className="min-w-0">
              <code className={cn('break-all text-[11px]', field.required ? 'text-slate-200' : 'text-slate-400')}>
                {field.name}
              </code>
              {field.alias && field.alias.length > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-500">También: {field.alias.join(', ')}</p>
              )}
            </div>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                field.required ? 'bg-brand/15 text-brand' : 'text-slate-500',
              )}
            >
              {field.required ? 'Requerido' : 'Opcional'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The "what this file must contain" panel beside each upload form. */
export function RequirementsCard({
  title,
  requirements,
  note,
  fieldGroups,
  activeGroup: activeGroupKey,
  className,
}: RequirementsCardProps) {
  const groupsWithFields = fieldGroups?.filter((group) => group.fields.length > 0) ?? [];

  return (
    <Panel title={title} stretch className={className}>
      <ul className="list-inside list-disc space-y-2.5 text-xs leading-relaxed text-slate-400">
        {requirements.map((requirement, idx) => (
          <li key={idx}>{requirement}</li>
        ))}
      </ul>

      {groupsWithFields.length > 0 && (
        <FieldGroups groups={groupsWithFields} activeGroup={activeGroupKey} />
      )}

      {note && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-brand/20 bg-brand/5 p-4">
          <Activity className="h-5 w-5 flex-shrink-0 text-brand" />
          <p className="text-[11px] text-slate-400">{note}</p>
        </div>
      )}
    </Panel>
  );
}
