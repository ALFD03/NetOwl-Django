/** Pie del sidebar: acceso a configuración, usuario de la sesión y salida. */

import { LogOut, ShieldCheck } from 'lucide-react';
import { Link, router } from '@inertiajs/react';

import { cn } from '@/shared/lib/cn';

interface UserMenuProps {
  username: string;
  canManageUsers: boolean;
  isUsersPageActive: boolean;
  /** Solo iconos, para el sidebar plegado. */
  compact?: boolean;
  onNavigate?: () => void;
}

export function UserMenu({
  username,
  canManageUsers,
  isUsersPageActive,
  compact = false,
  onNavigate,
}: UserMenuProps) {
  return (
    <div className="space-y-2 border-t border-slate-800 pt-4">
      {canManageUsers && (
        <Link
          href="/auth/users/"
          onClick={onNavigate}
          title={compact ? 'Configuración' : undefined}
          aria-label={compact ? 'Configuración' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg border py-2 text-xs font-semibold transition-colors',
            compact ? 'justify-center px-0' : 'px-3',
            isUsersPageActive
              ? 'border-brand bg-brand text-white'
              : 'border-slate-700 text-slate-300 hover:bg-surface-hover hover:text-white',
          )}
        >
          <ShieldCheck className="h-4 w-4 text-brand" />
          {!compact && <span>Configuración</span>}
        </Link>
      )}

      <div
        className={cn(
          'flex items-center rounded-lg bg-surface-tertiary p-2 text-xs',
          compact ? 'justify-center' : 'justify-between',
        )}
        title={compact ? username : undefined}
      >
        {!compact && (
          <div className="truncate">
            <p className="text-slate-400">Sesión:</p>
            <p className="truncate font-semibold text-white">{username}</p>
          </div>
        )}

        {/* POST y no enlace: por GET, cualquier `<img src="/auth/logout/">` en
            una página ajena cerraba la sesión del visitante. El token CSRF lo
            pone el interceptor de axios (shared/lib/http/csrf.ts). */}
        <button
          type="button"
          onClick={() => router.post('/auth/logout/')}
          className="rounded-md p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
          title="Cerrar Sesión"
          aria-label="Cerrar Sesión"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
