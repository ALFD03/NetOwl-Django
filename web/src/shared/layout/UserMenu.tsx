/** Pie del sidebar: acceso a configuración, usuario de la sesión y salida. */

import { LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react';
import { Link, router } from '@inertiajs/react';

import { cn } from '@/shared/lib/cn';

interface UserMenuProps {
  username: string;
  canManageUsers: boolean;
  isUsersPageActive: boolean;
  /** Solo iconos, para el sidebar plegado. */
  compact?: boolean;
  onNavigate?: () => void;
  /** Pliega o despliega el sidebar; sin él (el cajón del teléfono) no hay botón. */
  onToggleCollapsed?: () => void;
}

export function UserMenu({
  username,
  canManageUsers,
  isUsersPageActive,
  compact = false,
  onNavigate,
  onToggleCollapsed,
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
          {/* Activo, el fondo ya es `bg-brand`: el icono en `text-brand` desaparecía. */}
          <ShieldCheck className={cn('h-4 w-4', !isUsersPageActive && 'text-brand')} />
          {!compact && <span>Configuración</span>}
        </Link>
      )}

      <div
        className={cn(
          'flex items-center gap-1 rounded-lg bg-surface-tertiary p-1.5 text-xs',
          compact && 'flex-col',
        )}
        title={compact ? username : undefined}
      >
        {/* Plegar el menú es un icono discreto junto a la sesión, no un botón
            ancho propio: se usa poco y no debe competir con la navegación. */}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={compact ? 'Mostrar el menú' : 'Ocultar el menú'}
            aria-label={compact ? 'Mostrar el menú' : 'Ocultar el menú'}
            aria-expanded={!compact}
            className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-surface-hover hover:text-slate-200"
          >
            {compact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}

        {!compact && (
          <div className="min-w-0 flex-1 truncate px-1">
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
