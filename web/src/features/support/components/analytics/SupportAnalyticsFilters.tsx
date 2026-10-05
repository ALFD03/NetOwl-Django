/** Filtros de Analytics de soporte: periodo, grupo de trabajo y dimensión. */

import { Calendar } from 'lucide-react';

import { PeriodSelector, ToggleGroup } from '@/shared/ui';
import { formatInteger } from '@/shared/utils';
import { SUPPORT_DIMENSION_LABELS } from '../../lib/supportMetrics';
import { SUPPORT_DIMENSIONS, type SupportDimension, type SupportGroupOption } from '../../types';

interface Props {
  periods: string[];
  selectedPeriod: string;
  /** The period refetches from the server; group and dimension are local. */
  onPeriodChange: (period: string) => void;
  groups: SupportGroupOption[];
  selectedGroup: string;
  onGroupChange: (group: string) => void;
  selectedDimension: SupportDimension;
  onDimensionChange: (dimension: SupportDimension) => void;
}

function LabelledToggle({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-1 rounded-2xl border border-slate-700/50 bg-surface-secondary p-1.5 shadow-2xl sm:w-auto sm:max-w-full">
      <span className="shrink-0 border-r border-slate-800 px-3 text-[10px] font-black uppercase text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}

export function SupportAnalyticsFilters({
  periods,
  selectedPeriod,
  onPeriodChange,
  groups,
  selectedGroup,
  onGroupChange,
  selectedDimension,
  onDimensionChange,
}: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <PeriodSelector
        label="Periodo"
        icon={<Calendar className="h-4 w-4 text-brand" />}
        value={selectedPeriod}
        options={periods}
        onChange={onPeriodChange}
      />

      {groups.length > 0 && (
        <LabelledToggle label="Grupo">
          <ToggleGroup
            options={groups.map((group) => ({
              key: group.key,
              label: `${group.label} · ${formatInteger(group.totalTickets)}`,
            }))}
            activeKey={selectedGroup}
            onChange={onGroupChange}
          />
        </LabelledToggle>
      )}

      <LabelledToggle label="Dimensión">
        <ToggleGroup
          options={SUPPORT_DIMENSIONS.map((key) => ({ key, label: SUPPORT_DIMENSION_LABELS[key] }))}
          activeKey={selectedDimension}
          onChange={(key) => onDimensionChange(key as SupportDimension)}
        />
      </LabelledToggle>
    </div>
  );
}
