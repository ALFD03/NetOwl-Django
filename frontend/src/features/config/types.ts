/** Tipos de la pantalla de usuarios, grupos y permisos. */

import type { UnitsSelection } from '@/shared/types/auth';

export type { UnitsSelection };

export const NO_UNITS: UnitsSelection = { ids: [], rf: false };

export interface BusinessUnit {
  id: number;
  name: string;
}

export interface UserData {
  id: number;
  username: string;
  role: string;
  role_label: string;
  group_id: number | null;
  group_name?: string | null;
  is_superuser: boolean;
  permissions: Record<string, boolean>;
  units: UnitsSelection;
  /** Si quien mira tiene rango para tocar esta cuenta (no es la suya ni una con más permisos). */
  editable: boolean;
}

export interface GroupData {
  id: number;
  name: string;
  description: string;
  members_count: number;
  permissions: Record<string, boolean>;
  /** Falso para el grupo propio de quien mira: editarlo sería concederse permisos. */
  editable: boolean;
}

export interface NewUserForm {
  username: string;
  password: string;
  role: string;
  group_id: number | string;
  permissions: Record<string, boolean>;
  units: UnitsSelection;
}

export type EditableUser = Omit<UserData, 'group_id'> & {
  group_id: number | string | null;
  /** La matriz al abrir el editor: lo que ya tenía se puede quitar aunque quien edita no lo tenga. */
  previous?: Record<string, boolean>;
  /** Las unidades al abrir el editor, por la misma razón que `previa`. */
  previousUnits?: UnitsSelection;
};

export interface PasswordForm {
  user_id: number;
  username: string;
  password: string;
}

export interface EditableGroup {
  id?: number;
  name: string;
  description: string;
  permissions: Record<string, boolean>;
  /** Ver `EditableUser.previa`. */
  previous?: Record<string, boolean>;
}

/** Props Django passes to the user & group management page. */
export interface ConfigManagementProps {
  users: UserData[];
  groups: GroupData[];
  roles: [string, string][];
  /** Los permisos que tiene quien mira: solo esos puede conceder. */
  grantable: Record<string, boolean>;
  /** El catálogo de unidades de negocio. */
  business_units: BusinessUnit[];
  /** Las unidades que puede conceder quien mira; `null` si las ve todas. */
  grantable_units: UnitsSelection | null;
}
