/** Navegación principal: los módulos que el usuario puede abrir. */

import { Link } from '@inertiajs/react';
import { motion } from 'framer-motion';

import { usePermissions } from '@/shared/hooks/usePermissions';
import { APP_NAVIGATION, firstVisibleTabHref } from '@/shared/constants/navigation';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { UserMenu } from './UserMenu';

interface SidebarProps {
  url: string;
  username: string;
}

export function Sidebar({ url, username }: SidebarProps) {
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
    <aside className="w-64 shrink-0 bg-surface-secondary border-r border-slate-800 flex flex-col justify-between p-4 h-screen overflow-y-auto z-30">
      <div>
        <div className="flex items-center justify-center px-2 py-3 mb-6 border-b border-slate-800">
          <Link href="/" className="flex items-center justify-center">
            <img
              src="/static/img/logo.png"
              alt="NetOwl Logo"
              className="h-12 w-auto object-contain transition-transform hover:scale-105"
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
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'text-white bg-brand shadow-md shadow-brand/20'
                    : 'text-slate-400 hover:text-white hover:bg-surface-hover'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 w-1 h-6 bg-white rounded-r-full"
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
      />
    </aside>
  );
}
