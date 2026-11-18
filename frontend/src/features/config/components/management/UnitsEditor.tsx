/**
 * Las unidades de negocio que ve un usuario sin el permiso de verlas todas.
 *
 * Son del usuario, no de su grupo: el grupo puede dar el interruptor de todas,
 * pero la lista se elige siempre por persona. Con el interruptor la lista no
 * rige, pero se conserva y se puede editar: es la que valdrá si se le quita.
 *
 * La lista sale del catálogo (Catálogos › Ventas), no de una constante: las
 * unidades cambian. Solo restringe la página Unidades de negocio, y el
 * consolidado FTTH se ve siempre. El bloque RF va como una unidad más porque en
 * el reporte lo es, aunque no sea un coordinador.
 */

import { Lock, UserCheck } from 'lucide-react';

import { Switch } from '@/shared/ui';
import type { BusinessUnit, UnitsSelection } from '@/features/config/types';

interface Props {
  units: UnitsSelection;
  onChange: (units: UnitsSelection) => void;
  catalog: readonly BusinessUnit[];
  /** La matriz (la suya o la de su grupo) concede todas las unidades: la lista no rige. */
  allUnits: boolean;
  disabled?: boolean;
  /**
   * Lo que puede conceder quien edita (`null`: todas). Lo demás se ve apagado
   * salvo que ya estuviera en `previa`; el servidor lo rechaza igual (ver
   * `unidades_fuera_de_alcance`).
   */
  grantable: UnitsSelection | null;
  previous: UnitsSelection;
}

const RF_LABEL = 'Nodos radiofrecuencia (RF)';

export function UnitsEditor({
  units,
  onChange,
  catalog,
  allUnits,
  disabled = false,
  grantable,
  previous,
}: Props) {
  const locked = (id: number) =>
    grantable !== null && !grantable.ids.includes(id) && !previous.ids.includes(id);
  const rfLocked = grantable !== null && !grantable.rf && !previous.rf;

  const mark = (id: number, value: boolean) => {
    if (disabled || (value && locked(id))) return;
    const ids = value ? [...units.ids, id] : units.ids.filter((current) => current !== id);
    onChange({ ...units, ids });
  };

  return (
    <section className="rounded-2xl border border-slate-800 bg-surface-primary overflow-hidden">
      <header className="flex items-start gap-3 border-b border-slate-800/70 bg-slate-900/40 px-4 py-3">
        <span className="rounded-xl border border-slate-700 p-2 text-sky-400">
          <UserCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-white">
            Unidades de negocio
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            Qué unidades ve en la página Unidades de negocio. El consolidado FTTH se ve siempre.
          </p>
        </div>
      </header>

      <div className="p-3">
        {allUnits && (
          <p className="mb-3 text-xs text-slate-400">
            Ve <strong className="text-white">todas</strong> las unidades por su matriz o su grupo.
            La lista de abajo no rige mientras tanto, pero se conserva.
          </p>
        )}
        <div className={allUnits ? 'opacity-60' : undefined}>
          {catalog.length === 0 && (
            <p className="mb-2 text-xs text-slate-500">No hay unidades en el catálogo.</p>
          )}
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {catalog.map((unit) => (
              <Switch
                key={unit.id}
                checked={units.ids.includes(unit.id)}
                onChange={(value) => mark(unit.id, value)}
                label={unit.name}
                tone="blue"
                disabled={disabled || locked(unit.id)}
              />
            ))}
            <Switch
              checked={units.rf}
              onChange={(rf) => !disabled && !(rf && rfLocked) && onChange({ ...units, rf })}
              label={RF_LABEL}
              tone="blue"
              disabled={disabled || rfLocked}
            />
          </div>
          {!disabled && grantable !== null && (
            <p className="mt-2 flex items-start gap-2 text-[11px] text-slate-500">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>Las apagadas son unidades que tú no ves: no puedes concederlas.</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
