/**
 * Navegación principal: los módulos que el usuario puede abrir.
 *
 * Un solo contenido (`SidebarContent`) en dos marcos, según el ancho:
 *
 * - Desde `lg`, `Sidebar`: la columna fija de siempre, que se puede plegar a una
 *   tira de iconos para dar el ancho a los reportes. El estado se recuerda.
 * - Por debajo, `MobileNavDrawer`: el mismo contenido en un cajón que abre la
 *   hamburguesa de `MobileTopBar`. En un teléfono una columna fija de 256px es
 *   dos tercios de la pantalla.
 */

import { useEffect } from 'react';
import { Link } from '@inertiajs/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { useScrollLock } from '@/shared/hooks/useScrollLock';
import { APP_NAVIGATION, firstVisibleTabHref } from '@/shared/constants/navigation';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { UserMenu } from './UserMenu';

interface SidebarContentProps {
  url: string;
  username: string;
  /** Solo iconos: el sidebar de escritorio plegado. */
  compact?: boolean;
  /** Se llama al elegir un destino; el cajón lo usa para cerrarse. */
  onNavigate?: () => void;
  /** Id del indicador animado: dos instancias montadas no pueden compartirlo. */
  layoutId: string;
}

function SidebarContent({ url, username, compact = false, onNavigate, layoutId }: SidebarContentProps) {
  const { can } = usePermissions();
  const canManageUsers = can(PERMISSIONS.MANAGE_USERS);

  // Cada entrada apunta a la primera pestana que el usuario si puede abrir.
  // Si no puede abrir ninguna, el modulo se oculta en vez de mostrar un enlace
  // que lo expulsaria de vuelta a su pagina de inicio.
  const visibleNavigation = APP_NAVIGATION.flatMap((item) => {
    if (!can(item.permission)) return [];
    const href = firstVisibleTabHref(item.module, can);
    return href ? [{ ...item, href }] : [];
  });

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="mb-6 flex items-center justify-center border-b border-slate-800 px-2 py-3">
          <Link href="/" onClick={onNavigate} className="flex items-center justify-center">
            <img
              src={compact ? '/static/img/favicon_dark.png' : '/static/img/logo.png'}
              alt="NetOwl Logo"
              className={cn(
                'w-auto object-contain transition-transform hover:scale-105',
                compact ? 'h-8' : 'h-12',
              )}
            />
          </Link>
        </div>

        <nav className="space-y-1" aria-label="Main navigation">
          {visibleNavigation.map((item) => {
            const active = url.startsWith(item.pathPrefix);
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                title={compact ? item.name : undefined}
                aria-label={compact ? item.name : undefined}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors',
                  compact ? 'justify-center px-0' : 'px-3',
                  active
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'text-slate-400 hover:bg-surface-hover hover:text-white',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!compact && <span>{item.name}</span>}
                {active && (
                  <motion.div
                    layoutId={layoutId}
                    className="absolute left-0 h-6 w-1 rounded-r-full bg-white"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <UserMenu
        username={username}
        canManageUsers={canManageUsers}
        isUsersPageActive={url.startsWith('/auth/users')}
        compact={compact}
        onNavigate={onNavigate}
      />
    </div>
  );
}

interface SidebarProps {
  url: string;
  username: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** La columna fija de escritorio. No existe por debajo de `lg`. */
export function Sidebar({ url, username, collapsed, onToggleCollapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        'relative z-30 hidden h-full shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-surface-secondary p-4 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-20 px-3' : 'w-64',
      )}
    >
      <SidebarContent url={url} username={username} compact={collapsed} layoutId="sidebar-active" />

      <button
        type="button"
        onClick={onToggleCollapsed}
        title={collapsed ? 'Mostrar el menú' : 'Ocultar el menú'}
        aria-label={collapsed ? 'Mostrar el menú' : 'Ocultar el menú'}
        aria-expanded={!collapsed}
        className="mt-3 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-surface-hover hover:text-white"
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        {!collapsed && <span>Ocultar menú</span>}
      </button>
    </aside>
  );
}

interface MobileTopBarProps {
  onOpenMenu: () => void;
}

/** Barra superior del teléfono: la hamburguesa y el logo. Desaparece desde `lg`. */
export function MobileTopBar({ onOpenMenu }: MobileTopBarProps) {
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-800 bg-surface-secondary/95 px-3 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir el menú"
        className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-surface-hover hover:text-white"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/" className="flex items-center">
        <img src="/static/img/logo.png" alt="NetOwl Logo" className="h-8 w-auto object-contain" />
      </Link>
    </div>
  );
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  username: string;
}

/** El menú en un cajón lateral, para pantallas sin sidebar. */
export function MobileNavDrawer({ open, onClose, url, username }: MobileNavDrawerProps) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-800 bg-surface-secondary p-4 shadow-2xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar el menú"
              className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 transition-colors hover:bg-surface-hover hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent url={url} username={username} onNavigate={onClose} layoutId="drawer-active" />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
