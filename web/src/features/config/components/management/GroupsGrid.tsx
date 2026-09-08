import { Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { NeonContainer } from '@/shared/ui';
import type { GroupData } from '@/features/config/types';

interface Props {
  groups: GroupData[];
  onEdit: (group: GroupData) => void;
  onDelete: (group: GroupData) => void;
}

export function GroupsGrid({ groups, onEdit, onDelete }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {groups.map((group) => (
        <NeonContainer key={group.id} theme="blue" title={group.name} subtitle={`${group.members_count} miembro(s) asignado(s)`} icon={<ShieldCheck className="w-5 h-5" />}>
          <div className="flex flex-col justify-between h-full space-y-4">
            <p className="text-xs text-slate-400 min-h-[40px] leading-relaxed">{group.description || 'Sin descripción asignada para esta plantilla.'}</p>
            <div className="pt-4 border-t border-slate-800/80 flex justify-end gap-2">
              <button onClick={() => onEdit(group)} className="px-4 py-2 bg-surface-primary hover:bg-brand text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-800 flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Editar</button>
              <button onClick={() => onDelete(group)} className="p-2 bg-surface-primary hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        </NeonContainer>
      ))}
    </div>
  );
}
