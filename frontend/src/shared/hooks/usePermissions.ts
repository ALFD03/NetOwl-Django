/**
 * Permisos de la cuenta actual. Los componentes nunca leen la matriz directamente.
 */

import { useAuth } from '@/shared/auth/AuthContext';
import type { Permission } from '@/shared/types/auth';

export interface UsePermissionsReturn {
  can: (permission: Permission) => boolean;
  /** Al menos uno. */
  canAny: (permissions: readonly Permission[]) => boolean;
  /** Todos. */
  canAll: (permissions: readonly Permission[]) => boolean;
  isSuperuser: boolean;
}

export function usePermissions(): UsePermissionsReturn {
  const { user } = useAuth();
  const isSuperuser = user?.is_superuser ?? false;
  const can = (permission: Permission) => Boolean(user && (isSuperuser || user.permissions[permission]));
  return {
    can,
    canAny: (permissions) => permissions.some(can),
    canAll: (permissions) => permissions.every(can),
    isSuperuser,
  };
}
