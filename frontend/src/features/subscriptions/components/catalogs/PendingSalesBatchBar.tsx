/** La barra para registrar en bloque, en un equipo y con un rol, las personas de ventas pendientes que se marcaron. */

import { UserPlus, X } from 'lucide-react';

import { Button, SelectMenu } from '@/shared/ui';
import type { SalesRole } from '@/features/subscriptions/types';

interface BatchBarProps {
  selectedNames: number;
  /** El equipo donde se registra. */
  team: string;
  teams: { value: string; label: string }[];
  onTeam: (slug: string) => void;
  /** `null` cuando las elegidas no comparten rol sugerido y nadie eligió uno. */
  role: SalesRole | null;
  roles: { value: string; label: string }[];
  saving: boolean;
  onRole: (value: string) => void;
  onRegister: () => void;
  onClear: () => void;
}

/**
 * El registro en bloque de las personas por registrar: se filtra por rol
 * sugerido, se marcan las casillas (la de la cabecera toma todas las
 * filtradas, no solo las de la página) y se registran de una vez en el equipo
 * y con el rol elegidos. Los roles que piden más que el nombre (site, unidades,
 * usuario de Odoo) se registran de uno en uno. Sin selección, solo explica cómo
 * se usa; el equipo se elige siempre, también para «Registrar» una a una.
 */
export function BatchBar({
  selectedNames,
  team,
  teams,
  onTeam,
  role,
  roles,
  saving,
  onRole,
  onRegister,
  onClear,
}: BatchBarProps) {
  const teamSelector = (
    <>
      <span className="text-xs text-slate-400">Registrar en el equipo</span>
      <SelectMenu
        aria-label="Equipo donde se registran"
        className="min-w-[160px] rounded-xl border border-slate-700/50 bg-surface-secondary px-3 py-1.5 text-xs text-white"
        value={team}
        options={teams}
        onChange={onTeam}
      />
    </>
  );
  if (selectedNames === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-surface-secondary/50 px-4 py-2">
        {teamSelector}
        <p className="text-[11px] text-slate-500">
          Para registrar varias a la vez, marca las casillas: la de la cabecera selecciona todas las
          filtradas. Lo marcado se conserva al buscar o filtrar, así que puedes ir juntando personas
          de varias búsquedas.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
        {selectedNames} seleccionada{selectedNames === 1 ? '' : 's'}
      </span>
      <span className="text-[11px] text-emerald-300/70">se conservan al buscar o filtrar</span>
      {teamSelector}
      <span className="text-xs text-slate-400">como</span>
      <SelectMenu
        aria-label="Rol con el que se registran"
        className="min-w-[180px] rounded-xl border border-slate-700/50 bg-surface-secondary px-3 py-1.5 text-xs text-white"
        value={role ?? ''}
        placeholder="Elige un rol"
        options={roles}
        onChange={onRole}
      />
      <Button
        size="sm"
        icon={<UserPlus className="h-4 w-4" />}
        disabled={!role}
        isLoading={saving}
        onClick={onRegister}
      >
        Registrar {selectedNames}
      </Button>
      <Button size="sm" variant="outline" icon={<X className="h-4 w-4" />} onClick={onClear}>
        Limpiar
      </Button>
    </div>
  );
}
