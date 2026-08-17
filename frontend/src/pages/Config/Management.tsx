import React, { useState, useMemo } from 'react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Modal } from '@/components/UI/Modal';
import { router } from '@inertiajs/react';
import { 
  Users, Shield, ShieldCheck, Key, Trash2, Plus, Settings2, 
  UserPlus, ShieldAlert
} from 'lucide-react';
import axios from 'axios';

interface UserData {
  id: number;
  username: string;
  role: string;
  role_display: string;
  group_id?: number | null;
  group_name?: string | null;
  is_superuser: boolean;
  permissions: Record<string, boolean>;
}

interface GroupData {
  id: number;
  name: string;
  description: string;
  members_count: number;
  permissions: Record<string, boolean>;
}

interface Props {
  users: UserData[];
  groups: GroupData[];
  roles: [string, string][];
}

// DEFINICIÓN DE PERMISOS DISPONIBLES AGRUPADOS
const PERMISSION_GROUPS = [
  {
    category: 'Módulos Principales (Navegación)',
    perms: [
      { key: 'can_view_subscriptions', label: 'Módulo Subscriptions' },
      { key: 'can_view_crm', label: 'Módulo CRM Analytics' },
      { key: 'can_view_support', label: 'Módulo Technical Support' },
      { key: 'can_view_imports', label: 'Módulo de Importaciones' },
    ]
  },
  {
    category: 'Métricas de Subscriptions',
    perms: [
      { key: 'can_view_subs_analytics', label: 'Ver Subscriptions Analytics' },
      { key: 'can_view_subs_results', label: 'Ver Subscriptions Results' },
      { key: 'can_view_subs_lifetime', label: 'Ver Life Time Cycle' },
      { key: 'can_view_subs_sales', label: 'Ver Sales Report & Business Units' },
      { key: 'can_view_eta', label: 'Ver Reporte Regulatorio ETA' },
    ]
  },
  {
    category: 'Métricas de CRM & Support',
    perms: [
      { key: 'can_view_crm_analytics', label: 'Ver CRM Analytics' },
      { key: 'can_view_crm_results', label: 'Ver CRM Results' },
      { key: 'can_view_support_analytics', label: 'Ver Support Analytics' },
      { key: 'can_view_support_results', label: 'Ver Support Results' },
    ]
  },
  {
    category: 'Acciones & Privilegios Especiales',
    perms: [
      { key: 'can_import_data', label: 'Importar archivos CSV' },
      { key: 'can_run_calculations', label: 'Ejecutar Cálculos y Motores de Churn' },
      { key: 'can_run_lifetime', label: 'Ejecutar Motor Kaplan-Meier' },
      { key: 'can_manage_eta', label: 'Administrar Maestro ETA' },
      { key: 'can_manage_users', label: 'Administrar Usuarios y Seguridad' },
    ]
  }
];

