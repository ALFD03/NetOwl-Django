import { usePage } from '@inertiajs/react';

import type { Permission } from '@/shared/types/auth';
import type { AppPageProps } from '@/shared/types/inertia';

export interface UsePermissionsReturn {
  /** Returns true when the current user can perform the requested action. */
  can: (permission: Permission) => boolean;

  /** Returns true when the current user has at least one requested permission. */
  canAny: (permissions: readonly Permission[]) => boolean;

  /** Returns true when the current user has every requested permission. */
  canAll: (permissions: readonly Permission[]) => boolean;

  /** True when the current authenticated user is a Django superuser. */
  isSuperuser: boolean;
}

/**
 * Centralized permission access for the React application.
 *
 * Components and pages should never read `user.profile.can_*` directly.
 * Use `can()`, `canAny()` or `canAll()` instead.
 *
 * Superusers automatically receive access to every known permission.
 */
export function usePermissions(): UsePermissionsReturn {
  const { props } = usePage<AppPageProps>();
  const user = props.auth?.user;
  const isSuperuser = user?.is_superuser ?? false;

  const can = (permission: Permission): boolean => {
    if (!user) return false;
    return isSuperuser || user.profile[permission];
  };

  const canAny = (permissions: readonly Permission[]): boolean => {
    return permissions.some(can);
  };

  const canAll = (permissions: readonly Permission[]): boolean => {
    return permissions.every(can);
  };

  return {
    can,
    canAny,
    canAll,
    isSuperuser,
  };
}
