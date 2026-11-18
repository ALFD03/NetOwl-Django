/** La pantalla de usuarios, grupos y permisos. */

import React, { useState, useMemo } from 'react';
import { useOnOpen } from '@/shared/hooks/useOnOpen';
import { AppLayout } from '@/shared/layout/AppLayout';
import { ActionMessage, Button, Modal, TextField, ToggleGroup, type StatusTone } from '@/shared/ui';
import {
  AlertTriangle, KeyRound, Lock, Plus, Search, Shield, ShieldCheck, User, UserPlus, Users,
} from 'lucide-react';
import { configApi } from '@/shared/lib/api/config';
import { getApiErrorMessage } from '@/shared/lib/api/client';
import {
  DEFAULT_GROUP_PERMISSIONS, DEFAULT_USER_PERMISSIONS, PERMISSION_GROUPS, PERMISSIONS,
} from '@/shared/constants/permissions';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { UsersTable } from '@/features/config/components/management/UsersTable';
import { GroupsGrid } from '@/features/config/components/management/GroupsGrid';
import { PermissionEditor } from '@/features/config/components/management/PermissionEditor';
import { UnitsEditor } from '@/features/config/components/management/UnitsEditor';
import { SelectField, ModalFooter } from '@/features/config/components/management/FormControls';

import {
  NO_UNITS,
  type ConfigManagementProps, type EditableGroup, type EditableUser, type NewUserForm, type PasswordForm,
  type UserData,
} from '@/features/config/types';

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.perms.map((permission) => permission.key));

