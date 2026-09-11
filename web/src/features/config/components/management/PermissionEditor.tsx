/** El editor de la matriz de permisos de una cuenta o de un grupo. */

import { PERMISSION_GROUPS } from '@/shared/constants/permissions';

interface Props {
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
  /** Los permisos se heredan de un grupo: se muestran, pero no se pueden editar. */
  disabled?: boolean;
}

export function PermissionEditor({ permissions, onChange, disabled = false }: Props) {
  const toggle = (key: string) => {
    if (disabled) return;
    onChange({ ...permissions, [key]: !permissions[key] });
  };

  return (
    <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
      {PERMISSION_GROUPS.map((group) => (
        <section key={group.category} className="rounded-2xl border border-slate-800 bg-surface-primary p-4">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{group.category}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {group.perms.map((permission) => (
              <label key={permission.key} className={`flex items-center gap-3 rounded-xl border border-slate-800/80 px-3 py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-white/5'}`}>
                <input type="checkbox" disabled={disabled} checked={Boolean(permissions[permission.key])} onChange={() => toggle(permission.key)} className="rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand disabled:opacity-50" />
                <span className="text-xs text-slate-300">{permission.label}</span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
