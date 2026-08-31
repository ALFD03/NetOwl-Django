import type { LucideIcon } from 'lucide-react';
import type { Permission } from './auth';

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
  href: string;
  icon: LucideIcon;
  pathPrefix: string;
  permission: Permission;
}
