/**
 * La tabla de cuentas: quién es, con qué rol, de dónde le vienen los permisos
 * y a qué módulos entra.
 */

import { Key, Search, Settings2, Shield, SlidersHorizontal, Trash2 } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { EmptyState } from '@/shared/ui';
import type { GroupData, UserData } from '@/features/config/types';
import {
  Avatar, ModulosConAcceso, TOTAL_PERMISSIONS, contarPermisos, permisosEfectivos,
} from './acceso';

interface Props {
  users: UserData[];
  groups: GroupData[];
  onEdit: (user: UserData) => void;
  onChangePassword: (user: UserData) => void;
  onDelete: (user: UserData) => void;
}

/** Botón de fila: discreto en reposo, con el color de su acción al pasar por encima. */
const ACCION = 'rounded-lg p-2 text-slate-500 transition-colors hover:bg-surface-hover';

export function UsersTable({ users, groups, onEdit, onChangePassword, onDelete }: Props) {
  if (!users.length) {
    return (
      <EmptyState
        bordered
        icon={<Search />}
        title="Ninguna cuenta coincide"
        description="Prueba con otro nombre, rol o grupo."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-surface-secondary shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Usuario</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3">Permisos</th>
              <th className="px-5 py-3">Módulos</th>
              <th className="px-5 py-3 text-right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {users.map((user) => {
              const permisos = permisosEfectivos(user, groups);
              return (
                <tr key={user.id} className="group transition-colors hover:bg-white/[0.03]">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={user.username} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{user.username}</p>
                        {user.is_superuser && (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-light">
                            Superusuario
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-3">
                    <span className="rounded-md bg-surface-tertiary px-2 py-1 text-xs font-medium text-slate-300">
                      {user.role_display}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    {user.group_name ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                        <Shield className="h-3.5 w-3.5" />
                        {user.group_name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Individuales
                      </span>
                    )}
                    <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                      {contarPermisos(permisos)} de {TOTAL_PERMISSIONS}
                    </p>
                  </td>

                  <td className="px-5 py-3">
                    <ModulosConAcceso permisos={permisos} />
                  </td>

                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEdit(user)}
                        className={cn(ACCION, 'hover:text-brand-light')}
                        title="Editar rol, grupo y permisos"
                        aria-label={`Editar ${user.username}`}
                      >
                        <Settings2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangePassword(user)}
                        className={cn(ACCION, 'hover:text-amber-300')}
                        title="Cambiar contraseña"
                        aria-label={`Cambiar la contraseña de ${user.username}`}
                      >
                        <Key className="h-4 w-4" />
                      </button>
                      {/* El superusuario no se borra desde aquí; el hueco
                          mantiene alineada la columna. */}
                      {user.is_superuser ? (
                        <span className="w-8" aria-hidden />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDelete(user)}
                          className={cn(ACCION, 'hover:text-rose-400')}
                          title="Eliminar cuenta"
                          aria-label={`Eliminar ${user.username}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
