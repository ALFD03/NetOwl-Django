/** Pie del sidebar: acceso a configuración, tema, usuario de la sesión y salida. */

import { KeyRound, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, ShieldCheck, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/shared/auth/AuthContext';
import { useTheme, type ThemePreference } from '@/shared/hooks/useTheme';
import { cn } from '@/shared/lib/cn';

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
];

/**
 * Desplegado, las tres opciones a la vista; plegado no caben, y un solo botón
 * las recorre en orden mostrando la que está puesta.
 */
function ThemeSelector({ compact }: { compact: boolean }) {
  const { preference, setPreference } = useTheme();

  if (compact) {
    const current = THEME_OPTIONS.findIndex((option) => option.value === preference);
    const { label, Icon } = THEME_OPTIONS[current];
    const next = THEME_OPTIONS[(current + 1) % THEME_OPTIONS.length];
    return (
      <button
        type="button"
        onClick={() => setPreference(next.value)}
        title={`Tema: ${label}. Cambiar a ${next.label.toLowerCase()}`}
        aria-label={`Tema: ${label}. Cambiar a ${next.label.toLowerCase()}`}
        className="flex w-full justify-center rounded-lg border border-slate-700 py-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-white"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="flex gap-1 rounded-lg bg-surface-tertiary p-1">
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            title={value === 'system' ? 'Seguir el tema del sistema operativo' : `Tema ${label.toLowerCase()}`}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-colors',
              active ? 'bg-surface-secondary text-white shadow-sm' : 'text-slate-500 hover:text-slate-200',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface UserMenuProps {
  username: string;
  /** `can_view_users`: abre la pantalla de usuarios y grupos. */
  canViewUsers: boolean;
  /** `can_manage_api_tokens`: abre la pantalla de tokens de API. */
  canManageTokens: boolean;
  /** La ruta actual, para marcar el enlace activo. */
  url: string;
  /** Solo iconos, para el sidebar plegado. */
  compact?: boolean;
  onNavigate?: () => void;
  /** Pliega o despliega el sidebar; sin él (el cajón del teléfono) no hay botón. */
  onToggleCollapsed?: () => void;
}

export function UserMenu({
  username,
  canViewUsers,
  canManageTokens,
  url,
  compact = false,
  onNavigate,
  onToggleCollapsed,
}: UserMenuProps) {
  const { logout } = useAuth();
  const isUsersPageActive = url.startsWith('/auth/users');
  const handleLogout = async () => {
    await logout();
    window.location.assign('/auth/login/');
  };
  return (
    <div className="space-y-2 border-t border-slate-800 pt-4">
      {canViewUsers && (
        <Link
          to="/auth/users/"
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

      {canManageTokens && (
        <Link
          to="/auth/tokens/"
          onClick={onNavigate}
          title={compact ? 'Tokens de API' : undefined}
          aria-label={compact ? 'Tokens de API' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg border py-2 text-xs font-semibold transition-colors',
            compact ? 'justify-center px-0' : 'px-3',
            url.startsWith('/auth/tokens')
              ? 'border-brand bg-brand text-white'
              : 'border-slate-700 text-slate-300 hover:bg-surface-hover hover:text-white',
          )}
        >
          <KeyRound className={cn('h-4 w-4', !url.startsWith('/auth/tokens') && 'text-brand')} />
          {!compact && <span>Tokens de API</span>}
        </Link>
      )}

      <ThemeSelector compact={compact} />

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

        {/* POST y no enlace: por GET, cualquier `<img>` ajena cerraría la sesión. */}
        <button
          type="button"
          onClick={() => void handleLogout()}
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
