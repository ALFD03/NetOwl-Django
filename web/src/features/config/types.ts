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
}

export interface GroupData {
  id: number;
  name: string;
  description: string;
  members_count: number;
  permissions: Record<string, boolean>;
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
}

/** Props Django passes to the user & group management page. */
export interface ConfigManagementProps {
  users: UserData[];
  groups: GroupData[];
  roles: [string, string][];
}
