/**
 * La barra de pestañas de un módulo, leída de `MODULE_NAVIGATION`.
 *
 * Oculta las pestañas para las que el usuario no tiene permiso.
 */

import { Link } from '@inertiajs/react';

import { cn } from '@/shared/lib/cn';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { MODULE_NAVIGATION, tabVisible, type ModuleKey, type ModuleTabId } from '@/shared/constants/navigation';
import type { ModuleNavigation } from '@/shared/types/navigation';

export interface ModuleHeaderProps<M extends ModuleKey> {
  /** Which module's tab set to render. Looked up in `MODULE_NAVIGATION`. */
  module: M;
  /** Must be one of the module's declared tab ids. */
  activeTab: ModuleTabId<M>;
  /** Escape hatch for a nav that does not live in the registry. */
  navigation?: ModuleNavigation;
  className?: string;
}

/**
 * Tabbed sub-navigation for a module, permission-filtered.
 *
 * This replaces `CrmHeader` / `SubHeader` / `SupportHeader` / `ImportsHeader`,
 * which were four separate files that each forwarded a different constant here.
 */
export function ModuleHeader<M extends ModuleKey>({
  module,
  activeTab,
  navigation,
  className,
}: ModuleHeaderProps<M>) {
  const { can } = usePermissions();
  const { title, icon: ModuleIcon, tabs } = navigation ?? MODULE_NAVIGATION[module];

  const visibleTabs = tabs.filter((tab) => tabVisible(tab, can));

  return (
    <header
      className={cn(
        'mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-surface-secondary p-4 shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-lg font-bold text-white">
        <ModuleIcon className="h-6 w-6 text-brand" />
        <span>{title}</span>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label={`${title} navigation`}>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all',
                isActive
                  ? 'bg-brand text-white shadow-md shadow-brand/20'
                  : 'text-slate-400 hover:bg-surface-hover hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
