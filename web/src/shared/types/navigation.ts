/** Tipos del registro de navegación. */

import type { LucideIcon } from 'lucide-react';
import type { Permission } from './auth';
import type { ModuleKey } from '@/shared/constants/navigation';

export interface NavigationTab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
}

export interface ModuleNavigation {
  title: string;
  icon: LucideIcon;
  tabs: NavigationTab[];
}

export interface AppNavigationItem {
  name: string;
  icon: LucideIcon;
  pathPrefix: string;
  permission: Permission;
  /**
   * Module whose tabs this entry opens. The destination is resolved to the
   * first tab the user can actually see, so a user who holds the module
   * permission but not the permission of its first tab still gets in.
   */
  module: ModuleKey;
}
