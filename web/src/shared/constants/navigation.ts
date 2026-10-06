/**
 * El registro de navegación: los módulos y sus páginas, que el sidebar pinta
 * como un árbol. Es la única navegación de la app: no hay pestañas por módulo.
 *
 * Añadir una página es añadir una entrada aquí; ni el sidebar ni la ruta de
 * migas de `AppLayout` necesitan saber nada más.
 */

import {
  BarChart3, BookMarked, Clock, CloudDownload, Contact, FileSpreadsheet, Gauge, Headset,
  Layers, Lock, Table, TrendingUp, UserCheck, Users,
} from 'lucide-react';

import { PERMISSIONS } from './permissions';
import type { Permission } from '@/shared/types/auth';
import type { AppNavigationItem, NavigationPage } from '@/shared/types/navigation';

const REPORTES = 'Reportes';
const CONFIGURACION = 'Configuración';

export const APP_NAVIGATION: AppNavigationItem[] = [
  {
    module: 'subscriptions',
    name: 'Suscripciones',
    icon: Layers,
    pathPrefix: '/subscriptions',
    permission: PERMISSIONS.VIEW_SUBSCRIPTIONS,
    pages: [
      { id: 'dashboard', label: 'Dashboard', href: '/subscriptions/dashboard/', icon: Gauge },
      { id: 'analytics', label: 'Analytics', href: '/subscriptions/analytics/', icon: BarChart3, permission: PERMISSIONS.VIEW_SUBS_ANALYTICS },
      { id: 'results', label: 'Resultados', href: '/subscriptions/results/', icon: Table, permission: PERMISSIONS.VIEW_SUBS_RESULTS },
      { id: 'lifetime', label: 'Ciclo de vida', href: '/subscriptions/lifetime/', icon: TrendingUp, permission: PERMISSIONS.VIEW_SUBS_LIFETIME, section: REPORTES },
      { id: 'sales', label: 'Reporte de ventas', href: '/subscriptions/sales-report/', icon: FileSpreadsheet, permission: PERMISSIONS.VIEW_SUBS_SALES, section: REPORTES },
      { id: 'business_units', label: 'Unidades de negocio', href: '/subscriptions/business-units/', icon: UserCheck, permission: PERMISSIONS.VIEW_SUBS_SALES, section: REPORTES },
      { id: 'eta', label: 'Reporte ETA', href: '/subscriptions/eta-report/', icon: Lock, permission: PERMISSIONS.VIEW_ETA, section: REPORTES },
      { id: 'catalogos', label: 'Catálogos', href: '/subscriptions/config/', icon: BookMarked, permission: [PERMISSIONS.MANAGE_CATALOGO_COMERCIAL, PERMISSIONS.MANAGE_CATALOGO_OPERACIONAL], section: CONFIGURACION },
    ],
  },
  {
    module: 'crm',
    name: 'CRM',
    icon: Users,
    pathPrefix: '/crm',
    permission: PERMISSIONS.VIEW_CRM,
    pages: [
      { id: 'dashboard', label: 'Dashboard', href: '/crm/dashboard/', icon: Gauge },
      { id: 'analytics', label: 'Analytics', href: '/crm/analytics/', icon: BarChart3, permission: PERMISSIONS.VIEW_CRM_ANALYTICS },
      { id: 'results', label: 'Resultados', href: '/crm/results/', icon: Table, permission: PERMISSIONS.VIEW_CRM_RESULTS },
    ],
  },
  {
    module: 'support',
    name: 'Soporte técnico',
    icon: Headset,
    pathPrefix: '/support',
    permission: PERMISSIONS.VIEW_SUPPORT,
    pages: [
      { id: 'dashboard', label: 'Dashboard', href: '/support/dashboard/', icon: Gauge },
      { id: 'analytics', label: 'Analytics', href: '/support/analytics/', icon: BarChart3, permission: PERMISSIONS.VIEW_SUPPORT_ANALYTICS },
      { id: 'results', label: 'Resultados', href: '/support/results/', icon: Table, permission: PERMISSIONS.VIEW_SUPPORT_RESULTS },
      { id: 'usuarios', label: 'Usuarios', href: '/support/users/', icon: Contact, permission: PERMISSIONS.MANAGE_SUPPORT_USERS, section: CONFIGURACION },
    ],
  },
  {
    module: 'imports',
    name: 'Importaciones',
    icon: CloudDownload,
    pathPrefix: '/imports',
    permission: PERMISSIONS.VIEW_IMPORTS,
    pages: [
      { id: 'subscriptions', label: 'Suscripciones', href: '/imports/subscriptions/', icon: Layers, permission: PERMISSIONS.VIEW_IMPORTS_SUBS },
      { id: 'crm', label: 'CRM', href: '/imports/crm/', icon: Users, permission: PERMISSIONS.VIEW_IMPORTS_CRM },
      { id: 'support', label: 'Soporte técnico', href: '/imports/support/', icon: Headset, permission: PERMISSIONS.VIEW_IMPORTS_SUPPORT },
      { id: 'history', label: 'Historial', href: '/imports/history/', icon: Clock, permission: PERMISSIONS.VIEW_IMPORT_HISTORY },
    ],
  },
];

