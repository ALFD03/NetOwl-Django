/** Tipos del registro de navegación. */

import type { LucideIcon } from 'lucide-react';
import type { Permission } from './auth';

/** Una página de un módulo: una hoja del árbol del sidebar. */
export interface NavigationPage {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Un permiso, o varios de los que basta con uno (OR). */
  permission?: Permission | readonly Permission[];
  /**
   * Grupo dentro del módulo (Reportes, Configuración…). Las páginas sin
   * sección van primero y sin encabezado; las demás se agrupan en el orden en
   * que aparecen.
   */
  section?: string;
}

/** Un módulo: una rama del árbol del sidebar. */
export interface AppNavigationItem {
  module: string;
  name: string;
  icon: LucideIcon;
  pathPrefix: string;
  /** Permiso de entrada al módulo; cada página puede pedir además el suyo. */
  permission: Permission;
  pages: NavigationPage[];
}
