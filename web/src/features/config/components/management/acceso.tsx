/**
 * Lo que la tabla de usuarios y las tarjetas de grupos enseñan de un vistazo:
 * quién es (el avatar), a qué módulos entra y cuántos permisos tiene.
 */

import { CloudDownload, Headset, Layers, Users, type LucideIcon } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { PERMISSION_GROUPS, PERMISSIONS, TOTAL_PERMISSIONS } from '@/shared/constants/permissions';
import type { Permission } from '@/shared/types/auth';
import type { GroupData, UserData } from '@/features/config/types';

/** Los módulos, por el permiso que abre cada uno. En el orden del sidebar. */
export const MODULOS_ACCESO: readonly { permiso: Permission; label: string; icon: LucideIcon }[] = [
  { permiso: PERMISSIONS.VIEW_SUBSCRIPTIONS, label: 'Suscripciones', icon: Layers },
  { permiso: PERMISSIONS.VIEW_CRM, label: 'CRM', icon: Users },
  { permiso: PERMISSIONS.VIEW_SUPPORT, label: 'Soporte técnico', icon: Headset },
  { permiso: PERMISSIONS.VIEW_IMPORTS, label: 'Importaciones', icon: CloudDownload },
];

const CLAVES = PERMISSION_GROUPS.flatMap((group) => group.perms.map((perm) => perm.key));

/** Cuántos permisos de la matriz están concedidos. */
export function contarPermisos(permisos: Record<string, boolean>): number {
  return CLAVES.filter((clave) => permisos[clave]).length;
}

export { TOTAL_PERMISSIONS };

/**
 * La matriz que de verdad rige para una cuenta: la del grupo si tiene uno (el
 * perfil le delega todo), la suya si no.
 */
export function permisosEfectivos(user: UserData, grupos: GroupData[]): Record<string, boolean> {
  if (user.group_id == null) return user.permissions;
  return grupos.find((grupo) => grupo.id === user.group_id)?.permissions ?? user.permissions;
}

interface ModulosProps {
  permisos: Record<string, boolean>;
  /** Con nombre (tarjetas de grupo) o solo iconos (filas de la tabla). */
  conEtiqueta?: boolean;
}

/** Los cuatro módulos, encendidos los que la matriz abre. */
export function ModulosConAcceso({ permisos, conEtiqueta = false }: ModulosProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {MODULOS_ACCESO.map(({ permiso, label, icon: Icon }) => {
        const abierto = Boolean(permisos[permiso]);
        return (
          <span
            key={permiso}
            title={`${label}: ${abierto ? 'con acceso' : 'sin acceso'}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border text-[11px] font-semibold',
              conEtiqueta ? 'px-2 py-1' : 'p-1.5',
              abierto
                ? 'border-brand/30 bg-brand/10 text-brand-light'
                : 'border-slate-800 text-slate-600',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {conEtiqueta && <span className={cn(!abierto && 'line-through')}>{label}</span>}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Colores de avatar. Clases completas y no construidas, para que Tailwind las
 * encuentre al compilar.
 */
const TONOS_AVATAR = [
  'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
] as const;

/** El mismo nombre da siempre el mismo color, así que una cuenta se reconoce en las dos vistas. */
function tonoDe(nombre: string): string {
  let hash = 0;
  for (const letra of nombre) hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
  return TONOS_AVATAR[hash % TONOS_AVATAR.length];
}

interface AvatarProps {
  nombre: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ nombre, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase ring-1',
        size === 'md' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-[11px]',
        tonoDe(nombre),
        className,
      )}
    >
      {nombre.slice(0, 2)}
    </span>
  );
}
