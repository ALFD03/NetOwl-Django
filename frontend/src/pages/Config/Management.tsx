/** Página Inertia `Config/Management` (`/auth/users/`): usuarios, grupos y permisos. */

import { ManagementView } from '@/features/config/components/ManagementView';
import type { ConfigManagementProps } from '@/features/config/types';

export default function ConfigManagement(props: ConfigManagementProps) {
  return <ManagementView {...props} />;
}
