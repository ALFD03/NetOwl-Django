/**
 * El estado de la pantalla de usuarios y grupos: qué formulario está abierto,
 * la búsqueda y las escrituras, con su aviso de error en el modal abierto.
 */

import { useMemo, useState, type FormEvent } from 'react';

import { useOnOpen } from '@/shared/hooks/useOnOpen';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { configApi } from '@/shared/lib/api/config';
import {
  DEFAULT_GROUP_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSIONS,
} from '@/shared/constants/permissions';
import type { StatusTone } from '@/shared/ui';

import type {
  ConfigManagementProps,
  EditableGroup,
  EditableUser,
  NewUserForm,
  PasswordForm,
  UserData,
} from '../types';

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.perms.map((permission) => permission.key),
);

export function useUserManagement({
  users = [],
  groups = [],
  grantable = {},
}: Pick<ConfigManagementProps, 'users' | 'groups' | 'grantable'>) {
  const { can } = usePermissions();
  const canCreate = can(PERMISSIONS.CREATE_USERS);
  const canEdit = can(PERMISSIONS.EDIT_USER_PERMISSIONS);
  const canChangeKey = can(PERMISSIONS.CHANGE_PASSWORDS);
  const canDelete = can(PERMISSIONS.DELETE_USERS);
  const canGroups = can(PERMISSIONS.MANAGE_GROUPS);

  /**
   * Lo que quien mira no tiene y la matriz editada no traía: no lo puede
   * conceder. Lo que ya estaba concedido sí se puede quitar.
   */
  const blockedFor = (prior: Record<string, boolean>) =>
    new Set(ALL_PERMISSIONS.filter((permKey) => !grantable[permKey] && !prior[permKey]));

  /**
   * Si la cuenta ve todas las unidades: el interruptor es de la matriz, así
   * que con grupo lo dice el grupo (la lista sigue siendo del usuario).
   */
  const allUnits = (groupId: number | string | null, granted: Record<string, boolean>) => {
    const matrix = groupId
      ? groups.find((group) => group.id === Number(groupId))?.permissions
      : granted;
    return Boolean(matrix?.[PERMISSIONS.VIEW_ALL_BUSINESS_UNITS]);
  };

  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [userToCreate, setUserToCreate] = useState<NewUserForm | null>(null);
  const [userToEdit, setUserToEdit] = useState<EditableUser | null>(null);
  const [userToChangePass, setUserToChangePass] = useState<PasswordForm | null>(null);
  const [groupToEdit, setGroupToEdit] = useState<EditableGroup | null>(null);
  const [deletingItem, setDeletingItem] = useState<{
    type: 'user' | 'group';
    id: number;
    name: string;
  } | null>(null);

  const [status, setStatus] = useState<{ type: StatusTone; text: string } | null>(null);
  // Abrir un formulario empieza de cero: el aviso que hubiera es de la acción anterior.
  const formOpen = Boolean(
    userToCreate || userToEdit || userToChangePass || groupToEdit || deletingItem,
  );
  useOnOpen(formOpen, () => setStatus(null));

  /** Ejecuta una escritura; si falla, el error queda en el modal abierto. */
  const run = async (action: () => Promise<unknown>, failure: string) => {
    setSaving(true);
    setStatus(null);
    try {
      await action();
      return true;
    } catch (err: unknown) {
      setStatus({ type: 'error', text: getApiErrorMessage(err, failure) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToCreate) return;
    if (await run(() => configApi.createUser(userToCreate), 'Error al crear usuario'))
      setUserToCreate(null);
  };

  const handleUpdateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;
    const ok = await run(
      () =>
        configApi.updateUserPermissions({
          user_id: userToEdit.id,
          role: userToEdit.role,
          group_id: userToEdit.group_id ? Number(userToEdit.group_id) : null,
          permissions: userToEdit.permissions,
          units: userToEdit.units,
        }),
      'Error al actualizar usuario',
    );
    if (ok) setUserToEdit(null);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToChangePass) return;
    if (
      await run(() => configApi.changePassword(userToChangePass), 'Error al cambiar contraseña')
    ) {
      setUserToChangePass(null);
      setStatus({
        type: 'success',
        text: `Contraseña de ${userToChangePass.username} actualizada.`,
      });
    }
  };

  const handleSaveGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupToEdit) return;
    const ok = await run(
      () =>
        configApi.saveGroup({
          group_id: groupToEdit.id || null,
          name: groupToEdit.name,
          description: groupToEdit.description,
          permissions: groupToEdit.permissions,
        }),
      'Error al guardar grupo',
    );
    if (ok) setGroupToEdit(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const ok = await run(
      () =>
        deletingItem.type === 'user'
          ? configApi.deleteUser(deletingItem.id)
          : configApi.deleteGroup(deletingItem.id),
      'Error al eliminar',
    );
    if (ok) setDeletingItem(null);
  };

  // Una sola búsqueda para las dos vistas: en cuentas mira nombre, rol y
  // grupo; en grupos, nombre y descripción.
  const term = search.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!term) return users;
    return users.filter((u: UserData) =>
      [u.username, u.role_label, u.group_name ?? 'individuales'].some((field) =>
        field.toLowerCase().includes(term),
      ),
    );
  }, [users, term]);
  const filteredGroups = useMemo(() => {
    if (!term) return groups;
    return groups.filter((g) =>
      [g.name, g.description].some((field) => field.toLowerCase().includes(term)),
    );
  }, [groups, term]);

  const newGroup = () =>
    setGroupToEdit({
      name: '',
      description: '',
      permissions: { ...DEFAULT_GROUP_PERMISSIONS },
    });

  return {
    canCreate,
    canEdit,
    canChangeKey,
    canDelete,
    canGroups,
    blockedFor,
    allUnits,
    activeTab,
    setActiveTab,
    search,
    setSearch,
    saving,
    userToCreate,
    setUserToCreate,
    userToEdit,
    setUserToEdit,
    userToChangePass,
    setUserToChangePass,
    groupToEdit,
    setGroupToEdit,
    deletingItem,
    setDeletingItem,
    status,
    handleCreateUser,
    handleUpdateUser,
    handleChangePassword,
    handleSaveGroup,
    handleConfirmDelete,
    filteredUsers,
    filteredGroups,
    newGroup,
  };
}
