/** La pantalla de usuarios, grupos y permisos. */

import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/shared/layout/AppLayout';
import { Button, Modal, SearchInput, TextField, ToggleGroup } from '@/shared/ui';
import { router } from '@inertiajs/react';
import {
  AlertTriangle, KeyRound, Lock, Plus, Shield, ShieldCheck, User, UserPlus, Users,
} from 'lucide-react';
import { configApi } from '@/shared/lib/api/config';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import { DEFAULT_GROUP_PERMISSIONS, DEFAULT_USER_PERMISSIONS } from '@/shared/constants/permissions';
import { UsersTable } from '@/features/config/components/management/UsersTable';
import { GroupsGrid } from '@/features/config/components/management/GroupsGrid';
import { PermissionEditor } from '@/features/config/components/management/PermissionEditor';
import { CampoSelect, PieDeModal } from '@/features/config/components/management/FormControls';

import type {
  ConfigManagementProps, EditableGroup, EditableUser, NewUserForm, PasswordForm, UserData,
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
    <AppLayout
      title="Configuración de Permisos y Usuarios"
      toolbar={
        // Barra superior de control: pestanas, busqueda y alta de usuarios/grupos.
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
                // Sin grupo y con la matriz minima. Antes preseleccionaba
                // `groups[0]`, asi que toda cuenta nueva heredaba la matriz del
                // primer grupo de la lista —el de administradores— sin que
                // nadie lo eligiera.
                onClick={() => setUserToCreate({
                  username: '',
                  password: '',
                  role: 'viewer',
                  group_id: '',
                  permissions: { ...DEFAULT_USER_PERMISSIONS }
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
      }
    >
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

      {/* Alta de cuenta: los datos de acceso, el encuadre (rol y grupo) y la
          matriz, en ese orden. El rol y el grupo se elegian antes en una
          segunda visita al modal de edicion, aunque el endpoint ya los aceptaba
          al crear. */}
      <Modal
        isOpen={!!userToCreate}
        onClose={() => setUserToCreate(null)}
        title="Crear Nuevo Usuario"
        subtitle="Datos de acceso y permisos iniciales"
        icon={<UserPlus className="h-5 w-5 text-emerald-400" />}
        theme="green"
        size="xl"
      >
        {userToCreate && (
          <form onSubmit={handleCreateUser} className="space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-surface-primary/80 p-4">
              <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                Identidad y acceso
              </h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <TextField
                  label="Usuario"
                  icon={<User />}
                  required
                  autoComplete="off"
                  placeholder="nombre.apellido"
                  value={userToCreate.username}
                  onChange={(e) => setUserToCreate({ ...userToCreate, username: e.target.value })}
                />
                <TextField
                  label="Contraseña"
                  type="password"
                  icon={<KeyRound />}
                  required
                  autoComplete="new-password"
                  placeholder="Mínimo según la política"
                  value={userToCreate.password}
                  onChange={(e) => setUserToCreate({ ...userToCreate, password: e.target.value })}
                />
                <CampoSelect
                  label="Rol"
                  value={userToCreate.role}
                  options={roles.map(([value, label]) => ({ value, label }))}
                  onChange={(role) => setUserToCreate({ ...userToCreate, role })}
                />
                <CampoSelect
                  label="Grupo"
                  value={String(userToCreate.group_id ?? '')}
                  options={[
                    { value: '', label: 'Sin grupo' },
                    ...groups.map((group) => ({ value: String(group.id), label: group.name })),
                  ]}
                  onChange={(group_id) => setUserToCreate({ ...userToCreate, group_id })}
                  hint={userToCreate.group_id ? 'Hereda la matriz del grupo.' : 'Permisos individuales.'}
                />
              </div>
            </section>

            {userToCreate.group_id ? (
              <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-xs text-amber-300">
                <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  La cuenta heredará la matriz del grupo. Elige <strong>Sin grupo</strong> para concederle
                  permisos propios.
                </span>
              </p>
            ) : (
              <PermissionEditor
                permissions={userToCreate.permissions}
                onChange={(permissions) => setUserToCreate({ ...userToCreate, permissions })}
              />
            )}

            <PieDeModal
              onCancel={() => setUserToCreate(null)}
              nota="La contraseña se valida contra la política del servidor."
            >
              <Button type="submit" isLoading={saving} icon={<UserPlus className="h-4 w-4" />} size="sm">
                {saving ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </PieDeModal>
          </form>
        )}
      </Modal>

      {/* Edicion: mismo encuadre que el alta, para que la pantalla se lea igual
          en los dos sentidos. */}
      <Modal
        isOpen={!!userToEdit}
        onClose={() => setUserToEdit(null)}
        title="Editar Usuario y Permisos"
        subtitle={userToEdit?.username}
        icon={<ShieldCheck className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="xl"
      >
        {userToEdit && (
          <form onSubmit={handleUpdateUser} className="space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-surface-primary/80 p-4">
              <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                Identidad y encuadre
              </h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <TextField
                  label="Usuario"
                  icon={<User />}
                  value={userToEdit.username}
                  disabled
                  title="El nombre de la cuenta no se cambia"
                />
                <CampoSelect
                  label="Rol en el sistema"
                  value={userToEdit.role}
                  options={roles.map(([value, label]) => ({ value, label }))}
                  onChange={(role) => setUserToEdit({ ...userToEdit, role })}
                />
                <CampoSelect
                  label="Grupo de permisos"
                  value={String(userToEdit.group_id ?? '')}
                  options={[
                    { value: '', label: 'Sin grupo' },
                    ...groups.map((group) => ({ value: String(group.id), label: group.name })),
                  ]}
                  onChange={(group_id) => setUserToEdit({ ...userToEdit, group_id })}
                />
              </div>
            </section>

            {userToEdit.group_id ? (
              <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-xs text-amber-300">
                <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Este usuario pertenece a un grupo: sus permisos se heredan del grupo y no se editan aquí.
                  Selecciona <strong>Sin grupo</strong> para asignar permisos individuales.
                </span>
              </p>
            ) : null}

            <PermissionEditor
              permissions={userToEdit.permissions}
              onChange={(permissions) => setUserToEdit({ ...userToEdit, permissions })}
              disabled={Boolean(userToEdit.group_id)}
            />

            <PieDeModal
              onCancel={() => setUserToEdit(null)}
              nota={userToEdit.group_id ? 'Solo se guardarán el rol y el grupo.' : 'Se guarda la matriz completa tal y como se ve.'}
            >
              <Button type="submit" isLoading={saving} icon={<ShieldCheck className="h-4 w-4" />} size="sm">
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </PieDeModal>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={!!userToChangePass}
        onClose={() => setUserToChangePass(null)}
        title="Cambiar Contraseña"
        subtitle={userToChangePass?.username}
        icon={<KeyRound className="h-5 w-5 text-amber-400" />}
        theme="yellow"
        size="md"
      >
        {userToChangePass && (
          <form onSubmit={handleChangePassword} className="space-y-5">
            <p className="rounded-2xl border border-slate-800 bg-surface-primary/80 px-4 py-3 text-xs text-slate-400">
              Actualizando la contraseña de <strong className="text-white">{userToChangePass.username}</strong>.
              La sesión que tenga abierta no se cierra.
            </p>
            <TextField
              label="Nueva contraseña"
              type="password"
              icon={<KeyRound />}
              autoComplete="new-password"
              required
              value={userToChangePass.password}
              onChange={(e) => setUserToChangePass({ ...userToChangePass, password: e.target.value })}
            />
            <PieDeModal onCancel={() => setUserToChangePass(null)}>
              <Button
                type="submit"
                isLoading={saving}
                size="sm"
                icon={<KeyRound className="h-4 w-4" />}
                className="bg-amber-500 text-surface-primary shadow-amber-600/20 hover:bg-amber-400"
              >
                {saving ? 'Actualizando...' : 'Cambiar Contraseña'}
              </Button>
            </PieDeModal>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={!!groupToEdit}
        onClose={() => setGroupToEdit(null)}
        title={groupToEdit?.id ? 'Editar Grupo' : 'Crear Grupo'}
        subtitle={groupToEdit?.id ? groupToEdit.name : 'Una matriz reutilizable para varias cuentas'}
        icon={<Shield className="h-5 w-5 text-sky-400" />}
        theme="blue"
        size="xl"
      >
        {groupToEdit && (
          <form onSubmit={handleSaveGroup} className="space-y-5">
            <section className="rounded-2xl border border-slate-800 bg-surface-primary/80 p-4">
              <h4 className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                Identificación del grupo
              </h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <TextField
                  label="Nombre"
                  icon={<Shield />}
                  required
                  placeholder="Analistas de CRM"
                  value={groupToEdit.name}
                  onChange={(e) => setGroupToEdit({ ...groupToEdit, name: e.target.value })}
                />
                <TextField
                  label="Descripción"
                  placeholder="Para qué existe este grupo"
                  value={groupToEdit.description}
                  onChange={(e) => setGroupToEdit({ ...groupToEdit, description: e.target.value })}
                />
              </div>
            </section>

            <PermissionEditor
              permissions={groupToEdit.permissions}
              onChange={(permissions) => setGroupToEdit({ ...groupToEdit, permissions })}
            />

            <PieDeModal
              onCancel={() => setGroupToEdit(null)}
              nota="Cada cuenta del grupo recibe esta matriz."
            >
              <Button type="submit" isLoading={saving} icon={<Shield className="h-4 w-4" />} size="sm">
                {saving ? 'Guardando...' : 'Guardar Grupo'}
              </Button>
            </PieDeModal>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={!!deletingItem}
        onClose={() => setDeletingItem(null)}
        title="Confirmar eliminación"
        subtitle={deletingItem?.type === 'group' ? 'Grupo de permisos' : 'Cuenta de usuario'}
        icon={<AlertTriangle className="h-5 w-5 text-rose-400" />}
        theme="red"
        size="sm"
      >
        {deletingItem && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                {deletingItem.type === 'group' ? 'Se eliminará el grupo' : 'Se eliminará la cuenta'}
              </p>
              <p className="mt-1 text-lg font-black text-white">{deletingItem.name}</p>
            </div>
            <p className="text-xs text-slate-400">
              {deletingItem.type === 'group'
                ? 'Las cuentas que pertenezcan a él se quedan sin grupo, conservando la matriz que tuvieran.'
                : 'La cuenta deja de poder entrar. Esta acción no se puede deshacer.'}
            </p>
            <PieDeModal onCancel={() => setDeletingItem(null)}>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                Eliminar
              </Button>
            </PieDeModal>
          </div>
        )}
      </Modal>

    </AppLayout>
  );
}