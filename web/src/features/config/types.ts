/** Tipos de la pantalla de usuarios, grupos y permisos. */

export interface UserData {
  id: number;
  username: string;
  role: string;
  role_display: string;
  group_id: number | null;
  group_name?: string | null;
  is_superuser: boolean;
  permissions: Record<string, boolean>;
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
}

export type EditableUser = Omit<UserData, 'group_id'> & {
  group_id: number | string | null;
  /** La matriz al abrir el editor: lo que ya tenía se puede quitar aunque quien edita no lo tenga. */
  previa?: Record<string, boolean>;
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
  previa?: Record<string, boolean>;
}

/** Props Django passes to the user & group management page. */
export interface ConfigManagementProps {
  users: UserData[];
  groups: GroupData[];
  roles: [string, string][];
  /** Los permisos que tiene quien mira: solo esos puede conceder. */
  concedibles: Record<string, boolean>;
}
