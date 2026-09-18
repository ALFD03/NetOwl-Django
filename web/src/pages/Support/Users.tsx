/**
 * Página Inertia `Support/Users` (`/support/users/`).
 *
 * Mantiene el directorio de quien puede crear o tener asignado un ticket y, en
 * su primera pestaña, quién falta: nombres que ya están en los tickets
 * importados y que el directorio no reconoce.
 */

import { SupportUsuariosView } from '@/features/support/components/usuarios/SupportUsuariosView';
import type { SupportUsersProps } from '@/features/support/types';

export default function SupportUsers(props: SupportUsersProps) {
  return <SupportUsuariosView {...props} />;
}
