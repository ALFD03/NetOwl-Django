import { PERMISSION_GROUPS } from '@/shared/constants/permissions';

interface Props {
  permissions: Record<string, boolean>;
  onChange: (permissions: Record<string, boolean>) => void;
}

export function PermissionEditor({ permissions, onChange }: Props) {
  const toggle = (key: string) => onChange({ ...permissions, [key]: !permissions[key] });

  return (
    <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
      {PERMISSION_GROUPS.map((group) => (
        <section key={group.category} className="rounded-2xl border border-slate-800 bg-surface-primary p-4">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">{group.category}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {group.perms.map((permission) => (
              <label key={permission.key} className="flex items-center gap-3 rounded-xl border border-slate-800/80 px-3 py-2 cursor-pointer hover:bg-white/5">
                <input type="checkbox" checked={Boolean(permissions[permission.key])} onChange={() => toggle(permission.key)} className="rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand" />
                <span className="text-xs text-slate-300">{permission.label}</span>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
