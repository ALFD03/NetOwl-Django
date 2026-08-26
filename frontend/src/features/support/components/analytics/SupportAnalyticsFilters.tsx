import { Calendar } from 'lucide-react';

import { PeriodSelector, ToggleGroup } from '@/shared/ui';
import { formatInteger } from '@/shared/utils/formatters';
import type { SupportGroupOption } from '../../types';

interface Props {
  periods: string[];
  selectedPeriod: string;
  /** Changing the period refetches from the server; the group is local. */
  onPeriodChange: (period: string) => void;
  groups: SupportGroupOption[];
  selectedGroup: string;
  onGroupChange: (group: string) => void;
}

export function SupportAnalyticsFilters({
  periods,
  selectedPeriod,
  onPeriodChange,
  groups,
  selectedGroup,
  onGroupChange,
}: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <PeriodSelector
        label="Periodo"
        icon={<Calendar className="h-4 w-4 text-brand" />}
        value={selectedPeriod}
        options={periods}
        onChange={onPeriodChange}
      />

      {groups.length > 0 && (
        <div className="flex items-center gap-1 rounded-2xl border border-slate-700/50 bg-surface-secondary p-1.5 shadow-2xl">
          <span className="border-r border-slate-800 px-3 text-[10px] font-black uppercase text-slate-500">
            Grupo
          </span>
          <ToggleGroup
            className="flex-wrap"
            options={groups.map((group) => ({
              key: group.key,
              label: `${group.label} · ${formatInteger(group.totalTickets)}`,
            }))}
            activeKey={selectedGroup}
            onChange={onGroupChange}
          />
        </div>
      )}
    </div>
  );
}
