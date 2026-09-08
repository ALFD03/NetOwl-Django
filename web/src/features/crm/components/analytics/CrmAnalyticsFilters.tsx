import { Calendar } from 'lucide-react';

import { PeriodSelector, ToggleGroup } from '@/shared/ui';
import { CRM_DIMENSION_LABELS, type CrmDimensionKey } from '@/shared/constants/labels';

const DIMENSION_OPTIONS = Object.entries(CRM_DIMENSION_LABELS).map(([key, label]) => ({ key, label }));

interface Props {
  periods: string[];
  selectedPeriod: string;
  /** Changing the period refetches from the server; the dimension is local. */
  onPeriodChange: (period: string) => void;
  selectedDimension: CrmDimensionKey;
  onDimensionChange: (dimension: CrmDimensionKey) => void;
}

export function CrmAnalyticsFilters({
  periods,
  selectedPeriod,
  onPeriodChange,
  selectedDimension,
  onDimensionChange,
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

      <div className="flex items-center gap-1 rounded-2xl border border-slate-700/50 bg-surface-secondary p-1.5 shadow-2xl">
        <span className="border-r border-slate-800 px-3 text-[10px] font-black uppercase text-slate-500">
          Analizar por
        </span>
        <ToggleGroup
          options={DIMENSION_OPTIONS}
          activeKey={selectedDimension}
          onChange={(key) => onDimensionChange(key as CrmDimensionKey)}
        />
      </div>
    </div>
  );
}
