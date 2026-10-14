/**
 * Las tarjetas de los grupos de permisos: qué abre cada uno, cuánto de la
 * matriz concede y quién está dentro.
 */

import { Plus, Search, Settings2, Shield, Trash2 } from 'lucide-react';

import { EmptyState } from '@/shared/ui';
import type { GroupData, UserData } from '@/features/config/types';
import { Avatar, ModulosConAcceso, TOTAL_PERMISSIONS, contarPermisos } from './acceso';

interface Props {
  groups: GroupData[];
  users: UserData[];
  onEdit: (group: GroupData) => void;
  onDelete: (group: GroupData) => void;
  onCreate: () => void;
  /** Hay un filtro de búsqueda activo: la lista vacía no significa que no haya grupos. */
  filtrando: boolean;
}

/** Cuántos avatares se pintan antes de resumir el resto en «+N». */
const MAX_AVATARES = 5;

export function GroupsGrid({ groups, users, onEdit, onDelete, onCreate, filtrando }: Props) {
  if (!groups.length && filtrando) {
    return (
      <EmptyState
        bordered
        icon={<Search />}
        title="Ningún grupo coincide"
        description="Prueba con otro nombre o descripción."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const concedidos = contarPermisos(group.permissions);
        const porcentaje = Math.round((concedidos / TOTAL_PERMISSIONS) * 100);
        const miembros = users.filter((user) => user.group_id === group.id);
        const sobrantes = group.members_count - Math.min(miembros.length, MAX_AVATARES);

        return (
          <article
            key={group.id}
            className="group flex flex-col rounded-2xl border border-slate-800 bg-surface-secondary p-5 shadow-xl transition-colors hover:border-slate-700"
          >
            <header className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30">
                <Shield className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold text-white">{group.name}</h3>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-400">
                  {group.description || <span className="italic text-slate-500">Sin descripción</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(group)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-surface-hover hover:text-brand-light"
                  title="Editar grupo y permisos"
                  aria-label={`Editar ${group.name}`}
                >
                  <Settings2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(group)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-surface-hover hover:text-rose-400"
                  title="Eliminar grupo"
                  aria-label={`Eliminar ${group.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* `flex-1`: empuja el pie al fondo, así las tarjetas de una fila
                alinean sus miembros aunque las descripciones midan distinto. */}
            <div className="mt-4 flex-1">
              <ModulosConAcceso permisos={group.permissions} conEtiqueta />
            </div>

            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[11px] font-semibold">
                <span className="text-slate-500">Permisos concedidos</span>
                <span className="tabular-nums text-slate-300">
                  {concedidos} de {TOTAL_PERMISSIONS}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-primary">
                <div className="h-full rounded-full bg-brand" style={{ width: `${porcentaje}%` }} />
              </div>
            </div>

            <footer className="mt-4 flex min-h-[2.75rem] items-center justify-between gap-3 border-t border-slate-800 pt-4">
              {group.members_count ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {miembros.slice(0, MAX_AVATARES).map((user) => (
                      <span key={user.id} title={user.username}>
                        <Avatar nombre={user.username} size="sm" />
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">
                    {sobrantes > 0 && `+${sobrantes} · `}
                    {group.members_count} {group.members_count === 1 ? 'miembro' : 'miembros'}
                  </span>
                </div>
              ) : (
                <span className="text-xs italic text-slate-500">Sin miembros</span>
              )}
            </footer>
          </article>
        );
      })}

      {/* Solo sin filtro: con una búsqueda activa, una tarjeta de «crear» en
          medio de los resultados se leería como uno más. */}
      {!filtrando && (
        <button
          type="button"
          onClick={onCreate}
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 text-slate-500 transition-colors hover:border-brand/60 hover:bg-brand/5 hover:text-brand-light"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-semibold">Nuevo grupo</span>
        </button>
      )}
    </div>
  );
}
