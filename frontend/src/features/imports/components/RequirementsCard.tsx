/** Los requisitos del fichero que espera cada importación. */

import { Activity } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { Panel, ToggleGroup } from '@/shared/ui';
import type { GrupoCamposOdoo } from '../types';

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
  camposOdoo?: GrupoCamposOdoo[];
  /** Grupo de campos a mostrar; sigue al tipo de importación elegido. */
  grupoActivo?: string;
  className?: string;
}

/**
 * Lista de cabeceras de Odoo de cada tipo de export.
 *
 * Tiene pestañas propias porque se puede consultar sin permiso de carga, pero
 * sigue a `grupoActivo` cuando cambia: lo normal es querer ver los campos del
 * fichero que se va a subir.
 */
function CamposOdoo({ grupos, grupoActivo }: { grupos: GrupoCamposOdoo[]; grupoActivo?: string }) {
  const [elegido, setElegido] = useState(grupoActivo ?? grupos[0]?.key);
  const [seguido, setSeguido] = useState(grupoActivo);
  if (grupoActivo !== seguido) {
    setSeguido(grupoActivo);
    if (grupoActivo) setElegido(grupoActivo);
  }

  const grupo = grupos.find((g) => g.key === elegido) ?? grupos[0];
  if (!grupo) return null;
  const requeridos = grupo.campos.filter((c) => c.requerido).length;

  return (
    <div className="mt-5 border-t border-slate-800 pt-4">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
        Campos de Odoo admitidos
      </h4>
      <p className="mt-1 text-[11px] text-slate-500">
        Cabeceras exactas del export. Las requeridas deben estar; las opcionales se usan si vienen.
        Cualquier otra columna se ignora.
      </p>

      {grupos.length > 1 && (
        <ToggleGroup
          className="mt-3"
          options={grupos.map((g) => ({ key: g.key, label: g.label }))}
          activeKey={grupo.key}
          onChange={setElegido}
        />
      )}

      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {requeridos} requeridos · {grupo.campos.length - requeridos} opcionales
      </p>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
        {grupo.campos.map((campo) => (
          <li
            key={campo.nombre}
            className="flex items-center justify-between gap-3 rounded-md bg-surface-tertiary px-3 py-1.5"
          >
            <div className="min-w-0">
              <code className={cn('break-all text-[11px]', campo.requerido ? 'text-slate-200' : 'text-slate-400')}>
                {campo.nombre}
              </code>
              {campo.alias && campo.alias.length > 0 && (
                <p className="mt-0.5 text-[10px] text-slate-500">También: {campo.alias.join(', ')}</p>
              )}
            </div>
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                campo.requerido ? 'bg-brand/15 text-brand' : 'text-slate-500',
              )}
            >
              {campo.requerido ? 'Requerido' : 'Opcional'}
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
  camposOdoo,
  grupoActivo,
  className,
}: RequirementsCardProps) {
  const gruposConCampos = camposOdoo?.filter((grupo) => grupo.campos.length > 0) ?? [];

  return (
    <Panel title={title} stretch className={className}>
      <ul className="list-inside list-disc space-y-2.5 text-xs leading-relaxed text-slate-400">
        {requirements.map((requirement, idx) => (
          <li key={idx}>{requirement}</li>
        ))}
      </ul>

      {gruposConCampos.length > 0 && (
        <CamposOdoo grupos={gruposConCampos} grupoActivo={grupoActivo} />
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
