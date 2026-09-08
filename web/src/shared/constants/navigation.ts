import {
  BarChart3, Clock, CloudDownload, FileSpreadsheet, Gauge, Headset,
  Layers, Lock, Table, TrendingUp, UserCheck, Users,
} from 'lucide-react';

import { PERMISSIONS } from './permissions';
import type { Permission } from '@/shared/types/auth';
import type { AppNavigationItem, ModuleNavigation } from '@/shared/types/navigation';

/** Top-level modules shown in the sidebar. */
export const APP_NAVIGATION: AppNavigationItem[] = [
  {
    name: 'Subscriptions',
    module: 'subscriptions',
    icon: Layers,
    pathPrefix: '/subscriptions',
    permission: PERMISSIONS.VIEW_SUBSCRIPTIONS,
  },
  {
    name: 'CRM Analytics',
    module: 'crm',
    icon: Users,
    pathPrefix: '/crm',
    permission: PERMISSIONS.VIEW_CRM,
  },
  {
    name: 'Technical Support',
    module: 'support',
    icon: Headset,
    pathPrefix: '/support',
    permission: PERMISSIONS.VIEW_SUPPORT,
  },
  {
    name: 'Imports',
    module: 'imports',
    icon: CloudDownload,
    pathPrefix: '/imports',
    permission: PERMISSIONS.VIEW_IMPORTS,
  },
];

/**
 * Every module's tabbed sub-navigation, keyed by module.
 *
 * `<ModuleHeader module="crm" />` reads this directly, which is why there are no
 * per-module header components: adding a module means adding an entry here.
 */
export const MODULE_NAVIGATION = {
  subscriptions: {
    title: 'Subscriptions',
    icon: Gauge,
    tabs: [
      { id: 'dashboard', label: 'Dashboard', href: '/subscriptions/dashboard/', icon: Gauge },
      { id: 'analytics', label: 'Analytics', href: '/subscriptions/analytics/', icon: BarChart3, permission: PERMISSIONS.VIEW_SUBS_ANALYTICS },
      { id: 'results', label: 'Results', href: '/subscriptions/results/', icon: Table, permission: PERMISSIONS.VIEW_SUBS_RESULTS },
      { id: 'lifetime', label: 'Life Time Cycle', href: '/subscriptions/lifetime/', icon: TrendingUp, permission: PERMISSIONS.VIEW_SUBS_LIFETIME },
      { id: 'sales', label: 'Sales Report', href: '/subscriptions/sales-report/', icon: FileSpreadsheet, permission: PERMISSIONS.VIEW_SUBS_SALES },
      { id: 'business_units', label: 'Business Units', href: '/subscriptions/business-units/', icon: UserCheck, permission: PERMISSIONS.VIEW_SUBS_SALES },
      { id: 'eta', label: 'ETA Report', href: '/subscriptions/eta-report/', icon: Lock, permission: PERMISSIONS.VIEW_ETA },
    ],
  },
  crm: {
    title: 'CRM Analytics',
    icon: Users,
    tabs: [
      { id: 'dashboard', label: 'Dashboard', href: '/crm/dashboard/', icon: Gauge },
      { id: 'analytics', label: 'Analytics', href: '/crm/analytics/', icon: BarChart3, permission: PERMISSIONS.VIEW_CRM_ANALYTICS },
      { id: 'results', label: 'Results', href: '/crm/results/', icon: Table, permission: PERMISSIONS.VIEW_CRM_RESULTS },
    ],
  },
  support: {
    title: 'Technical Support',
    icon: Headset,
    tabs: [
      { id: 'dashboard', label: 'Dashboard', href: '/support/dashboard/', icon: Gauge },
      { id: 'analytics', label: 'Analytics', href: '/support/analytics/', icon: BarChart3, permission: PERMISSIONS.VIEW_SUPPORT_ANALYTICS },
      { id: 'results', label: 'Results', href: '/support/results/', icon: Table, permission: PERMISSIONS.VIEW_SUPPORT_RESULTS },
    ],
  },
  imports: {
    title: 'Módulo de Importaciones',
    icon: CloudDownload,
    tabs: [
      { id: 'subscriptions', label: 'Subscriptions', href: '/imports/subscriptions/', icon: Layers, permission: PERMISSIONS.VIEW_IMPORTS_SUBS },
      { id: 'crm', label: 'CRM Analytics', href: '/imports/crm/', icon: Users, permission: PERMISSIONS.VIEW_IMPORTS_CRM },
      { id: 'support', label: 'Technical Support', href: '/imports/support/', icon: Headset, permission: PERMISSIONS.VIEW_IMPORTS_SUPPORT },
      { id: 'history', label: 'Historial de Acciones', href: '/imports/history/', icon: Clock, permission: PERMISSIONS.VIEW_IMPORT_HISTORY },
    ],
  },
} satisfies Record<string, ModuleNavigation>;

export type ModuleKey = keyof typeof MODULE_NAVIGATION;

/** Valid `activeTab` values for a module, so pages cannot pass a stale id. */
export type ModuleTabId<M extends ModuleKey> =
  (typeof MODULE_NAVIGATION)[M]['tabs'][number]['id'];

/**
 * First tab of `module` that `can` allows, or `null` when none is reachable.
 *
 * The sidebar uses this instead of a hardcoded href: pointing "Imports" at
 * `/imports/subscriptions/` locked out users who only hold one of the other
 * import tabs, since the landing tab denied them and bounced them out of the
 * module. `/imports/` on the server does the same resolution for direct hits.
 */
export function firstVisibleTabHref(
  module: ModuleKey,
  can: (permission: Permission) => boolean,
): string | null {
  const tab = MODULE_NAVIGATION[module].tabs.find((t) => !t.permission || can(t.permission));
  return tab?.href ?? null;
}