export default function ConfigManagement({ users = [], groups = [], roles = [] }: Props) {
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // ESTADOS DE MODALES
  const [userToCreate, setUserToCreate] = useState<any | null>(null);
  const [userToEdit, setUserToEdit] = useState<any | null>(null);
  const [userToChangePass, setUserToChangePass] = useState<any | null>(null);
  const [groupToEdit, setGroupToEdit] = useState<any | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'user' | 'group'; id: number; name: string } | null>(null);

  // --- 1. CREAR USUARIO ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/auth/api/users/create/', userToCreate);
      setUserToCreate(null);
      router.reload();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al crear usuario');
    } finally {
      setSaving(false);
    }
  };

  // --- 2. EDITAR USUARIO ---
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/auth/api/users/update-permissions/', {
        user_id: userToEdit.id,
        role: userToEdit.role,
        group_id: userToEdit.group_id ? Number(userToEdit.group_id) : null,
        ...userToEdit.permissions
      });
      setUserToEdit(null);
      router.reload();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al actualizar usuario');
    } finally {
      setSaving(false);
    }
  };

  // --- 3. CAMBIAR CONTRASEÑA ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/auth/api/users/change-password/', userToChangePass);
      setUserToChangePass(null);
      alert('Contraseña actualizada correctamente');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al cambiar contraseña');
    } finally {
      setSaving(false);
    }
  };

  // --- 4. GUARDAR GRUPO ---
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post('/auth/api/groups/save/', {
        group_id: groupToEdit.id || null,
        name: groupToEdit.name,
        description: groupToEdit.description,
        ...groupToEdit.permissions
      });
      setGroupToEdit(null);
      router.reload();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al guardar grupo');
    } finally {
      setSaving(false);
    }
  };

  // --- 5. ELIMINAR REGISTRO ---
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    try {
      if (deletingItem.type === 'user') {
        await axios.post('/auth/api/users/delete/', { user_id: deletingItem.id });
      } else {
        await axios.post('/auth/api/groups/delete/', { group_id: deletingItem.id });
      }
      setDeletingItem(null);
      router.reload();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Error al eliminar');
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
      <div className="bg-surface-secondary border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        
        {/* PESTAÑAS */}
        <div className="flex gap-2 bg-[#0b1326] p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'users' ? 'bg-brand text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuarios ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'groups' ? 'bg-brand text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Grupos de Permisos ({groups.length})</span>
          </button>
        </div>

        {/* ACCIONES Y BÚSQUEDA */}
        <div className="flex items-center gap-3">
          {activeTab === 'users' && (
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#0b1326] border border-slate-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-brand"
            />
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg"
            >
              <UserPlus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          ) : (
            <button
              onClick={() => setGroupToEdit({
                name: '',
                description: '',
                permissions: {
                  can_view_subscriptions: true,
                  can_view_crm: true,
                  can_view_support: true,
                  can_view_imports: true,
                }
              })}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Grupo</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. VISTA DE USUARIOS */}
      {activeTab === 'users' && (
        <div className="bg-surface-secondary border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 font-black uppercase">
              <tr>
                <th className="p-4">Usuario</th>
                <th className="p-4">Rol en Sistema</th>
                <th className="p-4">Grupo Asignado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredUsers.map((u: UserData) => (
                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{u.username}</span>
                      {u.is_superuser && (
                        <span className="bg-brand/20 text-brand px-2 py-0.5 rounded-full text-[9px] font-black uppercase">
                          Superuser
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-slate-800 px-3 py-1 rounded-lg text-slate-300 font-semibold text-[11px]">
                      {u.role_display}
                    </span>
                  </td>
                  <td className="p-4">
                    {u.group_name ? (
                      <span className="text-brand font-bold inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" /> {u.group_name}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Personalizado</span>
                    )}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => setUserToEdit({ ...u })}
                      className="p-2 bg-slate-800 hover:bg-brand hover:text-white rounded-xl text-slate-400 transition-colors"
                      title="Editar Permisos y Rol"
                    >
                      <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setUserToChangePass({ user_id: u.id, username: u.username, password: '' })}
                      className="p-2 bg-slate-800 hover:bg-amber-500 hover:text-[#0b1326] rounded-xl text-slate-400 transition-colors"
                      title="Cambiar Contraseña"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    {!u.is_superuser && (
                      <button
                        onClick={() => setDeletingItem({ type: 'user', id: u.id, name: u.username })}
                        className="p-2 bg-slate-800 hover:bg-rose-600 hover:text-white rounded-xl text-slate-400 transition-colors"
                        title="Eliminar Usuario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. VISTA DE GRUPOS DE PERMISOS */}
      {activeTab === 'groups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((grp: GroupData) => (
            <div key={grp.id} className="bg-surface-secondary border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-brand" />
                    <h4 className="font-bold text-white text-sm">{grp.name}</h4>
                  </div>
                  <span className="text-[10px] font-bold bg-brand/10 text-brand px-2.5 py-1 rounded-full">
                    {grp.members_count} miembro{grp.members_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4 min-h-[32px]">{grp.description || 'Sin descripción.'}</p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setGroupToEdit({ ...grp })}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-brand text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Editar
                </button>
                <button
                  onClick={() => setDeletingItem({ type: 'group', id: grp.id, name: grp.name })}
                  className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: CREAR USUARIO */}
      <Modal isOpen={!!userToCreate} onClose={() => setUserToCreate(null)} title="Crear Nuevo Usuario" size="md">
        {userToCreate && (
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Nombre de Usuario</label>
              <input
                type="text"
                required
                value={userToCreate.username}
                onChange={(e) => setUserToCreate({ ...userToCreate, username: e.target.value })}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Contraseña Inicial</label>
              <input
                type="password"
                required
                minLength={8}
                value={userToCreate.password}
                onChange={(e) => setUserToCreate({ ...userToCreate, password: e.target.value })}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Rol</label>
                <select
                  value={userToCreate.role}
                  onChange={(e) => setUserToCreate({ ...userToCreate, role: e.target.value })}
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  {roles.map(([rKey, rLabel]: [string, string]) => (
                    <option key={rKey} value={rKey}>{rLabel}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Grupo de Permisos</label>
                <select
                  value={userToCreate.group_id}
                  onChange={(e) => setUserToCreate({ ...userToCreate, group_id: e.target.value })}
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="">Personalizado (Sin Grupo)</option>
                  {groups.map((g: GroupData) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToCreate(null)}
                className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-brand text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg"
              >
                Crear Usuario
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 2: EDITAR USUARIO Y MATRIZ DE PERMISOS */}
      <Modal isOpen={!!userToEdit} onClose={() => setUserToEdit(null)} title={`Configuración: ${userToEdit?.username}`} size="xl">
        {userToEdit && (
          <form onSubmit={handleUpdateUser} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Rol</label>
                <select
                  value={userToEdit.role}
                  onChange={(e) => setUserToEdit({ ...userToEdit, role: e.target.value })}
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  {roles.map(([rKey, rLabel]: [string, string]) => (
                    <option key={rKey} value={rKey}>{rLabel}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Grupo de Permisos</label>
                <select
                  value={userToEdit.group_id || ''}
                  onChange={(e) => {
                    const gid = e.target.value ? Number(e.target.value) : null;
                    const selectedGrp = groups.find((g: GroupData) => g.id === gid);
                    setUserToEdit({
                      ...userToEdit,
                      group_id: gid,
                      permissions: selectedGrp ? { ...selectedGrp.permissions } : userToEdit.permissions
                    });
                  }}
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                >
                  <option value="">Personalizado (Ajuste manual abajo)</option>
                  {groups.map((g: GroupData) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* MATRIZ DE PERMISOS GRANULARES */}
            <div className="space-y-4 pt-4 border-t border-slate-800 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
              <h5 className="text-xs font-black text-slate-400 uppercase tracking-wider">
                Matriz de Permisos {userToEdit.group_id && '(Heredada del Grupo)'}
              </h5>

              {PERMISSION_GROUPS.map((pg) => (
                <div key={pg.category} className="bg-[#0b1326] p-4 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-[11px] font-black text-brand uppercase tracking-wider">{pg.category}</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pg.perms.map((p) => (
                      <label 
                        key={p.key}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          userToEdit.permissions[p.key]
                            ? 'bg-brand/10 border-brand/40 text-white font-bold'
                            : 'bg-surface-tertiary/40 border-slate-800 text-slate-400'
                        } ${userToEdit.group_id ? 'pointer-events-none opacity-80' : ''}`}
                      >
                        <span>{p.label}</span>
                        <input
                          type="checkbox"
                          disabled={!!userToEdit.group_id}
                          checked={Boolean(userToEdit.permissions[p.key])}
                          onChange={(e) => setUserToEdit({
                            ...userToEdit,
                            permissions: { ...userToEdit.permissions, [p.key]: e.target.checked }
                          })}
                          className="rounded text-brand"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToEdit(null)}
                className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-brand text-white px-8 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 3: CAMBIAR CONTRASEÑA */}
      <Modal isOpen={!!userToChangePass} onClose={() => setUserToChangePass(null)} title={`Restablecer Clave: ${userToChangePass?.username}`} size="sm">
        {userToChangePass && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Nueva Contraseña</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={userToChangePass.password}
                onChange={(e) => setUserToChangePass({ ...userToChangePass, password: e.target.value })}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              />
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToChangePass(null)}
                className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-amber-500 text-[#0b1326] px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-amber-400"
              >
                Actualizar Clave
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 4: CREAR / EDITAR GRUPO DE PERMISOS */}
      <Modal isOpen={!!groupToEdit} onClose={() => setGroupToEdit(null)} title="Plantilla de Grupo de Permisos" size="xl">
        {groupToEdit && (
          <form onSubmit={handleSaveGroup} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Nombre del Grupo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Analistas Senior"
                  value={groupToEdit.name}
                  onChange={(e) => setGroupToEdit({ ...groupToEdit, name: e.target.value })}
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Descripción</label>
                <input
                  type="text"
                  placeholder="Ej: Acceso total a reportes y cálculos"
                  value={groupToEdit.description}
                  onChange={(e) => setGroupToEdit({ ...groupToEdit, description: e.target.value })}
                  className="w-full bg-surface-tertiary border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
            </div>

            {/* MATRIZ DE PERMISOS DEL GRUPO */}
            <div className="space-y-4 pt-4 border-t border-slate-800 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
              <h5 className="text-xs font-black text-slate-400 uppercase tracking-wider">
                Privilegios Asignados a este Grupo
              </h5>

              {PERMISSION_GROUPS.map((pg) => (
                <div key={pg.category} className="bg-[#0b1326] p-4 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-[11px] font-black text-brand uppercase tracking-wider">{pg.category}</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pg.perms.map((p) => (
                      <label 
                        key={p.key}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          groupToEdit.permissions[p.key]
                            ? 'bg-brand/10 border-brand/40 text-white font-bold'
                            : 'bg-surface-tertiary/40 border-slate-800 text-slate-400'
                        }`}
                      >
                        <span>{p.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(groupToEdit.permissions[p.key])}
                          onChange={(e) => setGroupToEdit({
                            ...groupToEdit,
                            permissions: { ...groupToEdit.permissions, [p.key]: e.target.checked }
                          })}
                          className="rounded text-brand"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setGroupToEdit(null)}
                className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-brand text-white px-8 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg"
              >
                Guardar Plantilla
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 5: CONFIRMAR ELIMINACIÓN */}
      <Modal isOpen={!!deletingItem} onClose={() => setDeletingItem(null)} title="Confirmar Eliminación" size="sm">
        {deletingItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
              <ShieldAlert className="w-5 h-5 flex-shrink-0" />
              <span>¿Eliminar {deletingItem.type === 'user' ? 'al usuario' : 'el grupo'} <strong>{deletingItem.name}</strong>?</span>
            </div>
            <p className="text-xs text-slate-400">Esta acción no se puede deshacer.</p>
            <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-rose-600/20"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        )}
      </Modal>

    </AppLayout>
  );
}