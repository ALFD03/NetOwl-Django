/**
 * La barra de pestañas de un módulo, leída de `MODULE_NAVIGATION`.
 *
 * Oculta las pestañas para las que el usuario no tiene permiso.
 */

import { useEffect, useRef } from 'react';
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

  // En el teléfono las pestañas son una tira con scroll horizontal; la activa
  // puede quedar fuera (Catálogos es la octava), así que se centra al montar.
  // Se mueve `scrollLeft` a mano y no con `scrollIntoView`, que también
  // desplazaría la página en vertical.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const activa = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !activa || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = activa.offsetLeft - (nav.clientWidth - activa.offsetWidth) / 2;
  }, [activeTab]);

  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-3 rounded-xl border border-slate-800 bg-surface-secondary p-3 shadow-lg sm:p-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-4',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
        <ModuleIcon className="h-5 w-5 text-brand sm:h-6 sm:w-6" />
        <span>{title}</span>
      </div>

      <nav
        ref={navRef}
        className="relative -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0"
        aria-label={`${title} navigation`}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-all',
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