/**
 * Si el usuario ve la página: sin permiso declarado, siempre; con una lista,
 * basta con uno (la de catálogos abre con el comercial o con el operacional).
 */
export function pageVisible(
  page: NavigationPage,
  can: (permission: Permission) => boolean,
): boolean {
  if (!page.permission) return true;
  return typeof page.permission === 'string' ? can(page.permission) : page.permission.some(can);
}

/** Los módulos que el usuario puede abrir, cada uno solo con sus páginas visibles. */
export function visibleNavigation(can: (permission: Permission) => boolean): AppNavigationItem[] {
  // Un módulo sin ninguna página visible se oculta entero: enlazarlo lo
  // expulsaría de vuelta a su página de inicio. `/imports/` hace en el
  // servidor la misma resolución para quien entra por la URL.
  return APP_NAVIGATION.flatMap((item) => {
    if (!can(item.permission)) return [];
    const pages = item.pages.filter((page) => pageVisible(page, can));
    return pages.length ? [{ ...item, pages }] : [];
  });
}

export interface NavigationLocation {
  item: AppNavigationItem;
  page: NavigationPage;
}

/**
 * El módulo y la página de una URL, o `null` fuera de los módulos (login,
 * gestión de usuarios).
 *
 * Gana la página cuyo `href` es el prefijo más largo de la ruta, así que las
 * subrutas cuelgan de su página (`eta-report/config/` es Reporte ETA,
 * `results/2026-08/` es Resultados). La raíz del módulo (`/crm/`) es su
 * primera página, que es lo que sirve el servidor ahí.
 */
export function resolveLocation(url: string): NavigationLocation | null {
  const path = url.split(/[?#]/)[0];
  const item = APP_NAVIGATION.find(
    (candidate) => path === candidate.pathPrefix || path.startsWith(`${candidate.pathPrefix}/`),
  );
  if (!item) return null;

  const page = item.pages
    .filter((candidate) => path.startsWith(candidate.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return { item, page: page ?? item.pages[0] };
}

export interface NavigationSection {
  /** `undefined` en el grupo principal, que va sin encabezado. */
  title?: string;
  pages: NavigationPage[];
}

/** Las páginas agrupadas por `section`, las que no tienen ninguna primero. */
export function groupBySection(pages: NavigationPage[]): NavigationSection[] {
  const sections: NavigationSection[] = [{ title: undefined, pages: [] }];
  for (const page of pages) {
    let section = sections.find((s) => s.title === page.section);
    if (!section) {
      section = { title: page.section, pages: [] };
      sections.push(section);
    }
    section.pages.push(page);
  }
  return sections.filter((s) => s.pages.length > 0);
}
