import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/shared/layout/AppLayout';
import { NeonContainer } from '@/shared/ui';
import { Modal } from '@/shared/ui';
import { router } from '@inertiajs/react';
import { 
  Users, Shield, Plus, UserPlus
} from 'lucide-react';
import { configApi } from '@/shared/lib/api/config';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { DEFAULT_GROUP_PERMISSIONS } from '@/shared/constants/permissions';
import { ToggleGroup, SearchInput } from '@/shared/ui';
import { UsersTable } from '@/features/config/components/management/UsersTable';
import { GroupsGrid } from '@/features/config/components/management/GroupsGrid';
import { PermissionEditor } from '@/features/config/components/management/PermissionEditor';

import type {
  ConfigManagementProps, EditableGroup, EditableUser, GroupData, NewUserForm, PasswordForm, UserData,
} from '@/features/config/types';

export function ManagementView({ users = [], groups = [], roles = [] }: ConfigManagementProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [userToCreate, setUserToCreate] = useState<NewUserForm | null>(null);
  const [userToEdit, setUserToEdit] = useState<EditableUser | null>(null);
  const [userToChangePass, setUserToChangePass] = useState<PasswordForm | null>(null);
  const [groupToEdit, setGroupToEdit] = useState<EditableGroup | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'user' | 'group'; id: number; name: string } | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToCreate) return;
    setSaving(true);
    try {
      await configApi.createUser(userToCreate);
      setUserToCreate(null);
      router.reload();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Error al crear usuario'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;
    setSaving(true);
    try {
      await configApi.updateUserPermissions({
        user_id: userToEdit.id,
        role: userToEdit.role,
        group_id: userToEdit.group_id ? Number(userToEdit.group_id) : null,
        permissions: userToEdit.permissions
      });
      setUserToEdit(null);
      router.reload();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Error al actualizar usuario'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToChangePass) return;
    setSaving(true);
    try {
      await configApi.changePassword(userToChangePass);
      setUserToChangePass(null);
      alert('Contraseña actualizada correctamente');
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Error al cambiar contraseña'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupToEdit) return;
    setSaving(true);
    try {
      await configApi.saveGroup({
        group_id: groupToEdit.id || null,
        name: groupToEdit.name,
        description: groupToEdit.description,
        permissions: groupToEdit.permissions
      });
      setGroupToEdit(null);
      router.reload();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Error al guardar grupo'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    try {
      if (deletingItem.type === 'user') {
        await configApi.deleteUser(deletingItem.id);
      } else {
        await configApi.deleteGroup(deletingItem.id);
      }
      setDeletingItem(null);
      router.reload();
    } catch (err: unknown) {
      alert(getApiErrorMessage(err, 'Error al eliminar'));
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u: UserData) => 
      u.username.toLowerCase().includes(search.toLowerCase()) || 
      (u.group_name && u.group_name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [users, search]);

  return (
    <AppLayout title="Configuración de Permisos y Usuarios">
      
      {/* BARRA SUPERIOR DE CONTROL */}
      <div className="bg-surface-secondary border border-slate-800 rounded-3xl p-4 mb-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 bg-surface-primary p-1.5 rounded-2xl border border-slate-800">
          <ToggleGroup
            options={[
              { key: 'users', label: `Usuarios (${users.length})`, icon: Users },
              { key: 'groups', label: `Grupos (${groups.length})`, icon: Shield },
            ]}
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as 'users' | 'groups')}
          />
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'users' && (
            <SearchInput value={search} placeholder="Buscar usuario..." onChange={setSearch} />
          )}

          {activeTab === 'users' ? (
            <button
              onClick={() => setUserToCreate({
                username: '',
                password: '',
                role: 'viewer',
                group_id: groups[0]?.id || '',
                permissions: {}
              })}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <UserPlus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          ) : (
            <button
              onClick={() => setGroupToEdit({
                name: '',
                description: '',
                permissions: { ...DEFAULT_GROUP_PERMISSIONS }
              })}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Grupo</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'users' && (
        <UsersTable
          users={filteredUsers}
          onEdit={(user) => setUserToEdit({ ...user })}
          onChangePassword={(user) => setUserToChangePass({ user_id: user.id, username: user.username, password: '' })}
          onDelete={(user) => setDeletingItem({ type: 'user', id: user.id, name: user.username })}
        />
      )}

      {activeTab === 'groups' && (
        <GroupsGrid
          groups={groups}
          onEdit={(group) => setGroupToEdit({ ...group })}
          onDelete={(group) => setDeletingItem({ type: 'group', id: group.id, name: group.name })}
        />
      )}

      {/* MODAL 1: CREAR USUARIO */}
      <Modal isOpen={!!userToCreate} onClose={() => setUserToCreate(null)} title="Crear Nuevo Usuario" theme="green" size="md">
        {userToCreate && (
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">Usuario</label>
              <input
                className="w-full px-3 py-2 rounded-md bg-[#071122] border border-slate-800 text-white"
                value={userToCreate.username}
                onChange={(e) => setUserToCreate({ ...userToCreate, username: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-slate-400">Contraseña</label>
              <input
                type="password"
                className="w-full px-3 py-2 rounded-md bg-[#071122] border border-slate-800 text-white"
                value={userToCreate.password}
                onChange={(e) => setUserToCreate({ ...userToCreate, password: e.target.value })}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 px-4 py-2 rounded-xl text-white font-bold"
              >
                {saving ? 'Guardando...' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal isOpen={!!userToEdit} onClose={() => setUserToEdit(null)} title="Editar Usuario y Permisos" theme="blue" size="wide">
        {userToEdit && (
          <form onSubmit={handleUpdateUser} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input className="px-3 py-2 rounded-xl bg-[#071122] border border-slate-800 text-white" value={userToEdit.username} disabled />
              <select className="px-3 py-2 rounded-xl bg-[#071122] border border-slate-800 text-white" value={userToEdit.role} onChange={(e) => setUserToEdit({ ...userToEdit, role: e.target.value })}>
                {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select className="px-3 py-2 rounded-xl bg-[#071122] border border-slate-800 text-white" value={String(userToEdit.group_id ?? '')} onChange={(e) => setUserToEdit({ ...userToEdit, group_id: e.target.value })}>
                <option value="">Sin grupo</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            {userToEdit.group_id ? (
              <p className="text-xs text-amber-400">
                Este usuario pertenece a un grupo: sus permisos se heredan del grupo y no se editan aqui. Selecciona <strong>Sin grupo</strong> para asignar permisos individuales.
              </p>
            ) : null}
            <PermissionEditor
              permissions={userToEdit.permissions}
              onChange={(permissions) => setUserToEdit({ ...userToEdit, permissions })}
              disabled={Boolean(userToEdit.group_id)}
            />
            <div className="flex justify-end"><button type="submit" disabled={saving} className="bg-emerald-600 px-5 py-2.5 rounded-xl text-white font-bold">{saving ? 'Guardando...' : 'Guardar Cambios'}</button></div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!userToChangePass} onClose={() => setUserToChangePass(null)} title="Cambiar Contraseña" theme="yellow" size="md">
        {userToChangePass && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <p className="text-xs text-slate-400">Actualizando contraseña de <strong className="text-white">{userToChangePass.username}</strong>.</p>
            <input type="password" autoComplete="new-password" required className="w-full px-3 py-2 rounded-xl bg-[#071122] border border-slate-800 text-white" value={userToChangePass.password} onChange={(e) => setUserToChangePass({ ...userToChangePass, password: e.target.value })} placeholder="Nueva contraseña" />
            <div className="flex justify-end"><button type="submit" disabled={saving} className="bg-amber-500 px-5 py-2.5 rounded-xl text-surface-primary font-bold">{saving ? 'Actualizando...' : 'Cambiar Contraseña'}</button></div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!groupToEdit} onClose={() => setGroupToEdit(null)} title={groupToEdit?.id ? 'Editar Grupo' : 'Crear Grupo'} theme="blue" size="wide">
        {groupToEdit && (
          <form onSubmit={handleSaveGroup} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input required className="px-3 py-2 rounded-xl bg-[#071122] border border-slate-800 text-white" value={groupToEdit.name} onChange={(e) => setGroupToEdit({ ...groupToEdit, name: e.target.value })} placeholder="Nombre del grupo" />
              <input className="px-3 py-2 rounded-xl bg-[#071122] border border-slate-800 text-white" value={groupToEdit.description} onChange={(e) => setGroupToEdit({ ...groupToEdit, description: e.target.value })} placeholder="Descripción" />
            </div>
            <PermissionEditor permissions={groupToEdit.permissions} onChange={(permissions) => setGroupToEdit({ ...groupToEdit, permissions })} />
            <div className="flex justify-end"><button type="submit" disabled={saving} className="bg-emerald-600 px-5 py-2.5 rounded-xl text-white font-bold">{saving ? 'Guardando...' : 'Guardar Grupo'}</button></div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!deletingItem} onClose={() => setDeletingItem(null)} title="Confirmar eliminación" theme="red" size="sm">
        {deletingItem && (
          <div className="space-y-5">
            <p className="text-sm text-slate-300">¿Seguro que deseas eliminar <strong className="text-white">{deletingItem.name}</strong>? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2"><button onClick={() => setDeletingItem(null)} className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300">Cancelar</button><button onClick={handleConfirmDelete} className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold">Eliminar</button></div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}