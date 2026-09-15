/** La tabla de cuentas, con su rol y su grupo. */

import { READONLY_TABLE, READONLY_TABLE_HEAD } from '@/shared/ui/data/tableClasses';
import { Key, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { NeonContainer } from '@/shared/ui';
import type { UserData } from '@/features/config/types';

interface Props {
  users: UserData[];
  onEdit: (user: UserData) => void;
  onChangePassword: (user: UserData) => void;
  onDelete: (user: UserData) => void;
}

export function UsersTable({ users, onEdit, onChangePassword, onDelete }: Props) {
  return (
    <NeonContainer theme="slate" title="Directorio de Cuentas de Acceso" subtitle="Administración de roles y grupos de privilegios" icon={<ShieldCheck className="w-5 h-5" />} noPadding={true}>
      <table className={READONLY_TABLE}>
        <thead className={READONLY_TABLE_HEAD}>
          <tr><th className="p-5">Usuario</th><th className="p-5">Rol en Sistema</th><th className="p-5">Grupo Asignado</th><th className="p-5 text-right">Acciones</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-white/5 transition-colors">
              <td className="p-5"><div className="flex items-center gap-2"><span className="font-bold text-white text-sm">{user.username}</span>{user.is_superuser && <span className="bg-brand/20 text-brand border border-brand/30 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase">Superuser</span>}</div></td>
              <td className="p-5"><span className="bg-surface-primary px-3 py-1 rounded-xl border border-slate-800 text-slate-300 font-semibold text-[11px]">{user.role_display}</span></td>
              <td className="p-5">{user.group_name ? <span className="text-sky-400 font-bold inline-flex items-center gap-1.5 bg-sky-950/40 border border-sky-500/30 px-3 py-1 rounded-full text-[11px]"><ShieldCheck className="w-3.5 h-3.5" /> {user.group_name}</span> : <span className="text-slate-500 italic">Personalizado</span>}</td>
              <td className="p-5 text-right space-x-2">
                <button onClick={() => onEdit(user)} className="p-2.5 bg-surface-primary hover:bg-brand hover:text-white rounded-xl text-slate-400 border border-slate-800 transition-colors" title="Editar Permisos"><Settings2 className="w-4 h-4" /></button>
                <button onClick={() => onChangePassword(user)} className="p-2.5 bg-surface-primary hover:bg-amber-500 hover:text-surface-primary rounded-xl text-slate-400 border border-slate-800 transition-colors" title="Cambiar Contraseña"><Key className="w-4 h-4" /></button>
                {!user.is_superuser && <button onClick={() => onDelete(user)} className="p-2.5 bg-surface-primary hover:bg-rose-600 hover:text-white rounded-xl text-slate-400 border border-slate-800 transition-colors" title="Eliminar Usuario"><Trash2 className="w-4 h-4" /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </NeonContainer>
  );
}