export function ManagementView({
  users = [], groups = [], roles = [], grantable = {}, business_units = [], grantable_units = null,
}: ConfigManagementProps) {
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
    const matrix = groupId ? groups.find((group) => group.id === Number(groupId))?.permissions : granted;
    return Boolean(matrix?.[PERMISSIONS.VIEW_ALL_BUSINESS_UNITS]);
  };

  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [userToCreate, setUserToCreate] = useState<NewUserForm | null>(null);
  const [userToEdit, setUserToEdit] = useState<EditableUser | null>(null);
  const [userToChangePass, setUserToChangePass] = useState<PasswordForm | null>(null);
  const [groupToEdit, setGroupToEdit] = useState<EditableGroup | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'user' | 'group'; id: number; name: string } | null>(null);

  const [status, setStatus] = useState<{ type: StatusTone; text: string } | null>(null);
  // Abrir un formulario empieza de cero: el aviso que hubiera es de la acción anterior.
  const formOpen = Boolean(userToCreate || userToEdit || userToChangePass || groupToEdit || deletingItem);
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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToCreate) return;
    if (await run(() => configApi.createUser(userToCreate), 'Error al crear usuario')) setUserToCreate(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;
    const ok = await run(() => configApi.updateUserPermissions({
      user_id: userToEdit.id,
      role: userToEdit.role,
      group_id: userToEdit.group_id ? Number(userToEdit.group_id) : null,
      permissions: userToEdit.permissions,
      units: userToEdit.units,
    }), 'Error al actualizar usuario');
    if (ok) setUserToEdit(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToChangePass) return;
    if (await run(() => configApi.changePassword(userToChangePass), 'Error al cambiar contraseña')) {
      setUserToChangePass(null);
      setStatus({ type: 'success', text: `Contraseña de ${userToChangePass.username} actualizada.` });
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupToEdit) return;
    const ok = await run(() => configApi.saveGroup({
      group_id: groupToEdit.id || null,
      name: groupToEdit.name,
      description: groupToEdit.description,
      permissions: groupToEdit.permissions,
    }), 'Error al guardar grupo');
    if (ok) setGroupToEdit(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    const ok = await run(
      () => (deletingItem.type === 'user' ? configApi.deleteUser(deletingItem.id) : configApi.deleteGroup(deletingItem.id)),
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
    return groups.filter((g) => [g.name, g.description].some((field) => field.toLowerCase().includes(term)));
  }, [groups, term]);

  const newGroup = () => setGroupToEdit({
    name: '',
    description: '',
    permissions: { ...DEFAULT_GROUP_PERMISSIONS },
  });

  return (
    <AppLayout
      title="Usuarios y permisos"
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            options={[
              { key: 'users', label: `Usuarios (${users.length})`, icon: Users },
              { key: 'groups', label: `Grupos (${groups.length})`, icon: Shield },
            ]}
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as 'users' | 'groups')}
            className="min-w-0"
          />

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={activeTab === 'users' ? 'Buscar usuario, rol o grupo' : 'Buscar grupo'}
                className="w-full rounded-lg border border-slate-800 bg-surface-secondary py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-brand"
              />
            </label>

            {activeTab === 'users' ? canCreate && (
              <Button
                size="sm"
                icon={<UserPlus className="h-4 w-4" />}
                // Sin grupo y con la matriz minima. Antes preseleccionaba
                // `groups[0]`, asi que toda cuenta nueva heredaba la matriz del
                // primer grupo de la lista —el de administradores— sin que
                // nadie lo eligiera.
                onClick={() => setUserToCreate({
                  username: '',
                  password: '',
                  role: 'viewer',
                  group_id: '',
                  permissions: { ...DEFAULT_USER_PERMISSIONS },
                  units: NO_UNITS,
                })}
              >
                Nuevo usuario
              </Button>
            ) : canGroups && (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={newGroup}>
                Nuevo grupo
              </Button>
            )}
          </div>
        </div>
      }
    >
      <ActionMessage status={status} className="mb-4" icon={status?.type === 'error' ? <AlertTriangle /> : <ShieldCheck />} />
      {activeTab === 'users' && (
        <UsersTable
          users={filteredUsers}
          groups={groups}
          onEdit={canEdit ? (user) => setUserToEdit({ ...user, previous: { ...user.permissions }, previousUnits: user.units }) : null}
          onChangePassword={canChangeKey
            ? (user) => setUserToChangePass({ user_id: user.id, username: user.username, password: '' })
            : null}
          onDelete={canDelete ? (user) => setDeletingItem({ type: 'user', id: user.id, name: user.username }) : null}
        />
      )}

      {activeTab === 'groups' && (
        <GroupsGrid
          groups={filteredGroups}
          users={users}
          filtering={Boolean(term)}
          onCreate={canGroups ? newGroup : null}
          onEdit={canGroups ? (group) => setGroupToEdit({ ...group, previous: { ...group.permissions } }) : null}
          onDelete={canGroups ? (group) => setDeletingItem({ type: 'group', id: group.id, name: group.name }) : null}
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
                <SelectField
                  label="Rol"
                  value={userToCreate.role}
                  options={roles.map(([value, label]) => ({ value, label }))}
                  onChange={(role) => setUserToCreate({ ...userToCreate, role })}
                />
                <SelectField
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
                blocked={blockedFor(DEFAULT_USER_PERMISSIONS)}
              />
            )}

            {/* Las unidades son del usuario, no del grupo: se eligen siempre aquí. */}
            <UnitsEditor
              units={userToCreate.units}
              onChange={(units) => setUserToCreate({ ...userToCreate, units })}
              catalog={business_units}
              allUnits={allUnits(userToCreate.group_id, userToCreate.permissions)}
              grantable={grantable_units}
              previous={NO_UNITS}
            />

            <ModalFooter
              onCancel={() => setUserToCreate(null)}
              note="La contraseña se valida contra la política del servidor."
            >
              <Button type="submit" isLoading={saving} icon={<UserPlus className="h-4 w-4" />} size="sm">
                {saving ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </ModalFooter>
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
                <SelectField
                  label="Rol en el sistema"
                  value={userToEdit.role}
                  options={roles.map(([value, label]) => ({ value, label }))}
                  onChange={(role) => setUserToEdit({ ...userToEdit, role })}
                />
                <SelectField
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
              blocked={blockedFor(userToEdit.previous ?? {})}
            />
            {/* Las unidades son del usuario, no del grupo: se editan aunque tenga uno. */}
            <UnitsEditor
              units={userToEdit.units}
              onChange={(units) => setUserToEdit({ ...userToEdit, units })}
              catalog={business_units}
              allUnits={allUnits(userToEdit.group_id, userToEdit.permissions)}
              grantable={grantable_units}
              previous={userToEdit.previousUnits ?? NO_UNITS}
            />

            <ModalFooter
              onCancel={() => setUserToEdit(null)}
              note={userToEdit.group_id ? 'Se guardarán el rol, el grupo y las unidades de negocio.' : 'Se guarda la matriz completa tal y como se ve.'}
            >
              <Button type="submit" isLoading={saving} icon={<ShieldCheck className="h-4 w-4" />} size="sm">
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </ModalFooter>
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
            <ModalFooter onCancel={() => setUserToChangePass(null)}>
              <Button
                type="submit"
                isLoading={saving}
                size="sm"
                icon={<KeyRound className="h-4 w-4" />}
                className="bg-amber-500 text-surface-primary shadow-amber-600/20 hover:bg-amber-400"
              >
                {saving ? 'Actualizando...' : 'Cambiar Contraseña'}
              </Button>
            </ModalFooter>
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
              blocked={blockedFor(groupToEdit.previous ?? {})}
            />

            <ModalFooter
              onCancel={() => setGroupToEdit(null)}
              note="Cada cuenta del grupo recibe esta matriz."
            >
              <Button type="submit" isLoading={saving} icon={<Shield className="h-4 w-4" />} size="sm">
                {saving ? 'Guardando...' : 'Guardar Grupo'}
              </Button>
            </ModalFooter>
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
            <ModalFooter onCancel={() => setDeletingItem(null)}>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                icon={<AlertTriangle className="h-4 w-4" />}
              >
                Eliminar
              </Button>
            </ModalFooter>
          </div>
        )}
      </Modal>

    </AppLayout>
  );
}