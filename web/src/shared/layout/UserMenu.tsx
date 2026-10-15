/** Pie del sidebar: acceso a configuración, tema, usuario de la sesión y salida. */

import { LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, ShieldCheck, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link, router } from '@inertiajs/react';

import { useTheme, type PreferenciaTema } from '@/shared/hooks/useTheme';
import { cn } from '@/shared/lib/cn';

const OPCIONES_TEMA: { valor: PreferenciaTema; etiqueta: string; Icono: LucideIcon }[] = [
  { valor: 'claro', etiqueta: 'Claro', Icono: Sun },
  { valor: 'oscuro', etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'sistema', etiqueta: 'Sistema', Icono: Monitor },
];

/**
 * Desplegado, las tres opciones a la vista; plegado no caben, y un solo botón
 * las recorre en orden mostrando la que está puesta.
 */
function SelectorTema({ compact }: { compact: boolean }) {
  const { preferencia, setPreferencia } = useTheme();

  if (compact) {
    const actual = OPCIONES_TEMA.findIndex((opcion) => opcion.valor === preferencia);
    const { etiqueta, Icono } = OPCIONES_TEMA[actual];
    const siguiente = OPCIONES_TEMA[(actual + 1) % OPCIONES_TEMA.length];
    return (
      <button
        type="button"
        onClick={() => setPreferencia(siguiente.valor)}
        title={`Tema: ${etiqueta}. Cambiar a ${siguiente.etiqueta.toLowerCase()}`}
        aria-label={`Tema: ${etiqueta}. Cambiar a ${siguiente.etiqueta.toLowerCase()}`}
        className="flex w-full justify-center rounded-lg border border-slate-700 py-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-white"
      >
        <Icono className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="flex gap-1 rounded-lg bg-surface-tertiary p-1">
      {OPCIONES_TEMA.map(({ valor, etiqueta, Icono }) => {
        const activo = preferencia === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => setPreferencia(valor)}
            title={valor === 'sistema' ? 'Seguir el tema del sistema operativo' : `Tema ${etiqueta.toLowerCase()}`}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-semibold transition-colors',
              activo ? 'bg-surface-secondary text-white shadow-sm' : 'text-slate-500 hover:text-slate-200',
            )}
          >
            <Icono className="h-3.5 w-3.5" />
            {etiqueta}
          </button>
        );
      })}
    </div>
  );
}

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

      <SelectorTema compact={compact} />

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
